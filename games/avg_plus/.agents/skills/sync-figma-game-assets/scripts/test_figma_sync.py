#!/usr/bin/env python3
"""Tests for the project Figma card staging and promotion helper."""

from __future__ import annotations

import binascii
import copy
import importlib.util
import json
import tempfile
import unittest
import zlib
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("figma_sync.py")
SPEC = importlib.util.spec_from_file_location("figma_sync", SCRIPT_PATH)
assert SPEC and SPEC.loader
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)
REPO_ROOT = Path(__file__).resolve().parents[4]


def make_png(path: Path, width: int, height: int, payload: bytes = b"", transparent: bool = False) -> None:
    def chunk(kind: bytes, data: bytes) -> bytes:
        checksum = binascii.crc32(kind + data) & 0xFFFFFFFF
        return len(data).to_bytes(4, "big") + kind + data + checksum.to_bytes(4, "big")

    path.parent.mkdir(parents=True, exist_ok=True)
    color = sum(payload) % 256
    rows = []
    for y in range(height):
        pixels = bytearray()
        for x in range(width):
            alpha = 0 if transparent and x == 0 and y == 0 else 255
            pixels.extend((color, 20, 30, alpha))
        rows.append(b"\x00" + bytes(pixels))
    ihdr = width.to_bytes(4, "big") + height.to_bytes(4, "big") + bytes((8, 6, 0, 0, 0))
    path.write_bytes(
        sync.PNG_SIGNATURE
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(rows)))
        + chunk(b"IEND", b"")
    )


def poker_metadata() -> str:
    suit_colors = {
        "diamond": "red",
        "heart": "red",
        "spade": "black",
        "club": "black",
    }
    lines = ['<frame id="2:2" name="卡牌资源" x="0" y="0" width="4539" height="2133">']
    node = 1
    for suit, color in suit_colors.items():
        for rank in range(1, 14):
            lines.append(
                f'  <symbol id="2:{node}" name="poker_{suit}_{color}_{rank:02d}" '
                'x="0" y="0" width="162" height="243" />'
            )
            node += 1
    lines.append('  <symbol id="2:900" name="poker_wild" x="0" y="0" width="162" height="243" />')
    lines.append('  <symbol id="2:901" name="poker_back_01" x="0" y="0" width="162" height="243" />')
    lines.append("</frame>")
    return "\n".join(lines)


def mini_config() -> dict:
    return {
        "schemaVersion": 1,
        "figma": {"fileUrl": "https://www.figma.com/design/test-file/Test"},
        "temporaryDirectory": "temp/sync",
        "lockFile": "figma-assets.lock.json",
        "download": {
            "allowedHosts": ["www.figma.com"],
            "maxConcurrency": 2,
            "timeoutSeconds": 1,
            "retries": 0,
        },
        "groups": [
            {
                "id": "mini",
                "sourcePath": ["Resources", "Mini"],
                "matchPrefix": "asset_",
                "nodeTypes": ["symbol"],
                "expectedSize": {"width": 2, "height": 3},
                "downloadSource": "singleRawImage",
                "transparency": "required",
                "outputRoot": "assets/art/resources/mini",
                "reviewRoot": "assets/art/resources/__figma_review__/mini",
                "catalog": {
                    "path": "assets/art/resources/mini/catalog.json",
                    "schemaVersion": 2,
                },
                "rules": [
                    {
                        "id": "front",
                        "pattern": r"^asset_(?P<code>[a-z]+)$",
                        "kind": "front",
                        "semanticId": "{code}",
                        "output": "fronts/{name}.png",
                        "resourcePath": "mini/fronts/{name}/spriteFrame",
                        "catalogSection": "fronts",
                        "matrix": {
                            "allowAdditional": False,
                            "dimensions": [{"capture": "code", "values": ["one"]}],
                        },
                        "catalogFields": {"code": {"capture": "code"}},
                    }
                ],
            }
        ],
    }


def mini_metadata(node_id: str = "1:1") -> str:
    return (
        '<frame id="1:0" name="Mini" x="0" y="0" width="2" height="3">\n'
        f'  <symbol id="{node_id}" name="asset_one" x="0" y="0" width="2" height="3" />\n'
        "</frame>"
    )


class PokerParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = sync.load_json(REPO_ROOT / "figma-assets.config.json")
        cls.group = sync.group_by_id(cls.config, "poker")

    def test_config_is_source_path_and_review_driven(self) -> None:
        sync.validate_config(self.config)
        self.assertEqual(self.group["sourcePath"], ["游戏资源", "卡牌资源"])
        self.assertEqual(self.group["reviewRoot"], "assets/art/resources/assets/__figma_review__/poker")
        self.assertNotIn("pageName", self.config["figma"])
        self.assertNotIn("frameName", self.group)

    def test_complete_deck_and_catalog_semantics(self) -> None:
        plan = sync.plan_group(self.config, self.group, poker_metadata())
        self.assertEqual(plan["schemaVersion"], 2)
        self.assertEqual(plan["sourcePath"], ["游戏资源", "卡牌资源"])
        self.assertEqual(len(plan["assets"]), 54)
        club_ace = next(item for item in plan["assets"] if item["name"] == "poker_club_black_01")
        self.assertEqual(club_ace["semanticId"], "club:01")
        self.assertEqual(
            club_ace["catalogFields"],
            {"suit": "club", "color": "black", "rankCode": "01", "rankValue": 1, "label": "A"},
        )
        king = next(item for item in plan["assets"] if item["name"] == "poker_heart_red_13")
        self.assertEqual(king["catalogFields"]["label"], "K")

    def test_wrong_suit_color_fails(self) -> None:
        metadata = poker_metadata().replace("poker_club_black_01", "poker_club_red_01")
        with self.assertRaisesRegex(sync.SyncError, "expected color='black'"):
            sync.plan_group(self.config, self.group, metadata)

    def test_out_of_range_rank_fails(self) -> None:
        metadata = poker_metadata().replace("poker_club_black_13", "poker_club_black_14")
        with self.assertRaisesRegex(sync.SyncError, "no mapping for '14'"):
            sync.plan_group(self.config, self.group, metadata)

    def test_duplicate_semantic_id_fails(self) -> None:
        config = copy.deepcopy(self.config)
        config["groups"][0]["rules"][0]["semanticId"] = "same-card"
        with self.assertRaisesRegex(sync.SyncError, "Duplicate semantic ID"):
            sync.plan_group(config, config["groups"][0], poker_metadata())

    def test_duplicate_name_fails(self) -> None:
        metadata = poker_metadata().replace(
            "</frame>",
            '  <symbol id="9:9" name="poker_club_black_01" x="0" y="0" width="162" height="243" />\n</frame>',
        )
        with self.assertRaisesRegex(sync.SyncError, "Duplicate Figma component name"):
            sync.plan_group(self.config, self.group, metadata)

    def test_missing_card_fails(self) -> None:
        line = '  <symbol id="2:1" name="poker_diamond_red_01" x="0" y="0" width="162" height="243" />\n'
        with self.assertRaisesRegex(sync.SyncError, "missing required combinations"):
            sync.plan_group(self.config, self.group, poker_metadata().replace(line, ""))

    def test_wrong_dimensions_fail(self) -> None:
        metadata = poker_metadata().replace(
            'name="poker_club_black_01" x="0" y="0" width="162" height="243"',
            'name="poker_club_black_01" x="0" y="0" width="163" height="243"',
        )
        with self.assertRaisesRegex(sync.SyncError, "expected 162x243"):
            sync.plan_group(self.config, self.group, metadata)

    def test_unrecognized_prefixed_component_fails(self) -> None:
        metadata = poker_metadata().replace(
            "</frame>",
            '  <symbol id="9:10" name="poker_unknown" x="0" y="0" width="162" height="243" />\n</frame>',
        )
        with self.assertRaisesRegex(sync.SyncError, "matched 0 configured rules"):
            sync.plan_group(self.config, self.group, metadata)

    def test_output_path_traversal_fails(self) -> None:
        config = copy.deepcopy(self.config)
        config["groups"][0]["rules"][0]["output"] = "../{name}.png"
        with self.assertRaisesRegex(sync.SyncError, "output path escapes"):
            sync.plan_group(config, config["groups"][0], poker_metadata())


class LocatorTests(unittest.TestCase):
    def test_source_path_lookup_is_exact_and_hierarchical(self) -> None:
        group = mini_config()["groups"][0]
        pages = "Top-level pages of the document:\n- 0:1: Resources\n- 3:1: Other"
        page = sync.locate_source(pages, group, 0)
        self.assertEqual(page["nodeId"], "0:1")
        self.assertFalse(page["complete"])
        page_xml = '<canvas id="0:1" name="Resources"><frame id="2:2" name="Mini" /></canvas>'
        frame = sync.locate_source(page_xml, group, 1)
        self.assertEqual(frame["nodeId"], "2:2")
        self.assertTrue(frame["complete"])

    def test_source_path_does_not_fuzzy_match_nested_directory(self) -> None:
        group = mini_config()["groups"][0]
        page_xml = (
            '<canvas id="0:1" name="Resources"><frame id="2:1" name="Wrapper">'
            '<frame id="2:2" name="Mini" /></frame></canvas>'
        )
        with self.assertRaisesRegex(sync.SyncError, "direct child"):
            sync.locate_source(page_xml, group, 1)


class StagePromoteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config = mini_config()
        self.group = self.config["groups"][0]
        self.plan = sync.plan_group(self.config, self.group, mini_metadata())
        self.source = self.root / "source.png"
        make_png(self.source, 2, 3, b"new", transparent=True)
        self.exports = [
            {
                "nodeId": "1:1",
                "format": "png",
                "sourceKind": "singleRawImage",
                "sourcePath": str(self.source),
            }
        ]

    def tearDown(self) -> None:
        self.temp.cleanup()

    @property
    def review_root(self) -> Path:
        return self.root / self.group["reviewRoot"]

    @property
    def target(self) -> Path:
        return self.root / "assets/art/resources/mini/fronts/asset_one.png"

    def stage(self, **kwargs: object) -> dict:
        return sync.stage_review(self.root, self.config, self.plan, self.exports, **kwargs)

    def test_stage_creates_review_without_touching_formal_files(self) -> None:
        summary = self.stage()
        self.assertEqual(summary["added"], 1)
        self.assertTrue(summary["pendingConfirmation"])
        self.assertFalse(self.target.exists())
        self.assertFalse((self.root / "figma-assets.lock.json").exists())
        self.assertFalse((self.root / "assets/art/resources/mini/catalog.json").exists())
        staged = self.review_root / "fronts/asset_one.png"
        self.assertEqual(staged.read_bytes(), self.source.read_bytes())
        manifest = json.loads((self.review_root / sync.REVIEW_MANIFEST).read_text(encoding="utf-8"))
        self.assertEqual(manifest["total"], 1)
        self.assertEqual(manifest["assets"]["asset_one"]["targetPath"], str(self.target.relative_to(self.root)))
        serialized = json.dumps(manifest).lower()
        self.assertNotIn("nodeid", serialized)
        self.assertNotIn("uuid", serialized)
        self.assertEqual(manifest["assets"]["asset_one"]["alpha"]["transparent"], 1)

    def test_pending_review_blocks_restage_and_build(self) -> None:
        self.stage()
        self.assertTrue(sync.sync_status(self.root, self.config, "mini")["pendingConfirmation"])
        with self.assertRaisesRegex(sync.SyncError, "Pending review already exists"):
            self.stage()
        with self.assertRaisesRegex(sync.SyncError, "blocks build/release"):
            sync.guard_build(self.root, self.config)

    def test_dry_run_validates_but_writes_nothing(self) -> None:
        summary = self.stage(dry_run=True)
        self.assertEqual(summary["added"], 1)
        self.assertFalse(self.review_root.exists())
        self.assertFalse(self.target.exists())

    def test_source_kind_is_mandatory(self) -> None:
        exports = [{"nodeId": "1:1", "format": "png", "sourcePath": str(self.source)}]
        with self.assertRaisesRegex(sync.SyncError, "sourceKind must be singleRawImage"):
            sync.stage_review(self.root, self.config, self.plan, exports)

    def test_required_transparency_rejects_opaque_png(self) -> None:
        make_png(self.source, 2, 3, b"opaque", transparent=False)
        with self.assertRaisesRegex(sync.SyncError, "must contain transparent"):
            self.stage()
        self.assertFalse(self.review_root.exists())

    def test_promote_requires_explicit_confirmation(self) -> None:
        self.stage()
        with self.assertRaisesRegex(sync.SyncError, "explicit confirmation"):
            sync.promote_review(self.root, self.config, "mini", confirmed=False)
        self.assertTrue(self.review_root.exists())
        self.assertFalse(self.target.exists())

    def test_changed_asset_promotes_transactionally_and_preserves_meta(self) -> None:
        make_png(self.target, 2, 3, b"old", transparent=True)
        meta = self.target.with_suffix(".png.meta")
        meta.write_text('{"uuid":"keep-me"}', encoding="utf-8")
        self.stage()
        summary = sync.promote_review(self.root, self.config, "mini", confirmed=True)
        self.assertEqual(summary["changed"], 1)
        self.assertEqual(self.target.read_bytes(), self.source.read_bytes())
        self.assertEqual(meta.read_text(encoding="utf-8"), '{"uuid":"keep-me"}')
        self.assertFalse(self.review_root.exists())
        self.assertTrue(sync.guard_build(self.root, self.config)["ok"])
        lock = json.loads((self.root / "figma-assets.lock.json").read_text(encoding="utf-8"))
        self.assertEqual(lock["schemaVersion"], 2)
        self.assertIn("asset_one", lock["assets"])
        self.assertNotIn("nodeId", json.dumps(lock))
        self.assertNotIn("uuid", json.dumps(lock).lower())
        catalog = json.loads((self.root / "assets/art/resources/mini/catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["assets"]["asset_one"]["resourcePath"], "mini/fronts/asset_one/spriteFrame")

    def test_node_id_change_has_no_persistent_effect(self) -> None:
        self.stage()
        sync.promote_review(self.root, self.config, "mini", confirmed=True)
        target_mtime = self.target.stat().st_mtime_ns
        lock_before = (self.root / "figma-assets.lock.json").read_bytes()
        new_plan = sync.plan_group(self.config, self.group, mini_metadata("1:2"))
        new_exports = [
            {
                "nodeId": "1:2",
                "format": "png",
                "sourceKind": "singleRawImage",
                "sourcePath": str(self.source),
            }
        ]
        summary = sync.stage_review(self.root, self.config, new_plan, new_exports)
        self.assertEqual(summary["unchanged"], 1)
        promoted = sync.promote_review(self.root, self.config, "mini", confirmed=True)
        self.assertEqual(promoted["unchanged"], 1)
        self.assertEqual(self.target.stat().st_mtime_ns, target_mtime)
        self.assertEqual((self.root / "figma-assets.lock.json").read_bytes(), lock_before)

    def test_tampered_review_fails_without_touching_formal(self) -> None:
        make_png(self.target, 2, 3, b"old", transparent=True)
        old_bytes = self.target.read_bytes()
        self.stage()
        make_png(self.review_root / "fronts/asset_one.png", 2, 3, b"tampered", transparent=True)
        with self.assertRaisesRegex(sync.SyncError, "hash changed"):
            sync.promote_review(self.root, self.config, "mini", confirmed=True)
        self.assertEqual(self.target.read_bytes(), old_bytes)
        self.assertTrue(self.review_root.exists())

    def test_promotion_failure_rolls_back_and_keeps_review(self) -> None:
        make_png(self.target, 2, 3, b"old", transparent=True)
        old_bytes = self.target.read_bytes()
        self.stage()
        with self.assertRaisesRegex(sync.SyncError, "rolled back"):
            sync.promote_review(
                self.root,
                self.config,
                "mini",
                confirmed=True,
                transaction_fail_after=1,
            )
        self.assertEqual(self.target.read_bytes(), old_bytes)
        self.assertTrue(self.review_root.exists())
        self.assertFalse((self.root / "figma-assets.lock.json").exists())

    def test_stale_entry_is_retained_and_not_deleted(self) -> None:
        self.stage()
        sync.promote_review(self.root, self.config, "mini", confirmed=True)
        stale_path = self.root / "assets/art/resources/mini/fronts/asset_old.png"
        make_png(stale_path, 2, 3, b"old", transparent=True)
        lock_path = self.root / "figma-assets.lock.json"
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        lock["assets"]["asset_old"] = {
            "group": "mini",
            "semanticId": "old",
            "localPath": "assets/art/resources/mini/fronts/asset_old.png",
            "width": 2,
            "height": 3,
            "sha256": sync.sha256_file(stale_path),
            "hasTransparency": True,
            "status": "active",
        }
        lock_path.write_bytes(sync.canonical_json_bytes(lock))
        self.stage()
        summary = sync.promote_review(self.root, self.config, "mini", confirmed=True)
        self.assertEqual(summary["stale"], 1)
        self.assertTrue(stale_path.exists())
        updated = json.loads(lock_path.read_text(encoding="utf-8"))
        self.assertEqual(updated["assets"]["asset_old"]["status"], "stale")

    def test_discard_requires_confirmation_and_removes_only_review(self) -> None:
        self.stage()
        with self.assertRaisesRegex(sync.SyncError, "explicit confirmation"):
            sync.discard_review(self.root, self.config, "mini", confirmed=False)
        self.assertTrue(self.review_root.exists())
        result = sync.discard_review(self.root, self.config, "mini", confirmed=True)
        self.assertTrue(result["discarded"])
        self.assertFalse(self.review_root.exists())

    def test_url_error_does_not_echo_secret(self) -> None:
        secret_url = "https://evil.example/secret-token"
        with self.assertRaises(sync.SyncError) as raised:
            sync.download_export(
                {"nodeId": "1:1", "format": "png", "url": secret_url},
                self.root / "bad.png",
                ["www.figma.com"],
                1,
                0,
            )
        self.assertNotIn(secret_url, str(raised.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
