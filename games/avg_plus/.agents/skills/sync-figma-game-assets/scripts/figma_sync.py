#!/usr/bin/env python3
"""Plan, stage, review, and promote name-indexed Figma assets safely."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import itertools
import json
import os
import re
import shutil
import struct
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
REVIEW_MANIFEST = "review-manifest.json"
FORBIDDEN_PERSISTENT_KEYS = {"nodeid", "node_id", "uuid"}


class SyncError(RuntimeError):
    """Raise a user-actionable synchronization error."""


def load_json(path: Path) -> Dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SyncError(f"JSON file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SyncError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise SyncError(f"Expected a JSON object in {path}")
    return value


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_project_path(root: Path, relative: str, label: str) -> Path:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise SyncError(f"{label} must be a relative path without '..': {relative}")
    resolved_root = root.resolve()
    resolved = (resolved_root / candidate).resolve()
    try:
        common = Path(os.path.commonpath([str(resolved_root), str(resolved)]))
    except ValueError as exc:
        raise SyncError(f"{label} escapes its root: {relative}") from exc
    if common != resolved_root:
        raise SyncError(f"{label} escapes its root: {relative}")
    return resolved


def validate_relative_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise SyncError(f"{label} must be a non-empty path string")
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise SyncError(f"{label} must be relative and must not contain '..'")
    return value


def paths_overlap(left: str, right: str) -> bool:
    left_parts = Path(left).parts
    right_parts = Path(right).parts
    shorter = min(len(left_parts), len(right_parts))
    return left_parts[:shorter] == right_parts[:shorter]


def parse_file_key(file_url: str) -> str:
    match = re.search(r"figma\.com/design/([^/?#]+)", file_url)
    if not match:
        raise SyncError("figma.fileUrl must be a Figma /design/ URL")
    return match.group(1)


def group_by_id(config: Mapping[str, Any], group_id: Optional[str]) -> Dict[str, Any]:
    groups = config.get("groups")
    if not isinstance(groups, list) or not groups:
        raise SyncError("config.groups must be a non-empty array")
    if group_id is None:
        if len(groups) != 1:
            raise SyncError("--group is required when more than one resource group is configured")
        group = groups[0]
    else:
        matches = [item for item in groups if isinstance(item, dict) and item.get("id") == group_id]
        if len(matches) != 1:
            raise SyncError(f"Expected exactly one configured group named {group_id!r}")
        group = matches[0]
    if not isinstance(group, dict):
        raise SyncError("Every group must be a JSON object")
    return group


def dimension_values(dimension: Mapping[str, Any]) -> List[str]:
    if isinstance(dimension.get("values"), list):
        values = dimension["values"]
        if not values or not all(isinstance(item, str) and item for item in values):
            raise SyncError("Matrix dimension values must be non-empty strings")
        return list(values)
    range_value = dimension.get("range")
    if isinstance(range_value, dict):
        start = range_value.get("start")
        end = range_value.get("end")
        width = range_value.get("width", 0)
        if not all(isinstance(item, int) for item in (start, end, width)) or start > end or width < 0:
            raise SyncError("Matrix range requires integer start <= end and width >= 0")
        return [str(value).zfill(width) for value in range(start, end + 1)]
    raise SyncError("Each matrix dimension needs values or range")


def validate_config(config: Mapping[str, Any]) -> None:
    if config.get("schemaVersion") != 1:
        raise SyncError("config.schemaVersion must be 1")
    figma = config.get("figma")
    if not isinstance(figma, dict):
        raise SyncError("config.figma must be an object")
    parse_file_key(str(figma.get("fileUrl", "")))
    validate_relative_path(config.get("lockFile"), "config.lockFile")
    validate_relative_path(config.get("temporaryDirectory"), "config.temporaryDirectory")

    download = config.get("download", {})
    if not isinstance(download, dict):
        raise SyncError("config.download must be an object")
    allowed_hosts = download.get("allowedHosts", ["www.figma.com"])
    if not isinstance(allowed_hosts, list) or not allowed_hosts or not all(
        isinstance(item, str) and item for item in allowed_hosts
    ):
        raise SyncError("download.allowedHosts must be a non-empty string array")
    max_concurrency = download.get("maxConcurrency", 4)
    if not isinstance(max_concurrency, int) or not 1 <= max_concurrency <= 4:
        raise SyncError("download.maxConcurrency must be an integer from 1 through 4")

    groups = config.get("groups")
    if not isinstance(groups, list) or not groups:
        raise SyncError("config.groups must be a non-empty array")
    seen_groups = set()
    for group in groups:
        if not isinstance(group, dict):
            raise SyncError("Every group must be an object")
        group_id = group.get("id")
        if not isinstance(group_id, str) or not group_id or group_id in seen_groups:
            raise SyncError(f"Group IDs must be unique non-empty strings: {group_id!r}")
        seen_groups.add(group_id)
        source_path = group.get("sourcePath")
        if not isinstance(source_path, list) or not source_path or not all(
            isinstance(item, str) and item for item in source_path
        ):
            raise SyncError(f"groups[{group_id}].sourcePath must be a non-empty string array")
        if not isinstance(group.get("matchPrefix"), str) or not group["matchPrefix"]:
            raise SyncError(f"groups[{group_id}].matchPrefix must be a non-empty string")
        output_root = validate_relative_path(group.get("outputRoot"), f"groups[{group_id}].outputRoot")
        review_root = validate_relative_path(group.get("reviewRoot"), f"groups[{group_id}].reviewRoot")
        if paths_overlap(output_root, review_root):
            raise SyncError(f"groups[{group_id}] outputRoot and reviewRoot must not overlap")
        catalog = group.get("catalog")
        if not isinstance(catalog, dict):
            raise SyncError(f"groups[{group_id}].catalog must be an object")
        catalog_path = validate_relative_path(catalog.get("path"), f"groups[{group_id}].catalog.path")
        output_parts = Path(output_root).parts
        if Path(catalog_path).parts[: len(output_parts)] != output_parts:
            raise SyncError(f"groups[{group_id}].catalog.path must be inside outputRoot")
        if catalog.get("schemaVersion") != 2:
            raise SyncError(f"groups[{group_id}].catalog.schemaVersion must be 2")
        size = group.get("expectedSize")
        if not isinstance(size, dict) or not all(
            isinstance(size.get(key), int) and size[key] > 0 for key in ("width", "height")
        ):
            raise SyncError(f"groups[{group_id}].expectedSize must contain positive integer width/height")
        node_types = group.get("nodeTypes")
        if not isinstance(node_types, list) or not node_types or not all(
            isinstance(item, str) and item for item in node_types
        ):
            raise SyncError(f"groups[{group_id}].nodeTypes must be a non-empty string array")
        container_types = group.get("containerNodeTypes", ["frame", "section", "group"])
        if not isinstance(container_types, list) or not container_types or not all(
            isinstance(item, str) and item for item in container_types
        ):
            raise SyncError(f"groups[{group_id}].containerNodeTypes must be a non-empty string array")
        if group.get("downloadSource") not in ("renderedExport", "singleRawImage"):
            raise SyncError(f"groups[{group_id}].downloadSource must be renderedExport or singleRawImage")
        if group.get("transparency") not in ("optional", "required", "opaque"):
            raise SyncError(f"groups[{group_id}].transparency must be optional, required, or opaque")

        rules = group.get("rules")
        if not isinstance(rules, list) or not rules:
            raise SyncError(f"groups[{group_id}].rules must be a non-empty array")
        seen_rules = set()
        for rule in rules:
            if not isinstance(rule, dict):
                raise SyncError(f"groups[{group_id}] contains a non-object rule")
            rule_id = rule.get("id")
            if not isinstance(rule_id, str) or not rule_id or rule_id in seen_rules:
                raise SyncError(f"Rule IDs must be unique in group {group_id}: {rule_id!r}")
            seen_rules.add(rule_id)
            try:
                compiled = re.compile(str(rule.get("pattern", "")))
            except re.error as exc:
                raise SyncError(f"Invalid regex for rule {rule_id}: {exc}") from exc
            for key in ("kind", "semanticId", "output", "resourcePath", "catalogSection"):
                if not isinstance(rule.get(key), str) or not rule[key]:
                    raise SyncError(f"Rule {rule_id}.{key} must be a non-empty string")
            for relation in rule.get("relations", []):
                if not isinstance(relation, dict):
                    raise SyncError(f"Rule {rule_id} has a non-object relation")
                left = relation.get("from")
                right = relation.get("to")
                if left not in compiled.groupindex or right not in compiled.groupindex:
                    raise SyncError(f"Rule {rule_id} relation captures must exist in its pattern")
                if not isinstance(relation.get("map"), dict):
                    raise SyncError(f"Rule {rule_id} relation map must be an object")
            matrix = rule.get("matrix")
            if matrix is not None:
                if not isinstance(matrix, dict) or not isinstance(matrix.get("dimensions"), list):
                    raise SyncError(f"Rule {rule_id}.matrix.dimensions must be an array")
                for dimension in matrix["dimensions"]:
                    if not isinstance(dimension, dict) or dimension.get("capture") not in compiled.groupindex:
                        raise SyncError(f"Rule {rule_id} matrix capture must exist in its pattern")
                    dimension_values(dimension)


def config_digest(config: Mapping[str, Any]) -> str:
    return sha256_bytes(canonical_json_bytes(config))


def clean_xml_text(text: str) -> str:
    start = text.find("<")
    if start < 0:
        raise SyncError("Metadata does not contain XML")
    end_marker = text.find("\nIMPORTANT:", start)
    if end_marker >= 0:
        text = text[:end_marker]
    return text[start:].strip()


def parse_xml(text: str) -> ET.Element:
    try:
        return ET.fromstring(clean_xml_text(text))
    except ET.ParseError as exc:
        raise SyncError(f"Could not parse Figma metadata XML: {exc}") from exc


def locate_page(metadata_text: str, page_name: str) -> Dict[str, Any]:
    matches = []
    for line in metadata_text.splitlines():
        match = re.match(r"^-\s+(\d+:\d+):\s+(.+?)\s*$", line)
        if match and match.group(2) == page_name:
            matches.append({"nodeId": match.group(1), "name": match.group(2)})
    if len(matches) != 1:
        raise SyncError(f"Expected one top-level page named {page_name!r}, found {len(matches)}")
    return matches[0]


def locate_source(metadata_text: str, group: Mapping[str, Any], depth: int) -> Dict[str, Any]:
    source_path = group["sourcePath"]
    if depth < 0 or depth >= len(source_path):
        raise SyncError(f"sourcePath depth must be from 0 through {len(source_path) - 1}")
    target_name = source_path[depth]
    if depth == 0:
        result = locate_page(metadata_text, target_name)
    else:
        root = parse_xml(metadata_text)
        expected_parent = source_path[depth - 1]
        if root.attrib.get("name") != expected_parent:
            raise SyncError(
                f"Metadata root must be sourcePath parent {expected_parent!r}, got {root.attrib.get('name')!r}"
            )
        allowed = set(group.get("containerNodeTypes", ["frame", "section", "group"]))
        matches = []
        for node in list(root):
            if node.tag in allowed and node.attrib.get("name") == target_name and node.attrib.get("id"):
                matches.append({"nodeId": node.attrib["id"], "name": target_name, "nodeType": node.tag})
        if len(matches) != 1:
            raise SyncError(
                f"Expected one direct child named {target_name!r} below {expected_parent!r}, found {len(matches)}"
            )
        result = matches[0]
    return {**result, "depth": depth, "complete": depth == len(source_path) - 1}


def render_template(template: str, context: Mapping[str, Any], label: str) -> str:
    try:
        result = template.format_map(dict(context))
    except KeyError as exc:
        raise SyncError(f"{label} references missing field {exc.args[0]!r}") from exc
    if not result:
        raise SyncError(f"{label} rendered to an empty string")
    return result


def transform_catalog_fields(rule: Mapping[str, Any], captures: Mapping[str, str]) -> Dict[str, Any]:
    output: Dict[str, Any] = {}
    fields = rule.get("catalogFields", {})
    if not isinstance(fields, dict):
        raise SyncError(f"Rule {rule.get('id')} catalogFields must be an object")
    for field_name, spec in fields.items():
        if not isinstance(spec, dict):
            raise SyncError(f"Catalog field {field_name} must be an object")
        if "value" in spec:
            output[field_name] = spec["value"]
            continue
        source = spec.get("capture")
        if not isinstance(source, str):
            raise SyncError(f"Catalog field {field_name} needs capture or value")
        if source not in captures:
            if spec.get("optional"):
                continue
            raise SyncError(f"Catalog field {field_name} references missing capture {source}")
        value: Any = captures[source]
        mapping = spec.get("map")
        if mapping is not None:
            if not isinstance(mapping, dict) or value not in mapping:
                raise SyncError(f"Catalog field {field_name} has no mapping for {value!r}")
            value = mapping[value]
        if spec.get("type") == "int":
            try:
                value = int(value)
            except (TypeError, ValueError) as exc:
                raise SyncError(f"Catalog field {field_name} cannot convert {value!r} to int") from exc
        output[field_name] = value
    return output


def parse_number(value: Optional[str], label: str) -> int:
    try:
        number = float(value if value is not None else "")
    except ValueError as exc:
        raise SyncError(f"Invalid numeric {label}: {value!r}") from exc
    if not number.is_integer():
        raise SyncError(f"Expected integer {label}, got {value!r}")
    return int(number)


def validate_relations(rule: Mapping[str, Any], captures: Mapping[str, str], name: str) -> None:
    for relation in rule.get("relations", []):
        left = captures.get(relation["from"])
        right = captures.get(relation["to"])
        expected = relation["map"].get(left)
        if expected != right:
            raise SyncError(
                f"{name}: expected {relation['to']}={expected!r} for {relation['from']}={left!r}, got {right!r}"
            )


def parse_asset_definition(
    group: Mapping[str, Any],
    name: str,
    width: int,
    height: int,
    node_id: Optional[str] = None,
    node_type: Optional[str] = None,
) -> Dict[str, Any]:
    if not name.startswith(group["matchPrefix"]):
        raise SyncError(f"Asset {name!r} does not start with {group['matchPrefix']!r}")
    if Path(name).name != name or "/" in name or "\\" in name or name in (".", ".."):
        raise SyncError(f"Asset name is not a safe filename: {name!r}")
    matches = []
    for rule in group["rules"]:
        match = re.fullmatch(rule["pattern"], name)
        if match is not None:
            matches.append((rule, match))
    if len(matches) != 1:
        raise SyncError(f"Component {name!r} matched {len(matches)} configured rules")
    expected_width = group["expectedSize"]["width"]
    expected_height = group["expectedSize"]["height"]
    if (width, height) != (expected_width, expected_height):
        raise SyncError(f"{name}: expected {expected_width}x{expected_height}, got {width}x{height}")
    rule, match = matches[0]
    captures = {key: value for key, value in match.groupdict().items() if value is not None}
    context: Dict[str, Any] = {"name": name, **captures}
    validate_relations(rule, captures, name)
    semantic_id = render_template(rule["semanticId"], context, f"Rule {rule['id']} semanticId")
    relative_output = render_template(rule["output"], context, f"Rule {rule['id']} output")
    resource_path = render_template(rule["resourcePath"], context, f"Rule {rule['id']} resourcePath")
    output_path = Path(relative_output)
    if output_path.is_absolute() or ".." in output_path.parts:
        raise SyncError(f"{name}: output path escapes its group: {relative_output}")
    local_path = str(Path(group["outputRoot"]) / output_path)
    if not local_path.endswith(".png"):
        raise SyncError(f"{name}: output path must end in .png")
    asset: Dict[str, Any] = {
        "group": group["id"],
        "rule": rule["id"],
        "name": name,
        "kind": rule["kind"],
        "semanticId": semantic_id,
        "width": width,
        "height": height,
        "localPath": local_path,
        "resourcePath": resource_path,
        "catalogSection": rule["catalogSection"],
        "catalogFields": transform_catalog_fields(rule, captures),
        "_captures": captures,
    }
    if node_id is not None:
        asset["nodeId"] = node_id
    if node_type is not None:
        asset["nodeType"] = node_type
    return asset


def validate_asset_collection(group: Mapping[str, Any], assets: Sequence[Mapping[str, Any]]) -> None:
    names = set()
    semantic_ids = set()
    local_paths = set()
    captures_by_rule: Dict[str, List[Mapping[str, str]]] = {rule["id"]: [] for rule in group["rules"]}
    for asset in assets:
        name = asset["name"]
        if name in names:
            raise SyncError(f"Duplicate Figma component name: {name}")
        if asset["semanticId"] in semantic_ids:
            raise SyncError(f"Duplicate semantic ID: {asset['semanticId']}")
        if asset["localPath"] in local_paths:
            raise SyncError(f"Duplicate local output path: {asset['localPath']}")
        names.add(name)
        semantic_ids.add(asset["semanticId"])
        local_paths.add(asset["localPath"])
        captures_by_rule[asset["rule"]].append(asset["_captures"])

    for rule in group["rules"]:
        observed_captures = captures_by_rule[rule["id"]]
        if rule.get("required") is True and len(observed_captures) != 1:
            raise SyncError(f"Rule {rule['id']} requires exactly one component, found {len(observed_captures)}")
        matrix = rule.get("matrix")
        if not isinstance(matrix, dict):
            continue
        dimensions = matrix["dimensions"]
        keys = [dimension["capture"] for dimension in dimensions]
        expected = set(itertools.product(*(dimension_values(dimension) for dimension in dimensions)))
        observed = {tuple(item.get(key, "") for key in keys) for item in observed_captures}
        missing = sorted(expected - observed)
        extra = sorted(observed - expected)
        if missing:
            raise SyncError(f"Rule {rule['id']} is missing required combinations: {missing}")
        if extra and not matrix.get("allowAdditional", False):
            raise SyncError(f"Rule {rule['id']} contains unexpected combinations: {extra}")
    if not assets:
        raise SyncError(f"No configured assets found below {' / '.join(group['sourcePath'])}")


def public_asset(asset: Mapping[str, Any], include_node: bool = True) -> Dict[str, Any]:
    output = {key: value for key, value in asset.items() if not key.startswith("_")}
    if not include_node:
        output.pop("nodeId", None)
        output.pop("nodeType", None)
    return output


def plan_group(config: Mapping[str, Any], group: Mapping[str, Any], metadata_text: str) -> Dict[str, Any]:
    root = parse_xml(metadata_text)
    allowed_containers = set(group.get("containerNodeTypes", ["frame", "section", "group"]))
    expected_root = group["sourcePath"][-1]
    if root.tag not in allowed_containers or root.attrib.get("name") != expected_root:
        raise SyncError(
            f"Metadata root must be configured directory {expected_root!r}, got {root.tag} {root.attrib.get('name')!r}"
        )
    assets: List[Dict[str, Any]] = []
    allowed_types = set(group["nodeTypes"])
    for node in root.iter():
        if node.tag not in allowed_types:
            continue
        name = node.attrib.get("name", "")
        if not name.startswith(group["matchPrefix"]):
            continue
        node_id = node.attrib.get("id")
        if not node_id:
            raise SyncError(f"Component {name!r} is missing a Figma node ID")
        width = parse_number(node.attrib.get("width"), f"width for {name}")
        height = parse_number(node.attrib.get("height"), f"height for {name}")
        assets.append(parse_asset_definition(group, name, width, height, node_id, node.tag))
    validate_asset_collection(group, assets)
    return {
        "schemaVersion": 2,
        "configDigest": config_digest(config),
        "fileKey": parse_file_key(config["figma"]["fileUrl"]),
        "sourcePath": list(group["sourcePath"]),
        "sourceNodeId": root.attrib.get("id"),
        "group": group["id"],
        "assets": sorted((public_asset(item) for item in assets), key=lambda item: item["localPath"]),
    }


def inspect_png(path: Path) -> Tuple[int, int]:
    try:
        header = path.read_bytes()[:24]
    except OSError as exc:
        raise SyncError(f"Cannot read PNG {path.name}: {exc}") from exc
    if len(header) < 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise SyncError(f"PNG {path.name} is not a valid PNG")
    return struct.unpack(">II", header[16:24])


def _paeth(left: int, up: int, upper_left: int) -> int:
    estimate = left + up - upper_left
    distances = (abs(estimate - left), abs(estimate - up), abs(estimate - upper_left))
    if distances[0] <= distances[1] and distances[0] <= distances[2]:
        return left
    if distances[1] <= distances[2]:
        return up
    return upper_left


def inspect_png_transparency(path: Path) -> Dict[str, int]:
    """Decode non-interlaced 8-bit grayscale/RGBA scanlines and count alpha values."""
    import zlib

    data = path.read_bytes()
    if data[:8] != PNG_SIGNATURE:
        raise SyncError(f"PNG {path.name} is not a valid PNG")
    position = 8
    width = height = bit_depth = color_type = interlace = None
    compressed = bytearray()
    while position + 12 <= len(data):
        length = struct.unpack(">I", data[position : position + 4])[0]
        chunk_type = data[position + 4 : position + 8]
        chunk_data = data[position + 8 : position + 8 + length]
        position += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    if None in (width, height, bit_depth, color_type, interlace):
        raise SyncError(f"PNG {path.name} has no valid IHDR")
    if bit_depth != 8 or interlace != 0 or color_type not in (4, 6):
        return {"transparent": 0, "partial": 0, "opaque": int(width) * int(height), "hasAlpha": 0}
    bytes_per_pixel = 2 if color_type == 4 else 4
    stride = int(width) * bytes_per_pixel
    try:
        scanlines = zlib.decompress(bytes(compressed))
    except zlib.error as exc:
        raise SyncError(f"PNG {path.name} has invalid compressed pixels") from exc
    if len(scanlines) != int(height) * (stride + 1):
        raise SyncError(f"PNG {path.name} has unexpected scanline length")

    previous = bytearray(stride)
    transparent = partial = opaque = 0
    offset = 0
    for _ in range(int(height)):
        filter_type = scanlines[offset]
        source = scanlines[offset + 1 : offset + 1 + stride]
        offset += stride + 1
        row = bytearray(stride)
        for index, value in enumerate(source):
            left = row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            up = previous[index]
            upper_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = up
            elif filter_type == 3:
                predictor = (left + up) // 2
            elif filter_type == 4:
                predictor = _paeth(left, up, upper_left)
            else:
                raise SyncError(f"PNG {path.name} uses unsupported filter {filter_type}")
            row[index] = (value + predictor) & 0xFF
        for alpha in row[bytes_per_pixel - 1 :: bytes_per_pixel]:
            if alpha == 0:
                transparent += 1
            elif alpha == 255:
                opaque += 1
            else:
                partial += 1
        previous = row
    return {"transparent": transparent, "partial": partial, "opaque": opaque, "hasAlpha": 1}


def validate_transparency(path: Path, policy: str) -> Dict[str, int]:
    alpha = inspect_png_transparency(path)
    non_opaque = alpha["transparent"] + alpha["partial"]
    if policy == "required" and (not alpha["hasAlpha"] or non_opaque == 0):
        raise SyncError(f"{path.name}: PNG must contain transparent or partially transparent pixels")
    if policy == "opaque" and non_opaque != 0:
        raise SyncError(f"{path.name}: PNG must be fully opaque")
    return alpha


def download_export(
    export: Mapping[str, Any],
    destination: Path,
    allowed_hosts: Sequence[str],
    timeout: int,
    retries: int,
) -> None:
    if str(export.get("format", "")).lower() != "png":
        raise SyncError(f"Node {export.get('nodeId')} export format must be png")
    source_path = export.get("sourcePath")
    if isinstance(source_path, str):
        source = Path(source_path)
        if not source.is_file():
            raise SyncError(f"Downloaded source file not found for node {export.get('nodeId')}")
        shutil.copy2(source, destination)
        return
    url = export.get("url")
    if not isinstance(url, str):
        raise SyncError(f"Node {export.get('nodeId')} needs url or sourcePath")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise SyncError(f"Node {export.get('nodeId')} export URL host is not allowed")
    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "avg-plus-figma-sync/2"})
            with urllib.request.urlopen(request, timeout=timeout) as response, destination.open("wb") as handle:
                shutil.copyfileobj(response, handle)
            return
        except Exception as exc:  # Never leak signed URL details through exception text.
            last_error = exc
            destination.unlink(missing_ok=True)
            if attempt < retries:
                time.sleep(0.5 * (2**attempt))
    raise SyncError(f"Failed to download export for node {export.get('nodeId')} after {retries + 1} attempts") from last_error


def load_exports(path_value: str) -> List[Dict[str, Any]]:
    if path_value == "-":
        try:
            document = json.load(sys.stdin)
        except json.JSONDecodeError as exc:
            raise SyncError(f"Invalid exports JSON on stdin: {exc}") from exc
    else:
        document = load_json(Path(path_value))
    if not isinstance(document, dict) or not isinstance(document.get("exports"), list):
        raise SyncError("exports JSON must contain an exports array")
    seen = set()
    output = []
    for item in document["exports"]:
        if not isinstance(item, dict) or not isinstance(item.get("nodeId"), str):
            raise SyncError("Every export must contain a string nodeId")
        if item["nodeId"] in seen:
            raise SyncError(f"Duplicate export nodeId: {item['nodeId']}")
        seen.add(item["nodeId"])
        output.append(item)
    return output


def prepare_downloads(
    root: Path,
    config: Mapping[str, Any],
    plan: Mapping[str, Any],
    exports: Sequence[Mapping[str, Any]],
) -> Tuple[Path, List[Dict[str, Any]], Dict[str, Path]]:
    validate_config(config)
    if plan.get("schemaVersion") != 2:
        raise SyncError("plan.schemaVersion must be 2")
    if plan.get("configDigest") != config_digest(config):
        raise SyncError("Config changed after the plan was generated; discover and plan again")
    group = group_by_id(config, str(plan.get("group")))
    if plan.get("sourcePath") != group["sourcePath"]:
        raise SyncError("Plan sourcePath does not match current group configuration")
    plan_assets = plan.get("assets")
    if not isinstance(plan_assets, list) or not plan_assets:
        raise SyncError("Plan contains no assets")
    planned_ids = {item.get("nodeId") for item in plan_assets}
    if None in planned_ids or len(planned_ids) != len(plan_assets):
        raise SyncError("Plan asset node IDs must be present and unique inside the temporary plan")
    by_node = {item["nodeId"]: item for item in exports}
    if set(by_node) != planned_ids:
        missing = sorted(planned_ids - set(by_node))
        extra = sorted(set(by_node) - planned_ids)
        raise SyncError(f"Exports do not match the plan; missing={missing}, extra={extra}")
    expected_source_kind = group["downloadSource"]
    for node_id, export in by_node.items():
        if export.get("sourceKind") != expected_source_kind:
            raise SyncError(
                f"Node {node_id} sourceKind must be {expected_source_kind}, got {export.get('sourceKind')!r}"
            )

    temp_root = safe_project_path(root, config["temporaryDirectory"], "temporaryDirectory")
    temp_root.mkdir(parents=True, exist_ok=True)
    run_root = Path(tempfile.mkdtemp(prefix="run-", dir=temp_root))
    download_root = run_root / "downloads"
    download_root.mkdir()
    allowed_hosts = config.get("download", {}).get("allowedHosts", ["www.figma.com"])
    max_workers = int(config.get("download", {}).get("maxConcurrency", 4))
    timeout = int(config.get("download", {}).get("timeoutSeconds", 30))
    retries = int(config.get("download", {}).get("retries", 2))
    staged_by_name: Dict[str, Path] = {}
    alpha_by_name: Dict[str, Dict[str, int]] = {}

    def stage_one(index: int, asset: Mapping[str, Any]) -> Tuple[str, Path, Dict[str, int]]:
        destination = download_root / f"{index:04d}-{asset['name']}.png"
        download_export(by_node[asset["nodeId"]], destination, allowed_hosts, timeout, retries)
        dimensions = inspect_png(destination)
        if dimensions != (asset["width"], asset["height"]):
            raise SyncError(
                f"{asset['name']}: downloaded PNG is {dimensions[0]}x{dimensions[1]}, "
                f"expected {asset['width']}x{asset['height']}"
            )
        return asset["name"], destination, validate_transparency(destination, group["transparency"])

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(stage_one, index, asset) for index, asset in enumerate(plan_assets)]
            for future in concurrent.futures.as_completed(futures):
                name, destination, alpha = future.result()
                staged_by_name[name] = destination
                alpha_by_name[name] = alpha
        active_assets = []
        for asset in plan_assets:
            alpha = alpha_by_name[asset["name"]]
            active_assets.append(
                {
                    **public_asset(asset, include_node=False),
                    "sha256": sha256_file(staged_by_name[asset["name"]]),
                    "alpha": alpha,
                    "hasTransparency": alpha["transparent"] + alpha["partial"] > 0,
                    "status": "active",
                }
            )
        reparsed = [
            parse_asset_definition(group, item["name"], item["width"], item["height"])
            for item in active_assets
        ]
        validate_asset_collection(group, reparsed)
        return run_root, active_assets, staged_by_name
    except Exception:
        shutil.rmtree(run_root, ignore_errors=True)
        raise


def read_existing_lock(lock_path: Path) -> Dict[str, Any]:
    if not lock_path.exists():
        return {"schemaVersion": 2, "assets": {}}
    lock = load_json(lock_path)
    version = lock.get("schemaVersion")
    assets = lock.get("assets")
    if version == 1 and isinstance(assets, list):
        return lock
    if version == 2 and isinstance(assets, dict):
        return lock
    raise SyncError(f"Unsupported or malformed lock file: {lock_path}")


def lock_entries(lock: Mapping[str, Any]) -> List[Dict[str, Any]]:
    assets = lock.get("assets")
    if isinstance(assets, list):
        return [dict(item) for item in assets if isinstance(item, dict)]
    if isinstance(assets, dict):
        entries = []
        for name, item in assets.items():
            if not isinstance(name, str) or not isinstance(item, dict):
                raise SyncError("Lock assets must map string names to objects")
            entries.append({"name": name, **item})
        return entries
    raise SyncError("Lock assets must be an array (v1) or name-indexed object (v2)")


def diff_against_formal(
    root: Path,
    group: Mapping[str, Any],
    active_assets: Sequence[Mapping[str, Any]],
    old_entries: Sequence[Mapping[str, Any]],
) -> Dict[str, List[str]]:
    old_by_name = {item.get("name"): item for item in old_entries if isinstance(item.get("name"), str)}
    result: Dict[str, List[str]] = {"added": [], "changed": [], "unchanged": [], "stale": []}
    for asset in active_assets:
        old = old_by_name.get(asset["name"])
        if old and old.get("group") != group["id"]:
            raise SyncError(f"Persistent asset name is already owned by another group: {asset['name']}")
        if old and old.get("localPath") != asset["localPath"]:
            raise SyncError(
                f"{asset['name']}: configured localPath changed from {old.get('localPath')} "
                f"to {asset['localPath']}; migrate the named asset explicitly"
            )
        target = safe_project_path(root, asset["localPath"], f"localPath for {asset['name']}")
        if not target.exists():
            result["added"].append(asset["name"])
        elif sha256_file(target) != asset["sha256"]:
            result["changed"].append(asset["name"])
        else:
            result["unchanged"].append(asset["name"])
    current_names = {item["name"] for item in active_assets}
    result["stale"] = sorted(
        item["name"]
        for item in old_entries
        if item.get("group") == group["id"] and item.get("name") not in current_names and isinstance(item.get("name"), str)
    )
    for key in result:
        result[key] = sorted(result[key])
    return result


def relative_output_path(group: Mapping[str, Any], asset: Mapping[str, Any]) -> str:
    try:
        relative = Path(asset["localPath"]).relative_to(Path(group["outputRoot"]))
    except ValueError as exc:
        raise SyncError(f"{asset['name']}: localPath is outside outputRoot") from exc
    if relative.is_absolute() or ".." in relative.parts:
        raise SyncError(f"{asset['name']}: invalid relative review path")
    return str(relative)


def ensure_no_forbidden_keys(value: Any, label: str, trail: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in FORBIDDEN_PERSISTENT_KEYS:
                raise SyncError(f"{label} contains forbidden persistent key at {trail}.{key}")
            ensure_no_forbidden_keys(child, label, f"{trail}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            ensure_no_forbidden_keys(child, label, f"{trail}[{index}]")


def build_review_manifest(
    group: Mapping[str, Any],
    active_assets: Sequence[Mapping[str, Any]],
    diff: Mapping[str, Sequence[str]],
    digest: str,
) -> Dict[str, Any]:
    assets: Dict[str, Any] = {}
    for asset in sorted(active_assets, key=lambda item: item["name"]):
        assets[asset["name"]] = {
            "id": asset["semanticId"],
            "kind": asset["kind"],
            "catalogFields": asset["catalogFields"],
            "reviewPath": relative_output_path(group, asset),
            "targetPath": asset["localPath"],
            "resourcePath": asset["resourcePath"],
            "width": asset["width"],
            "height": asset["height"],
            "sha256": asset["sha256"],
            "alpha": asset["alpha"],
        }
    manifest = {
        "schemaVersion": 1,
        "type": "figma-asset-review",
        "group": group["id"],
        "stagedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "configDigest": digest,
        "sourcePath": list(group["sourcePath"]),
        "downloadSource": group["downloadSource"],
        "transparency": group["transparency"],
        "expectedSize": dict(group["expectedSize"]),
        "total": len(active_assets),
        "diff": {key: list(diff[key]) for key in ("added", "changed", "unchanged", "stale")},
        "checklist": [
            f"确认全部 {len(active_assets)} 张牌的图案、花色、数字、wild 和背面均正确。",
            "确认四角及牌面外背景透明，没有白色画布。",
            "确认后明确回复‘确认覆盖’，再执行 promote；未确认前禁止构建或发布。",
        ],
        "assets": assets,
    }
    ensure_no_forbidden_keys(manifest, "Review manifest")
    return manifest


def summary_from_diff(group: Mapping[str, Any], diff: Mapping[str, Sequence[str]], total: int) -> Dict[str, Any]:
    return {
        "group": group["id"],
        "total": total,
        "added": len(diff["added"]),
        "changed": len(diff["changed"]),
        "unchanged": len(diff["unchanged"]),
        "stale": len(diff["stale"]),
    }


def stage_review(
    root: Path,
    config: Mapping[str, Any],
    plan: Mapping[str, Any],
    exports: Sequence[Mapping[str, Any]],
    dry_run: bool = False,
) -> Dict[str, Any]:
    validate_config(config)
    group = group_by_id(config, str(plan.get("group")))
    review_root = safe_project_path(root, group["reviewRoot"], "reviewRoot")
    if review_root.exists() and not dry_run:
        raise SyncError(
            f"Pending review already exists at {group['reviewRoot']}; promote or explicitly discard it before staging again"
        )
    run_root, active_assets, staged_by_name = prepare_downloads(root, config, plan, exports)
    try:
        lock_path = safe_project_path(root, config["lockFile"], "lockFile")
        old_entries = lock_entries(read_existing_lock(lock_path))
        diff = diff_against_formal(root, group, active_assets, old_entries)
        summary = {
            **summary_from_diff(group, diff, len(active_assets)),
            "dryRun": dry_run,
            "reviewRoot": group["reviewRoot"],
        }
        if dry_run:
            return summary
        candidate = run_root / "review"
        for asset in active_assets:
            relative = relative_output_path(group, asset)
            destination = safe_project_path(candidate, relative, f"reviewPath for {asset['name']}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged_by_name[asset["name"]], destination)
        manifest = build_review_manifest(group, active_assets, diff, config_digest(config))
        (candidate / REVIEW_MANIFEST).write_bytes(canonical_json_bytes(manifest))
        review_root.parent.mkdir(parents=True, exist_ok=True)
        if review_root.exists():
            raise SyncError(f"Pending review appeared while staging at {group['reviewRoot']}; nothing was overwritten")
        try:
            os.rename(candidate, review_root)
        except OSError as exc:
            raise SyncError(f"Could not publish review directory without overwriting it: {exc}") from exc
        summary["manifest"] = str(Path(group["reviewRoot"]) / REVIEW_MANIFEST)
        summary["pendingConfirmation"] = True
        return summary
    finally:
        shutil.rmtree(run_root, ignore_errors=True)


def validate_review(
    root: Path,
    config: Mapping[str, Any],
    group: Mapping[str, Any],
) -> Tuple[Path, Dict[str, Any], List[Dict[str, Any]]]:
    review_root = safe_project_path(root, group["reviewRoot"], "reviewRoot")
    manifest_path = review_root / REVIEW_MANIFEST
    manifest = load_json(manifest_path)
    ensure_no_forbidden_keys(manifest, "Review manifest")
    if manifest.get("schemaVersion") != 1 or manifest.get("type") != "figma-asset-review":
        raise SyncError("Unsupported or malformed review manifest")
    if manifest.get("group") != group["id"]:
        raise SyncError("Review manifest group does not match the requested group")
    if manifest.get("configDigest") != config_digest(config):
        raise SyncError("Config changed after staging; discard the review and stage again")
    if manifest.get("sourcePath") != group["sourcePath"]:
        raise SyncError("Review sourcePath does not match current configuration")
    if manifest.get("downloadSource") != group["downloadSource"]:
        raise SyncError("Review downloadSource does not match current configuration")
    if manifest.get("transparency") != group["transparency"]:
        raise SyncError("Review transparency policy does not match current configuration")
    entries = manifest.get("assets")
    if not isinstance(entries, dict) or not entries:
        raise SyncError("Review manifest assets must be a non-empty name-indexed object")

    parsed_assets = []
    active_assets = []
    expected_pngs = set()
    for name, entry in entries.items():
        if not isinstance(name, str) or not isinstance(entry, dict):
            raise SyncError("Review manifest assets must map names to objects")
        parsed = parse_asset_definition(
            group,
            name,
            group["expectedSize"]["width"],
            group["expectedSize"]["height"],
        )
        parsed_assets.append(parsed)
        expected_review_path = relative_output_path(group, parsed)
        expected_values = {
            "id": parsed["semanticId"],
            "kind": parsed["kind"],
            "catalogFields": parsed["catalogFields"],
            "reviewPath": expected_review_path,
            "targetPath": parsed["localPath"],
            "resourcePath": parsed["resourcePath"],
            "width": parsed["width"],
            "height": parsed["height"],
        }
        for key, expected in expected_values.items():
            if entry.get(key) != expected:
                raise SyncError(f"{name}: review manifest {key} does not match the configured name mapping")
        review_file = safe_project_path(review_root, expected_review_path, f"reviewPath for {name}")
        if review_file.is_symlink() or not review_file.is_file():
            raise SyncError(f"{name}: staged review PNG is missing or is a symlink")
        if inspect_png(review_file) != (parsed["width"], parsed["height"]):
            raise SyncError(f"{name}: staged review PNG dimensions changed after staging")
        alpha = validate_transparency(review_file, group["transparency"])
        if entry.get("alpha") != alpha:
            raise SyncError(f"{name}: staged review PNG alpha statistics changed after staging")
        digest = sha256_file(review_file)
        if entry.get("sha256") != digest:
            raise SyncError(f"{name}: staged review PNG hash changed after staging")
        expected_pngs.add(expected_review_path)
        active_assets.append(
            {
                **public_asset(parsed, include_node=False),
                "sha256": digest,
                "alpha": alpha,
                "hasTransparency": alpha["transparent"] + alpha["partial"] > 0,
                "status": "active",
                "reviewFile": review_file,
            }
        )
    validate_asset_collection(group, parsed_assets)
    actual_pngs = {
        str(path.relative_to(review_root))
        for path in review_root.rglob("*.png")
        if path.is_file() and not path.is_symlink()
    }
    if actual_pngs != expected_pngs:
        raise SyncError(
            f"Review PNG set does not match manifest; missing={sorted(expected_pngs - actual_pngs)}, "
            f"extra={sorted(actual_pngs - expected_pngs)}"
        )
    if manifest.get("total") != len(active_assets):
        raise SyncError("Review manifest total does not match its asset count")
    return review_root, manifest, active_assets


def persistent_lock_entry(asset: Mapping[str, Any]) -> Dict[str, Any]:
    required = ("group", "semanticId", "localPath", "width", "height", "sha256", "status")
    missing = [key for key in required if key not in asset]
    if missing:
        raise SyncError(f"Lock entry {asset.get('name')!r} is missing fields: {missing}")
    return {
        "group": asset["group"],
        "semanticId": asset["semanticId"],
        "localPath": asset["localPath"],
        "width": asset["width"],
        "height": asset["height"],
        "sha256": asset["sha256"],
        "hasTransparency": bool(asset.get("hasTransparency", False)),
        "status": asset["status"],
    }


def lock_assets_by_name(entries: Sequence[Mapping[str, Any]]) -> Dict[str, Dict[str, Any]]:
    output: Dict[str, Dict[str, Any]] = {}
    for entry in sorted(entries, key=lambda item: str(item.get("name", ""))):
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            raise SyncError("Every lock entry needs a non-empty name")
        if name in output:
            raise SyncError(f"Duplicate persistent asset name across groups: {name}")
        output[name] = persistent_lock_entry(entry)
    ensure_no_forbidden_keys(output, "Lock assets")
    return output


def build_catalog(group: Mapping[str, Any], assets: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    catalog: Dict[str, Any] = {
        "schemaVersion": 2,
        "cardSize": dict(group["expectedSize"]),
        "assets": {},
    }
    for asset in sorted(assets, key=lambda item: item["name"]):
        catalog["assets"][asset["name"]] = {
            "id": asset["semanticId"],
            "kind": asset["kind"],
            **asset["catalogFields"],
            "resourcePath": asset["resourcePath"],
            "sha256": asset["sha256"],
        }
    ensure_no_forbidden_keys(catalog, "Catalog")
    return catalog


def transactional_write(
    writes: Sequence[Tuple[Path, Any]],
    backup_root: Path,
    fail_after: Optional[int] = None,
) -> None:
    backups: List[Tuple[Path, Optional[Path]]] = []
    backup_root.mkdir(parents=True, exist_ok=True)
    try:
        for index, (target, source) in enumerate(writes):
            target.parent.mkdir(parents=True, exist_ok=True)
            backup: Optional[Path] = None
            if target.exists():
                backup = backup_root / f"{index:04d}.bak"
                shutil.copy2(target, backup)
            backups.append((target, backup))
            temporary = target.parent / f".{target.name}.figma-sync.tmp"
            temporary.unlink(missing_ok=True)
            if isinstance(source, bytes):
                temporary.write_bytes(source)
            else:
                shutil.copy2(Path(source), temporary)
            os.replace(temporary, target)
            if fail_after is not None and index + 1 >= fail_after:
                raise OSError("Injected transaction failure")
    except Exception as exc:
        for target, backup in reversed(backups):
            temporary = target.parent / f".{target.name}.figma-sync.rollback"
            temporary.unlink(missing_ok=True)
            if backup is None:
                target.unlink(missing_ok=True)
            else:
                shutil.copy2(backup, temporary)
                os.replace(temporary, target)
        raise SyncError(f"Transaction failed and was rolled back: {exc}") from exc


def remove_review_artifacts(review_root: Path) -> None:
    shutil.rmtree(review_root)
    Path(str(review_root) + ".meta").unlink(missing_ok=True)
    parent = review_root.parent
    if parent.exists() and not any(parent.iterdir()):
        parent.rmdir()
        Path(str(parent) + ".meta").unlink(missing_ok=True)


def promote_review(
    root: Path,
    config: Mapping[str, Any],
    group_id: Optional[str],
    confirmed: bool,
    transaction_fail_after: Optional[int] = None,
) -> Dict[str, Any]:
    if not confirmed:
        raise SyncError("Promotion requires explicit confirmation (--confirmed)")
    validate_config(config)
    group = group_by_id(config, group_id)
    review_root, _, active_assets = validate_review(root, config, group)
    lock_path = safe_project_path(root, config["lockFile"], "lockFile")
    old_entries = lock_entries(read_existing_lock(lock_path))
    diff = diff_against_formal(root, group, active_assets, old_entries)
    writes: List[Tuple[Path, Any]] = []
    for asset in active_assets:
        if asset["name"] in diff["added"] or asset["name"] in diff["changed"]:
            target = safe_project_path(root, asset["localPath"], f"localPath for {asset['name']}")
            writes.append((target, asset["reviewFile"]))

    catalog_path = safe_project_path(root, group["catalog"]["path"], "catalog.path")
    catalog_bytes = canonical_json_bytes(build_catalog(group, active_assets))
    if not catalog_path.exists() or catalog_path.read_bytes() != catalog_bytes:
        writes.append((catalog_path, catalog_bytes))

    current_names = {item["name"] for item in active_assets}
    retained_other = [item for item in old_entries if item.get("group") != group["id"]]
    stale_entries = [
        {**item, "status": "stale"}
        for item in old_entries
        if item.get("group") == group["id"] and item.get("name") not in current_names
    ]
    lock_document = {
        "schemaVersion": 2,
        "assets": lock_assets_by_name(retained_other + list(active_assets) + stale_entries),
    }
    ensure_no_forbidden_keys(lock_document, "Lock")
    lock_bytes = canonical_json_bytes(lock_document)
    if not lock_path.exists() or lock_path.read_bytes() != lock_bytes:
        writes.append((lock_path, lock_bytes))

    temp_root = safe_project_path(root, config["temporaryDirectory"], "temporaryDirectory")
    temp_root.mkdir(parents=True, exist_ok=True)
    run_root = Path(tempfile.mkdtemp(prefix="promote-", dir=temp_root))
    try:
        transactional_write(writes, run_root / "backup", fail_after=transaction_fail_after)
        remove_review_artifacts(review_root)
    finally:
        shutil.rmtree(run_root, ignore_errors=True)
    return {
        **summary_from_diff(group, diff, len(active_assets)),
        "filesWritten": len(writes),
        "promoted": True,
        "reviewRemoved": True,
    }


def discard_review(root: Path, config: Mapping[str, Any], group_id: Optional[str], confirmed: bool) -> Dict[str, Any]:
    if not confirmed:
        raise SyncError("Discard requires explicit confirmation (--confirmed)")
    validate_config(config)
    group = group_by_id(config, group_id)
    review_root = safe_project_path(root, group["reviewRoot"], "reviewRoot")
    if not review_root.is_dir():
        raise SyncError(f"No pending review exists at {group['reviewRoot']}")
    remove_review_artifacts(review_root)
    return {"group": group["id"], "discarded": True, "reviewRemoved": True}


def review_status(root: Path, config: Mapping[str, Any], group_id: Optional[str]) -> Dict[str, Any]:
    validate_config(config)
    group = group_by_id(config, group_id)
    review_root, manifest, active_assets = validate_review(root, config, group)
    old_entries = lock_entries(read_existing_lock(safe_project_path(root, config["lockFile"], "lockFile")))
    diff = diff_against_formal(root, group, active_assets, old_entries)
    return {
        **summary_from_diff(group, diff, len(active_assets)),
        "pendingConfirmation": True,
        "reviewRoot": str(review_root.relative_to(root.resolve())),
        "manifest": str(Path(group["reviewRoot"]) / REVIEW_MANIFEST),
        "stagedAt": manifest.get("stagedAt"),
        "valid": True,
    }


def sync_status(root: Path, config: Mapping[str, Any], group_id: Optional[str]) -> Dict[str, Any]:
    """Report a pending review when present, otherwise verify promoted assets."""
    validate_config(config)
    group = group_by_id(config, group_id)
    review_root = safe_project_path(root, group["reviewRoot"], "reviewRoot")
    if review_root.exists():
        return review_status(root, config, group["id"])
    return {
        "group": group["id"],
        "pendingConfirmation": False,
        "formal": verify_local(root, config),
    }


def guard_build(root: Path, config: Mapping[str, Any]) -> Dict[str, Any]:
    validate_config(config)
    pending = []
    for group in config["groups"]:
        path = safe_project_path(root, group["reviewRoot"], f"reviewRoot for {group['id']}")
        if path.exists():
            pending.append(group["reviewRoot"])
    if pending:
        raise SyncError(f"Pending Figma review blocks build/release: {pending}")
    return {"ok": True, "pendingReviews": 0}


def verify_local(root: Path, config: Mapping[str, Any]) -> Dict[str, Any]:
    validate_config(config)
    lock_path = safe_project_path(root, config["lockFile"], "lockFile")
    lock = read_existing_lock(lock_path)
    if lock.get("schemaVersion") != 2:
        raise SyncError("Formal lock must be schemaVersion 2; confirm and promote a staged review to migrate it")
    ensure_no_forbidden_keys(lock, "Lock")
    errors = []
    active = stale = 0
    for item in lock_entries(lock):
        if item.get("status") == "stale":
            stale += 1
            continue
        active += 1
        try:
            path = safe_project_path(root, item["localPath"], "lock localPath")
            if not path.is_file():
                errors.append(f"missing: {item['localPath']}")
                continue
            if inspect_png(path) != (item.get("width"), item.get("height")):
                errors.append(f"size: {item['localPath']}")
            if sha256_file(path) != item.get("sha256"):
                errors.append(f"hash: {item['localPath']}")
            if item.get("hasTransparency"):
                alpha = inspect_png_transparency(path)
                if alpha["transparent"] + alpha["partial"] == 0:
                    errors.append(f"alpha: {item['localPath']}")
        except (KeyError, SyncError) as exc:
            errors.append(str(exc))
    for group in config["groups"]:
        catalog_path = safe_project_path(root, group["catalog"]["path"], "catalog.path")
        if not catalog_path.is_file():
            errors.append(f"missing catalog: {group['catalog']['path']}")
            continue
        try:
            catalog = load_json(catalog_path)
            ensure_no_forbidden_keys(catalog, "Catalog")
            if catalog.get("schemaVersion") != 2 or not isinstance(catalog.get("assets"), dict):
                errors.append(f"catalog schema: {group['catalog']['path']}")
        except SyncError as exc:
            errors.append(str(exc))
    result = {"active": active, "stale": stale, "errors": errors, "ok": not errors}
    if errors:
        raise SyncError(json.dumps(result, ensure_ascii=False))
    return result


def write_output(value: Mapping[str, Any], output: Optional[str] = None) -> None:
    data = canonical_json_bytes(value)
    if output:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    else:
        sys.stdout.buffer.write(data)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate-config", help="Validate project sync configuration")
    validate.add_argument("--config", default="figma-assets.config.json")

    locate = subparsers.add_parser("locate", help="Locate one configured sourcePath segment")
    locate.add_argument("--config", default="figma-assets.config.json")
    locate.add_argument("--metadata", required=True)
    locate.add_argument("--depth", type=int, required=True)
    locate.add_argument("--group")
    locate.add_argument("--output")

    plan = subparsers.add_parser("plan", help="Parse and validate a configured resource directory")
    plan.add_argument("--config", default="figma-assets.config.json")
    plan.add_argument("--metadata", required=True)
    plan.add_argument("--group")
    plan.add_argument("--output")

    stage = subparsers.add_parser("stage", help="Validate downloads and create a pending review directory")
    stage.add_argument("--config", default="figma-assets.config.json")
    stage.add_argument("--plan", required=True)
    stage.add_argument("--exports", required=True, help="Exports JSON path, or - for stdin")
    stage.add_argument("--root", default=".")
    stage.add_argument("--dry-run", action="store_true")

    promote = subparsers.add_parser("promote", help="Promote a reviewed batch into formal resources")
    promote.add_argument("--config", default="figma-assets.config.json")
    promote.add_argument("--group")
    promote.add_argument("--root", default=".")
    promote.add_argument("--confirmed", action="store_true")

    discard = subparsers.add_parser("discard-review", help="Delete a rejected pending review")
    discard.add_argument("--config", default="figma-assets.config.json")
    discard.add_argument("--group")
    discard.add_argument("--root", default=".")
    discard.add_argument("--confirmed", action="store_true")

    status = subparsers.add_parser("review-status", help="Revalidate and report a pending review")
    status.add_argument("--config", default="figma-assets.config.json")
    status.add_argument("--group")
    status.add_argument("--root", default=".")

    general_status = subparsers.add_parser("status", help="Report pending review or verify promoted assets")
    general_status.add_argument("--config", default="figma-assets.config.json")
    general_status.add_argument("--group")
    general_status.add_argument("--root", default=".")

    guard = subparsers.add_parser("guard-build", help="Fail while any pending review exists")
    guard.add_argument("--config", default="figma-assets.config.json")
    guard.add_argument("--root", default=".")

    verify = subparsers.add_parser("verify", help="Verify promoted assets against catalog and lock")
    verify.add_argument("--config", default="figma-assets.config.json")
    verify.add_argument("--root", default=".")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        config = load_json(Path(args.config))
        if args.command == "validate-config":
            validate_config(config)
            write_output({"ok": True, "fileKey": parse_file_key(config["figma"]["fileUrl"])})
        elif args.command == "locate":
            validate_config(config)
            metadata = Path(args.metadata).read_text(encoding="utf-8")
            write_output(locate_source(metadata, group_by_id(config, args.group), args.depth), args.output)
        elif args.command == "plan":
            validate_config(config)
            group = group_by_id(config, args.group)
            metadata = Path(args.metadata).read_text(encoding="utf-8")
            write_output(plan_group(config, group, metadata), args.output)
        elif args.command == "stage":
            plan = load_json(Path(args.plan))
            exports = load_exports(args.exports)
            write_output(stage_review(Path(args.root), config, plan, exports, dry_run=args.dry_run))
        elif args.command == "promote":
            write_output(promote_review(Path(args.root), config, args.group, args.confirmed))
        elif args.command == "discard-review":
            write_output(discard_review(Path(args.root), config, args.group, args.confirmed))
        elif args.command == "review-status":
            write_output(review_status(Path(args.root), config, args.group))
        elif args.command == "status":
            write_output(sync_status(Path(args.root), config, args.group))
        elif args.command == "guard-build":
            write_output(guard_build(Path(args.root), config))
        elif args.command == "verify":
            write_output(verify_local(Path(args.root), config))
        return 0
    except (SyncError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
