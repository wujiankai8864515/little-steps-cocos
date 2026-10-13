#!/usr/bin/env python3
"""Plan and pull one-shot Figma static assets into a replaceable inbox."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
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
DIRECTORY_INDEX = "remote-directories.json"
PULL_MANIFEST = "pull-manifest.json"
FORBIDDEN_PERSISTENT_KEYS = {"nodeid", "node_id", "uuid"}


class PullError(RuntimeError):
    """Raise a user-actionable static asset pull error."""


def load_json(path: Path) -> Dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PullError(f"JSON file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PullError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise PullError(f"Expected a JSON object in {path}")
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
        raise PullError(f"{label} must be relative and must not contain '..': {relative}")
    root_resolved = root.resolve()
    resolved = (root_resolved / candidate).resolve()
    if Path(os.path.commonpath([str(root_resolved), str(resolved)])) != root_resolved:
        raise PullError(f"{label} escapes its root: {relative}")
    return resolved


def validate_relative_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise PullError(f"{label} must be a non-empty path string")
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise PullError(f"{label} must be relative and must not contain '..'")
    return value


def parse_file_key(file_url: str) -> str:
    match = re.search(r"figma\.com/design/([^/?#]+)", file_url)
    if not match:
        raise PullError("The shared Figma URL must be a /design/ URL")
    return match.group(1)


def resolve_file_url(root: Path, config: Mapping[str, Any]) -> str:
    shared_path = safe_project_path(root, str(config.get("figmaFileConfig", "")), "figmaFileConfig")
    shared = load_json(shared_path)
    figma = shared.get("figma")
    if not isinstance(figma, dict) or not isinstance(figma.get("fileUrl"), str):
        raise PullError(f"Shared config {shared_path} must contain figma.fileUrl")
    parse_file_key(figma["fileUrl"])
    return figma["fileUrl"]


def effective_digest(config: Mapping[str, Any], file_url: str) -> str:
    return sha256_bytes(canonical_json_bytes({"config": config, "fileUrl": file_url}))


def paths_overlap(left: str, right: str) -> bool:
    left_parts = Path(left).parts
    right_parts = Path(right).parts
    short = min(len(left_parts), len(right_parts))
    return left_parts[:short] == right_parts[:short]


def validate_config(root: Path, config: Mapping[str, Any]) -> None:
    if config.get("schemaVersion") != 1:
        raise PullError("config.schemaVersion must be 1")
    validate_relative_path(config.get("figmaFileConfig"), "figmaFileConfig")
    resolve_file_url(root, config)
    temporary = validate_relative_path(config.get("temporaryDirectory"), "temporaryDirectory")
    inbox = validate_relative_path(config.get("inboxRoot"), "inboxRoot")
    formal = validate_relative_path(config.get("formalRoot"), "formalRoot")
    if paths_overlap(inbox, formal):
        raise PullError("inboxRoot and formalRoot must not overlap")
    if paths_overlap(temporary, inbox) or paths_overlap(temporary, formal):
        raise PullError("temporaryDirectory must not overlap assets roots")

    download = config.get("download")
    if not isinstance(download, dict):
        raise PullError("download must be an object")
    if download.get("format") != "png" or download.get("scale") != 1:
        raise PullError("Static asset downloads must be png at scale 1")
    if download.get("sourceKind") != "figmaNativeExport":
        raise PullError("Static composite assets must use figmaNativeExport")
    if download.get("transparency") not in ("required", "optional", "opaque"):
        raise PullError("download.transparency must be required, optional, or opaque")
    concurrency = download.get("maxConcurrency")
    if not isinstance(concurrency, int) or not 1 <= concurrency <= 4:
        raise PullError("download.maxConcurrency must be an integer from 1 through 4")
    allowed_hosts = download.get("allowedHosts")
    if not isinstance(allowed_hosts, list) or not allowed_hosts or not all(
        isinstance(item, str) and item for item in allowed_hosts
    ):
        raise PullError("download.allowedHosts must be a non-empty string array")
    for key in ("containerNodeTypes", "exportNodeTypes"):
        value = config.get(key)
        if not isinstance(value, list) or not value or not all(isinstance(item, str) and item for item in value):
            raise PullError(f"{key} must be a non-empty string array")


def parse_source_path(value: str) -> List[str]:
    if not isinstance(value, str) or not value.strip():
        raise PullError("source path must be a non-empty slash-separated string")
    segments = [item.strip() for item in value.split("/")]
    if any(not item or item in (".", "..") for item in segments):
        raise PullError(f"Invalid source path: {value!r}")
    for item in segments:
        if "\\" in item:
            raise PullError(f"Source path segment contains a path separator: {item!r}")
    return segments


def safe_name(name: str) -> str:
    if not name or name in (".", "..") or "/" in name or "\\" in name or Path(name).name != name:
        raise PullError(f"Figma node name is not a safe filename: {name!r}")
    return name


def clean_xml_text(text: str) -> str:
    start = text.find("<")
    if start < 0:
        raise PullError("Metadata does not contain XML")
    marker = text.find("\nIMPORTANT:", start)
    if marker >= 0:
        text = text[:marker]
    return text[start:].strip()


def parse_xml(text: str) -> ET.Element:
    try:
        return ET.fromstring(clean_xml_text(text))
    except ET.ParseError as exc:
        raise PullError(f"Could not parse Figma metadata XML: {exc}") from exc


def parse_number(value: Optional[str], label: str) -> float:
    try:
        number = float(value if value is not None else "")
    except ValueError as exc:
        raise PullError(f"Invalid {label}: {value!r}") from exc
    if number <= 0:
        raise PullError(f"{label} must be positive")
    return number


def locate_page(metadata_text: str, page_name: str) -> Dict[str, Any]:
    matches = []
    for line in metadata_text.splitlines():
        match = re.match(r"^-\s+(\d+:\d+):\s+(.+?)\s*$", line)
        if match and match.group(2) == page_name:
            matches.append({"nodeId": match.group(1), "name": match.group(2), "nodeType": "page"})
    if len(matches) != 1:
        raise PullError(f"Expected one top-level page named {page_name!r}, found {len(matches)}")
    return matches[0]


def locate_source(metadata_text: str, config: Mapping[str, Any], source_path: Sequence[str], depth: int) -> Dict[str, Any]:
    if depth < 0 or depth >= len(source_path):
        raise PullError(f"source path depth must be from 0 through {len(source_path) - 1}")
    if depth == 0:
        result = locate_page(metadata_text, source_path[0])
    else:
        root = parse_xml(metadata_text)
        parent_name = source_path[depth - 1]
        if root.attrib.get("name") != parent_name:
            raise PullError(f"Metadata root must be parent {parent_name!r}")
        allowed = set(config["containerNodeTypes"])
        matches = [
            node
            for node in list(root)
            if node.tag in allowed and node.attrib.get("name") == source_path[depth] and node.attrib.get("id")
        ]
        if len(matches) != 1:
            raise PullError(
                f"Expected one direct child directory {source_path[depth]!r} below {parent_name!r}, found {len(matches)}"
            )
        node = matches[0]
        result = {"nodeId": node.attrib["id"], "name": node.attrib["name"], "nodeType": node.tag}
    return {**result, "depth": depth, "complete": depth == len(source_path) - 1}


def ensure_no_forbidden_keys(value: Any, label: str, trail: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in FORBIDDEN_PERSISTENT_KEYS:
                raise PullError(f"{label} contains forbidden key at {trail}.{key}")
            ensure_no_forbidden_keys(child, label, f"{trail}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            ensure_no_forbidden_keys(child, label, f"{trail}[{index}]")


def build_directory_index(config: Mapping[str, Any], metadata_text: str, root_path: Sequence[str]) -> Dict[str, Any]:
    root = parse_xml(metadata_text)
    if root.attrib.get("name") != root_path[-1]:
        raise PullError(f"Directory metadata root must be {root_path[-1]!r}")
    container_types = set(config["containerNodeTypes"])
    export_types = set(config["exportNodeTypes"])
    directories: List[Dict[str, Any]] = []

    def visit(node: ET.Element, path: List[str]) -> None:
        direct = list(node)
        directories.append(
            {
                "path": "/".join(path),
                "segments": path,
                "kind": node.tag,
                "directExportableCount": sum(child.tag in export_types for child in direct),
                "directDirectoryCount": sum(child.tag in container_types for child in direct),
            }
        )
        for child in direct:
            if child.tag in container_types and child.attrib.get("name"):
                visit(child, [*path, child.attrib["name"]])

    visit(root, list(root_path))
    document = {"schemaVersion": 1, "directories": directories}
    ensure_no_forbidden_keys(document, "Directory index")
    return document


def plan_directory(
    root: Path,
    config: Mapping[str, Any],
    metadata_text: str,
    source_path: Sequence[str],
) -> Dict[str, Any]:
    validate_config(root, config)
    xml_root = parse_xml(metadata_text)
    if xml_root.attrib.get("name") != source_path[-1]:
        raise PullError(f"Metadata root must be the requested directory {source_path[-1]!r}")
    allowed = set(config["exportNodeTypes"])
    assets = []
    ignored = []
    names = set()
    for order, node in enumerate(list(xml_root)):
        name = node.attrib.get("name", "")
        if node.tag not in allowed:
            ignored.append({"name": name, "nodeType": node.tag, "reason": "node type is not exportable"})
            continue
        safe_name(name)
        node_id = node.attrib.get("id")
        if not node_id:
            raise PullError(f"Direct child {name!r} has no Figma node ID")
        if name in names:
            raise PullError(f"Duplicate direct child name: {name}")
        names.add(name)
        width = parse_number(node.attrib.get("width"), f"width for {name}")
        height = parse_number(node.attrib.get("height"), f"height for {name}")
        assets.append(
            {
                "order": order,
                "name": name,
                "nodeId": node_id,
                "nodeType": node.tag,
                "figmaWidth": width,
                "figmaHeight": height,
                "pixelWidth": max(1, round(width)),
                "pixelHeight": max(1, round(height)),
            }
        )
    if not assets:
        raise PullError(f"No exportable direct children found below {'/'.join(source_path)}")
    file_url = resolve_file_url(root, config)
    return {
        "schemaVersion": 1,
        "configDigest": effective_digest(config, file_url),
        "fileKey": parse_file_key(file_url),
        "sourcePath": list(source_path),
        "directChildrenOnly": True,
        "format": "png",
        "scale": 1,
        "sourceKind": "figmaNativeExport",
        "assets": assets,
        "ignored": ignored,
    }


def inspect_png(path: Path) -> Tuple[int, int]:
    data = path.read_bytes()[:24]
    if len(data) < 24 or data[:8] != PNG_SIGNATURE or data[12:16] != b"IHDR":
        raise PullError(f"{path.name} is not a valid PNG")
    return struct.unpack(">II", data[16:24])


def _paeth(left: int, up: int, upper_left: int) -> int:
    estimate = left + up - upper_left
    distances = (abs(estimate - left), abs(estimate - up), abs(estimate - upper_left))
    if distances[0] <= distances[1] and distances[0] <= distances[2]:
        return left
    if distances[1] <= distances[2]:
        return up
    return upper_left


def inspect_png_transparency(path: Path) -> Dict[str, int]:
    import zlib

    data = path.read_bytes()
    if data[:8] != PNG_SIGNATURE:
        raise PullError(f"{path.name} is not a valid PNG")
    position = 8
    width = height = bit_depth = color_type = interlace = None
    compressed = bytearray()
    while position + 12 <= len(data):
        length = struct.unpack(">I", data[position : position + 4])[0]
        kind = data[position + 4 : position + 8]
        payload = data[position + 8 : position + 8 + length]
        position += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            break
    if None in (width, height, bit_depth, color_type, interlace):
        raise PullError(f"{path.name} has no valid IHDR")
    if bit_depth != 8 or interlace != 0 or color_type not in (4, 6):
        return {"hasAlpha": 0, "transparent": 0, "partial": 0, "opaque": int(width) * int(height)}
    bpp = 2 if color_type == 4 else 4
    stride = int(width) * bpp
    try:
        rows = zlib.decompress(bytes(compressed))
    except zlib.error as exc:
        raise PullError(f"{path.name} has invalid compressed pixels") from exc
    if len(rows) != int(height) * (stride + 1):
        raise PullError(f"{path.name} has unexpected scanline length")
    previous = bytearray(stride)
    transparent = partial = opaque = 0
    offset = 0
    for _ in range(int(height)):
        filter_type = rows[offset]
        source = rows[offset + 1 : offset + 1 + stride]
        offset += stride + 1
        row = bytearray(stride)
        for index, value in enumerate(source):
            left = row[index - bpp] if index >= bpp else 0
            up = previous[index]
            upper_left = previous[index - bpp] if index >= bpp else 0
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
                raise PullError(f"{path.name} uses unsupported PNG filter {filter_type}")
            row[index] = (value + predictor) & 0xFF
        for alpha in row[bpp - 1 :: bpp]:
            if alpha == 0:
                transparent += 1
            elif alpha == 255:
                opaque += 1
            else:
                partial += 1
        previous = row
    return {"hasAlpha": 1, "transparent": transparent, "partial": partial, "opaque": opaque}


def validate_alpha(path: Path, policy: str) -> Dict[str, int]:
    alpha = inspect_png_transparency(path)
    non_opaque = alpha["transparent"] + alpha["partial"]
    if policy == "required" and (not alpha["hasAlpha"] or non_opaque == 0):
        raise PullError(f"{path.name}: rendered PNG must contain transparent or partially transparent pixels")
    if policy == "opaque" and non_opaque:
        raise PullError(f"{path.name}: rendered PNG must be opaque")
    return alpha


def download_export(
    export: Mapping[str, Any], destination: Path, allowed_hosts: Sequence[str], timeout: int, retries: int
) -> None:
    if str(export.get("format", "")).lower() != "png":
        raise PullError(f"Export for node {export.get('nodeId')} must be png")
    source_path = export.get("sourcePath")
    if isinstance(source_path, str):
        source = Path(source_path)
        if not source.is_file():
            raise PullError(f"Source file is missing for node {export.get('nodeId')}")
        shutil.copy2(source, destination)
        return
    url = export.get("url")
    if not isinstance(url, str):
        raise PullError(f"Export for node {export.get('nodeId')} needs url or sourcePath")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise PullError(f"Export URL host is not allowed for node {export.get('nodeId')}")
    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "avg-plus-figma-static/1"})
            with urllib.request.urlopen(request, timeout=timeout) as response, destination.open("wb") as handle:
                shutil.copyfileobj(response, handle)
            return
        except Exception as exc:  # Do not expose signed URLs.
            last_error = exc
            destination.unlink(missing_ok=True)
            if attempt < retries:
                time.sleep(0.5 * (2**attempt))
    raise PullError(f"Failed to download export for node {export.get('nodeId')}") from last_error


def load_exports(path_value: str) -> List[Dict[str, Any]]:
    if path_value == "-":
        try:
            document = json.load(sys.stdin)
        except json.JSONDecodeError as exc:
            raise PullError(f"Invalid exports JSON on stdin: {exc}") from exc
    else:
        document = load_json(Path(path_value))
    exports = document.get("exports") if isinstance(document, dict) else None
    if not isinstance(exports, list):
        raise PullError("exports JSON must contain an exports array")
    output = []
    seen = set()
    for item in exports:
        if not isinstance(item, dict) or not isinstance(item.get("nodeId"), str):
            raise PullError("Every export needs a string nodeId")
        if item["nodeId"] in seen:
            raise PullError(f"Duplicate export nodeId: {item['nodeId']}")
        seen.add(item["nodeId"])
        output.append(item)
    return output


def minimal_directory_index(source_path: Sequence[str]) -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "directories": [
            {"path": "/".join(source_path[:index]), "segments": list(source_path[:index]), "kind": "unknown"}
            for index in range(1, len(source_path) + 1)
        ],
    }


def publish_candidate(inbox: Path, candidate: Path, run_root: Path, fail_after_backup: bool = False) -> bool:
    previous = run_root / "previous-inbox"
    had_previous = inbox.exists()
    if had_previous:
        os.replace(inbox, previous)
    try:
        if fail_after_backup:
            raise OSError("Injected publish failure")
        os.replace(candidate, inbox)
    except Exception as exc:
        if previous.exists():
            os.replace(previous, inbox)
        raise PullError(f"Inbox publish failed and previous inbox was restored: {exc}") from exc
    shutil.rmtree(previous, ignore_errors=True)
    return had_previous


def pull_plan(
    root: Path,
    config: Mapping[str, Any],
    plan: Mapping[str, Any],
    exports: Sequence[Mapping[str, Any]],
    directory_index: Optional[Mapping[str, Any]] = None,
    dry_run: bool = False,
    fail_after_backup: bool = False,
) -> Dict[str, Any]:
    validate_config(root, config)
    file_url = resolve_file_url(root, config)
    if plan.get("schemaVersion") != 1 or plan.get("configDigest") != effective_digest(config, file_url):
        raise PullError("Plan is stale or incompatible; discover and plan again")
    if plan.get("directChildrenOnly") is not True or plan.get("sourceKind") != "figmaNativeExport":
        raise PullError("Plan must use Figma-native export for direct children only")
    assets = plan.get("assets")
    if not isinstance(assets, list) or not assets:
        raise PullError("Plan contains no assets")
    planned_ids = {item.get("nodeId") for item in assets}
    by_node = {item["nodeId"]: item for item in exports}
    if None in planned_ids or len(planned_ids) != len(assets) or set(by_node) != planned_ids:
        raise PullError("Exports do not match the planned direct children")
    for node_id, export in by_node.items():
        if export.get("sourceKind") != "figmaNativeExport":
            raise PullError(f"Node {node_id} sourceKind must be figmaNativeExport")

    temp_root = safe_project_path(root, config["temporaryDirectory"], "temporaryDirectory")
    temp_root.mkdir(parents=True, exist_ok=True)
    run_root = Path(tempfile.mkdtemp(prefix="pull-", dir=temp_root))
    downloads = run_root / "downloads"
    downloads.mkdir()
    staged: Dict[str, Path] = {}
    alpha_stats: Dict[str, Dict[str, int]] = {}
    download = config["download"]

    def fetch(index: int, asset: Mapping[str, Any]) -> Tuple[str, Path, Dict[str, int]]:
        destination = downloads / f"{index:04d}-{asset['name']}.png"
        download_export(
            by_node[asset["nodeId"]],
            destination,
            download["allowedHosts"],
            int(download.get("timeoutSeconds", 30)),
            int(download.get("retries", 2)),
        )
        dimensions = inspect_png(destination)
        expected = (asset["pixelWidth"], asset["pixelHeight"])
        if dimensions != expected:
            raise PullError(f"{asset['name']}: PNG is {dimensions[0]}x{dimensions[1]}, expected {expected[0]}x{expected[1]}")
        return asset["name"], destination, validate_alpha(destination, download["transparency"])

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=int(download["maxConcurrency"])) as executor:
            futures = [executor.submit(fetch, index, asset) for index, asset in enumerate(assets)]
            for future in concurrent.futures.as_completed(futures):
                name, path, alpha = future.result()
                staged[name] = path
                alpha_stats[name] = alpha
        source_path = plan.get("sourcePath")
        if not isinstance(source_path, list) or not all(isinstance(item, str) for item in source_path):
            raise PullError("Plan sourcePath is invalid")
        inbox = safe_project_path(root, config["inboxRoot"], "inboxRoot")
        candidate = run_root / "candidate"
        candidate.mkdir()
        relative_root = Path(*source_path)
        manifest_assets: Dict[str, Any] = {}
        for asset in sorted(assets, key=lambda item: item["order"]):
            relative = relative_root / f"{asset['name']}.png"
            destination = safe_project_path(candidate, str(relative), f"inbox path for {asset['name']}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged[asset["name"]], destination)
            manifest_assets[asset["name"]] = {
                "figmaName": asset["name"],
                "nodeType": asset["nodeType"],
                "inboxPath": str(relative),
                "width": asset["pixelWidth"],
                "height": asset["pixelHeight"],
                "sha256": sha256_file(destination),
                "alpha": alpha_stats[asset["name"]],
            }
        manifest = {
            "schemaVersion": 1,
            "mode": "static-one-shot",
            "sourcePath": source_path,
            "directChildrenOnly": True,
            "format": "png",
            "scale": 1,
            "sourceKind": "figmaNativeExport",
            "formalRoot": config["formalRoot"],
            "manualSelectionRequired": True,
            "assets": manifest_assets,
            "ignored": plan.get("ignored", []),
        }
        index_document = dict(directory_index) if isinstance(directory_index, Mapping) else minimal_directory_index(source_path)
        ensure_no_forbidden_keys(index_document, "Directory index")
        ensure_no_forbidden_keys(manifest, "Pull manifest")
        (candidate / DIRECTORY_INDEX).write_bytes(canonical_json_bytes(index_document))
        (candidate / PULL_MANIFEST).write_bytes(canonical_json_bytes(manifest))
        summary = {
            "sourcePath": "/".join(source_path),
            "total": len(assets),
            "ignored": len(plan.get("ignored", [])),
            "dryRun": dry_run,
            "inboxRoot": config["inboxRoot"],
            "formalRootTouched": False,
        }
        if dry_run:
            return summary
        inbox.parent.mkdir(parents=True, exist_ok=True)
        summary["previousInboxOverwritten"] = publish_candidate(inbox, candidate, run_root, fail_after_backup)
        summary["manualSelectionRequired"] = True
        return summary
    finally:
        shutil.rmtree(run_root, ignore_errors=True)


def status(root: Path, config: Mapping[str, Any]) -> Dict[str, Any]:
    validate_config(root, config)
    inbox = safe_project_path(root, config["inboxRoot"], "inboxRoot")
    manifest = load_json(inbox / PULL_MANIFEST)
    directory_index = load_json(inbox / DIRECTORY_INDEX)
    ensure_no_forbidden_keys(manifest, "Pull manifest")
    ensure_no_forbidden_keys(directory_index, "Directory index")
    if manifest.get("schemaVersion") != 1 or manifest.get("mode") != "static-one-shot":
        raise PullError("Unsupported inbox manifest")
    assets = manifest.get("assets")
    if not isinstance(assets, dict) or not assets:
        raise PullError("Inbox manifest assets must be a non-empty object")
    expected = set()
    errors = []
    for name, item in assets.items():
        if not isinstance(name, str) or not isinstance(item, dict):
            errors.append("invalid asset entry")
            continue
        try:
            safe_name(name)
            path = safe_project_path(inbox, item["inboxPath"], f"inboxPath for {name}")
            expected.add(str(path.relative_to(inbox)))
            if path.is_symlink() or not path.is_file():
                errors.append(f"missing or symlink: {name}")
                continue
            if inspect_png(path) != (item.get("width"), item.get("height")):
                errors.append(f"size: {name}")
            if sha256_file(path) != item.get("sha256"):
                errors.append(f"hash: {name}")
            alpha = validate_alpha(path, config["download"]["transparency"])
            if alpha != item.get("alpha"):
                errors.append(f"alpha: {name}")
        except (KeyError, PullError) as exc:
            errors.append(str(exc))
    actual = {
        str(path.relative_to(inbox))
        for path in inbox.rglob("*.png")
        if path.is_file() and not path.is_symlink()
    }
    if actual != expected:
        errors.append(f"PNG set mismatch: missing={sorted(expected-actual)}, extra={sorted(actual-expected)}")
    result = {
        "ok": not errors,
        "sourcePath": "/".join(manifest.get("sourcePath", [])),
        "assets": len(assets),
        "directories": len(directory_index.get("directories", [])),
        "manualSelectionRequired": True,
        "errors": errors,
    }
    if errors:
        raise PullError(json.dumps(result, ensure_ascii=False))
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
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate-config")
    validate.add_argument("--config", default="figma-static-assets.config.json")

    locate = sub.add_parser("locate")
    locate.add_argument("--config", default="figma-static-assets.config.json")
    locate.add_argument("--metadata", required=True)
    locate.add_argument("--source-path", required=True)
    locate.add_argument("--depth", type=int, required=True)
    locate.add_argument("--output")

    index = sub.add_parser("directory-index")
    index.add_argument("--config", default="figma-static-assets.config.json")
    index.add_argument("--metadata", required=True)
    index.add_argument("--root-path", required=True)
    index.add_argument("--output")

    plan = sub.add_parser("plan")
    plan.add_argument("--config", default="figma-static-assets.config.json")
    plan.add_argument("--metadata", required=True)
    plan.add_argument("--source-path", required=True)
    plan.add_argument("--output")

    pull = sub.add_parser("pull")
    pull.add_argument("--config", default="figma-static-assets.config.json")
    pull.add_argument("--plan", required=True)
    pull.add_argument("--exports", required=True)
    pull.add_argument("--directory-index")
    pull.add_argument("--root", default=".")
    pull.add_argument("--dry-run", action="store_true")

    check = sub.add_parser("status")
    check.add_argument("--config", default="figma-static-assets.config.json")
    check.add_argument("--root", default=".")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = load_json(Path(args.config))
        root = Path(getattr(args, "root", "."))
        if args.command == "validate-config":
            validate_config(root, config)
            write_output({"ok": True, "fileKey": parse_file_key(resolve_file_url(root, config))})
        elif args.command == "locate":
            validate_config(root, config)
            metadata = Path(args.metadata).read_text(encoding="utf-8")
            write_output(locate_source(metadata, config, parse_source_path(args.source_path), args.depth), args.output)
        elif args.command == "directory-index":
            validate_config(root, config)
            metadata = Path(args.metadata).read_text(encoding="utf-8")
            write_output(build_directory_index(config, metadata, parse_source_path(args.root_path)), args.output)
        elif args.command == "plan":
            metadata = Path(args.metadata).read_text(encoding="utf-8")
            write_output(plan_directory(root, config, metadata, parse_source_path(args.source_path)), args.output)
        elif args.command == "pull":
            plan = load_json(Path(args.plan))
            exports = load_exports(args.exports)
            index = load_json(Path(args.directory_index)) if args.directory_index else None
            write_output(pull_plan(root, config, plan, exports, index, dry_run=args.dry_run))
        elif args.command == "status":
            write_output(status(root, config))
        return 0
    except (PullError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
