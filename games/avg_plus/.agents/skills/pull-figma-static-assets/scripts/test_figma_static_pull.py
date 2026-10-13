#!/usr/bin/env python3
"""Tests for one-shot Figma static asset pulls."""

from __future__ import annotations

import binascii
import copy
import importlib.util
import json
import tempfile
import unittest
import zlib
from pathlib import Path


SCRIPT = Path(__file__).with_name("figma_static_pull.py")
SPEC = importlib.util.spec_from_file_location("figma_static_pull", SCRIPT)
assert SPEC and SPEC.loader
pull = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pull)


def make_png(path: Path, width: int, height: int, marker: bytes = b"", transparent: bool = True) -> None:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        crc = binascii.crc32(kind + payload) & 0xFFFFFFFF
        return len(payload).to_bytes(4, "big") + kind + payload + crc.to_bytes(4, "big")

    path.parent.mkdir(parents=True, exist_ok=True)
    color = sum(marker) % 256
    rows = []
    for y in range(height):
        pixels = bytearray()
        for x in range(width):
            alpha = 0 if transparent and x == 0 and y == 0 else 255
            pixels.extend((color, 30, 60, alpha))
        rows.append(b"\x00" + bytes(pixels))
    ihdr = width.to_bytes(4, "big") + height.to_bytes(4, "big") + bytes((8, 6, 0, 0, 0))
    path.write_bytes(
        pull.PNG_SIGNATURE
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(rows)))
        + chunk(b"IEND", b"")
    )


def config() -> dict:
    return {
        "schemaVersion": 1,
        "figmaFileConfig": "figma-assets.config.json",
        "temporaryDirectory": "temp/static",
        "inboxRoot": "assets/art/__figma_static_inbox__",
        "formalRoot": "assets/art/textures",
        "download": {
            "allowedHosts": ["www.figma.com"],
            "format": "png",
            "scale": 1,
            "sourceKind": "figmaNativeExport",
            "transparency": "required",
            "maxConcurrency": 2,
            "timeoutSeconds": 1,
            "retries": 0,
        },
        "containerNodeTypes": ["canvas", "frame", "section", "group"],
        "exportNodeTypes": ["symbol", "frame", "group", "instance"],
    }


def target_metadata(name: str = "asset_btn", duplicate: bool = False) -> str:
    extra = '<symbol id="1:3" name="asset_btn" width="2" height="3" />' if duplicate else ""
    return (
        '<frame id="1:0" name="元件" width="100" height="100">'
        '<symbol id="1:1" name="%s" width="2" height="3">'
        '<text id="1:2" name="内部文字" width="1" height="1" />'
        "</symbol>"
        '<text id="1:9" name="目录标注" width="5" height="1" />'
        "%s</frame>"
    ) % (name, extra)


def page_metadata() -> str:
    return (
        '<canvas id="4:205" name="组件库">'
        '<frame id="4:206" name="元件" width="100" height="100">'
        '<symbol id="4:212" name="asset_btn" width="2" height="3" />'
        "</frame>"
        '<frame id="4:210" name="组件库" width="100" height="100">'
        '<symbol id="4:311" name="bp_coin" width="4" height="4" />'
        "</frame>"
        "</canvas>"
    )


class StaticPullTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config = config()
        (self.root / "figma-assets.config.json").write_text(
            json.dumps({"figma": {"fileUrl": "https://www.figma.com/design/test-file/Test"}}),
            encoding="utf-8",
        )
        self.plan = pull.plan_directory(self.root, self.config, target_metadata(), ["组件库", "元件"])
        self.source = self.root / "source.png"
        make_png(self.source, 2, 3, b"new")
        self.exports = [
            {
                "nodeId": "1:1",
                "format": "png",
                "sourceKind": "figmaNativeExport",
                "sourcePath": str(self.source),
            }
        ]
        self.directory_index = pull.build_directory_index(self.config, page_metadata(), ["组件库"])

    def tearDown(self) -> None:
        self.temp.cleanup()

    @property
    def inbox(self) -> Path:
        return self.root / self.config["inboxRoot"]

    def test_plan_exports_only_direct_children(self) -> None:
        self.assertEqual([item["name"] for item in self.plan["assets"]], ["asset_btn"])
        self.assertEqual(self.plan["assets"][0]["nodeType"], "symbol")
        self.assertEqual([item["name"] for item in self.plan["ignored"]], ["目录标注"])
        self.assertNotIn("内部文字", json.dumps(self.plan, ensure_ascii=False))

    def test_directory_index_has_names_not_node_ids(self) -> None:
        paths = [item["path"] for item in self.directory_index["directories"]]
        self.assertEqual(paths, ["组件库", "组件库/元件", "组件库/组件库"])
        serialized = json.dumps(self.directory_index).lower()
        self.assertNotIn("nodeid", serialized)
        self.assertNotIn("uuid", serialized)

    def test_locate_requires_exact_direct_path(self) -> None:
        pages = "Top-level pages:\n- 4:205: 组件库\n- 0:1: 游戏资源"
        self.assertEqual(pull.locate_source(pages, self.config, ["组件库", "元件"], 0)["nodeId"], "4:205")
        result = pull.locate_source(page_metadata(), self.config, ["组件库", "元件"], 1)
        self.assertEqual(result["nodeId"], "4:206")
        self.assertTrue(result["complete"])

    def test_duplicate_and_unsafe_names_fail(self) -> None:
        with self.assertRaisesRegex(pull.PullError, "Duplicate direct child"):
            pull.plan_directory(self.root, self.config, target_metadata(duplicate=True), ["组件库", "元件"])
        with self.assertRaisesRegex(pull.PullError, "safe filename"):
            pull.plan_directory(self.root, self.config, target_metadata("bad/name"), ["组件库", "元件"])

    def test_pull_overwrites_inbox_but_never_formal_textures(self) -> None:
        old = self.inbox / "old.png"
        make_png(old, 1, 1, b"old")
        formal = self.root / "assets/art/textures/keep.png"
        make_png(formal, 1, 1, b"formal")
        formal_bytes = formal.read_bytes()
        summary = pull.pull_plan(
            self.root, self.config, self.plan, self.exports, self.directory_index
        )
        self.assertTrue(summary["previousInboxOverwritten"])
        self.assertFalse(old.exists())
        exported = self.inbox / "组件库/元件/asset_btn.png"
        self.assertEqual(exported.read_bytes(), self.source.read_bytes())
        self.assertEqual(formal.read_bytes(), formal_bytes)
        self.assertFalse(summary["formalRootTouched"])
        manifest = json.loads((self.inbox / pull.PULL_MANIFEST).read_text(encoding="utf-8"))
        self.assertTrue(manifest["manualSelectionRequired"])
        self.assertNotIn("nodeId", json.dumps(manifest))
        self.assertTrue(pull.status(self.root, self.config)["ok"])

    def test_dry_run_writes_nothing(self) -> None:
        summary = pull.pull_plan(
            self.root, self.config, self.plan, self.exports, self.directory_index, dry_run=True
        )
        self.assertEqual(summary["total"], 1)
        self.assertFalse(self.inbox.exists())

    def test_source_kind_must_be_figma_native_export(self) -> None:
        exports = copy.deepcopy(self.exports)
        exports[0]["sourceKind"] = "singleRawImage"
        with self.assertRaisesRegex(pull.PullError, "sourceKind must be figmaNativeExport"):
            pull.pull_plan(self.root, self.config, self.plan, exports, self.directory_index)

    def test_transparency_is_required(self) -> None:
        make_png(self.source, 2, 3, b"opaque", transparent=False)
        with self.assertRaisesRegex(pull.PullError, "must contain transparent"):
            pull.pull_plan(self.root, self.config, self.plan, self.exports, self.directory_index)
        self.assertFalse(self.inbox.exists())

    def test_wrong_export_size_fails(self) -> None:
        make_png(self.source, 3, 3, b"wrong")
        with self.assertRaisesRegex(pull.PullError, "expected 2x3"):
            pull.pull_plan(self.root, self.config, self.plan, self.exports, self.directory_index)

    def test_publish_failure_restores_previous_inbox(self) -> None:
        marker = self.inbox / "keep.txt"
        marker.parent.mkdir(parents=True)
        marker.write_text("keep", encoding="utf-8")
        with self.assertRaisesRegex(pull.PullError, "previous inbox was restored"):
            pull.pull_plan(
                self.root,
                self.config,
                self.plan,
                self.exports,
                self.directory_index,
                fail_after_backup=True,
            )
        self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    def test_status_detects_tampering(self) -> None:
        pull.pull_plan(self.root, self.config, self.plan, self.exports, self.directory_index)
        make_png(self.inbox / "组件库/元件/asset_btn.png", 2, 3, b"tampered")
        with self.assertRaisesRegex(pull.PullError, "hash"):
            pull.status(self.root, self.config)

    def test_secret_url_is_not_echoed(self) -> None:
        secret = "https://evil.example/secret-token"
        with self.assertRaises(pull.PullError) as raised:
            pull.download_export(
                {"nodeId": "1:1", "format": "png", "url": secret},
                self.root / "bad.png",
                ["www.figma.com"],
                1,
                0,
            )
        self.assertNotIn(secret, str(raised.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
