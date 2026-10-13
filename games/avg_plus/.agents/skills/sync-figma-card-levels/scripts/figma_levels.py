#!/usr/bin/env python3
"""figma_levels.py — 解析并审阅式同步 Figma 每关牌阵配置。

只消费 Figma MCP `get_figma_data`（本地 figma-developer-mcp）返回的节点结构：
- `locate`: 从无 nodeId 的整文件 JSON 中解析 `卡牌玩法界面` 页面 id。
- `plan`: 解析页面 JSON，把每个 level_difficultyX_YY / main 的 bp_poker 解析为 slot，
  把 bp_open_hand 的正面占位解析为可选 currentCard，写入临时审阅目录。
- `review-status` / `status`: 校验待审阅批次或正式配置。
- `promote --confirmed`: 人工确认后事务性更新正式 card-levels JSON。
- `discard-review --confirmed`: 丢弃被拒绝的批次。
- `guard-build`: 存在待审阅批次时失败。
- `verify`: 校验正式配置。

禁止下载图片、禁止持久化 nodeId 或 Cocos UUID。
"""

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET

try:
    import yaml
except ImportError:
    yaml = None

# ---------------------------------------------------------------------------
# 常量与命名规范
# ---------------------------------------------------------------------------

LEVEL_PATTERN = re.compile(r"^level_difficulty(?P<difficulty>\d+)_(?P<index>\d{2})$")
SLOT_ID_PATTERN = re.compile(r"^slot_\d{3}$")
BACK_CARD_PATTERN = re.compile(r"^poker_back_(\d{2})$")
FRONT_CARD_PATTERN = re.compile(r"^poker_(?P<suit>diamond|heart|spade|club)_(?P<color>red|black)_(?P<rank>\d{2})$")
WILD_CARD_NAME = "poker_wild"
CARD_WIDTH = 162
CARD_HEIGHT = 243

RANK_LABELS: Dict[str, str] = {
    "01": "A", "02": "2", "03": "3", "04": "4", "05": "5", "06": "6", "07": "7",
    "08": "8", "09": "9", "10": "10", "11": "J", "12": "Q", "13": "K",
}
SUIT_COLORS: Dict[str, str] = {"diamond": "red", "heart": "red", "spade": "black", "club": "black"}

CARD_LEVELS_REL = Path("assets/art/resources/config/card-levels")
REVIEW_REL = Path("temp/figma-card-levels-review")

CARD_NODE_TAGS = ("symbol", "instance", "component")
CONTAINER_TAGS = ("frame", "section", "group")


class LevelSyncError(Exception):
    """确定性失败，消息直接展示给用户。"""


def clean_xml_text(text: str) -> str:
    start = text.find("<")
    if start < 0:
        raise LevelSyncError("Metadata does not contain XML")
    end_marker = text.find("\nIMPORTANT:", start)
    if end_marker >= 0:
        text = text[:end_marker]
    return text[start:].strip()


def parse_xml(text: str) -> ET.Element:
    try:
        return ET.fromstring(clean_xml_text(text))
    except ET.ParseError as exc:
        raise LevelSyncError(f"Could not parse Figma metadata XML: {exc}") from exc


NODE_TAG_MAP = {
    "CANVAS": "canvas", "FRAME": "frame", "INSTANCE": "instance",
    "COMPONENT": "component", "SECTION": "section", "GROUP": "group",
    "SYMBOL": "symbol", "RECTANGLE": "rect", "TEXT": "text",
}


def json_node_to_xml(node: Dict[str, Any]) -> ET.Element:
    ntype = node.get("type")
    if not ntype and "template" in node:
        ntype = "FRAME"
    tag = NODE_TAG_MAP.get(ntype or "", "node")
    el = ET.Element(tag, name=node.get("name") or "", id=str(node.get("id") or ""))
    layout = node.get("layout")
    if isinstance(layout, dict):
        loc = layout.get("locationRelativeToParent") or {}
        dims = layout.get("dimensions") or {}
        el.set("x", str(loc.get("x", 0)))
        el.set("y", str(loc.get("y", 0)))
        if isinstance(dims.get("width"), (int, float)):
            el.set("width", str(dims["width"]))
        if isinstance(dims.get("height"), (int, float)):
            el.set("height", str(dims["height"]))
        el.set("rotation", str(layout.get("rotation", 0)))
    for child in node.get("children") or []:
        el.append(json_node_to_xml(child))
    return el


def unwrap_mcp_text(text: str) -> str:
    if not text.lstrip().startswith("{"):
        return text
    start = text.find("{")
    try:
        data = json.loads(text[start:])
    except json.JSONDecodeError:
        return text
    content = data.get("result", {}).get("content")
    if isinstance(content, list) and content:
        blocks = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
        if blocks:
            return "\n".join(blocks)
    return text


def load_design(text: str) -> Dict[str, Any]:
    text = unwrap_mcp_text(text)
    if text.lstrip().startswith("{"):
        start = text.find("{")
        try:
            return json.loads(text[start:])
        except json.JSONDecodeError as exc:
            raise LevelSyncError(f"Could not parse Figma metadata JSON: {exc}") from exc
    if yaml is None:
        raise LevelSyncError("需要 PyYAML 才能解析 Figma YAML 输出，请安装 PyYAML")
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise LevelSyncError(f"Could not parse Figma metadata YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise LevelSyncError("Figma metadata 必须为映射结构")
    return data


def figma_to_xml(text: str) -> ET.Element:
    data = load_design(text)
    root = ET.Element("canvas", name="__root__")
    for node in data.get("nodes") or []:
        root.append(json_node_to_xml(node))
    return root


def parse_figma(text: str) -> ET.Element:
    return figma_to_xml(text)


def write_output(value: Any, output: Optional[str] = None) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2)
    if output:
        Path(output).write_text(text, encoding="utf-8")
    else:
        print(text)


# ---------------------------------------------------------------------------
# locate / 页面解析
# ---------------------------------------------------------------------------

def locate_page(metadata_text: str, page_name: str) -> Dict[str, str]:
    if metadata_text.lstrip().startswith("-") or metadata_text.lstrip().startswith("<"):
        matches = []
        for line in metadata_text.splitlines():
            match = re.match(r"^-\s+(\d+:\d+):\s+(.+?)\s*$", line)
            if match and match.group(2) == page_name:
                matches.append({"nodeId": match.group(1), "name": match.group(2)})
        if len(matches) != 1:
            raise LevelSyncError(f"Expected one top-level page named {page_name!r}, found {len(matches)}")
        return matches[0]
    data = load_design(metadata_text)
    matches = [
        {"nodeId": node.get("id", ""), "name": node.get("name", "")}
        for node in data.get("nodes") or []
        if node.get("type") == "CANVAS" and node.get("name") == page_name
    ]
    if len(matches) != 1:
        raise LevelSyncError(f"Expected one top-level page named {page_name!r}, found {len(matches)}")
    return matches[0]


# ---------------------------------------------------------------------------
# 卡牌审计解析
# ---------------------------------------------------------------------------

def parse_figma_card(name: str) -> Dict[str, Any]:
    back = BACK_CARD_PATTERN.match(name)
    if back:
        return {"side": "back", "assetName": name, "variant": back.group(1)}
    front = FRONT_CARD_PATTERN.match(name)
    if front:
        suit, color, rank = front.group("suit"), front.group("color"), front.group("rank")
        if SUIT_COLORS[suit] != color:
            raise LevelSyncError(f"非法命名颜色：{name}（{suit} 必须为 {SUIT_COLORS[suit]}）")
        label = RANK_LABELS.get(rank)
        if not label:
            raise LevelSyncError(f"非法点数：{name}")
        return {
            "side": "front",
            "assetName": name,
            "suit": suit,
            "color": color,
            "rankCode": rank,
            "rankValue": int(rank),
            "label": label,
            "rankLabel": label,
        }
    if name == WILD_CARD_NAME:
        return {"side": "wild", "assetName": name}
    raise LevelSyncError(f"非牌名节点不能作为牌位：{name}")


def is_card_name(name: str) -> bool:
    return (
        BACK_CARD_PATTERN.match(name) is not None
        or FRONT_CARD_PATTERN.match(name) is not None
        or name == WILD_CARD_NAME
    )


# ---------------------------------------------------------------------------
# 节点树辅助
# ---------------------------------------------------------------------------

def direct_children(node: ET.Element, tags: Tuple[str, ...]) -> List[ET.Element]:
    return [child for child in list(node) if child.tag in tags]


def find_direct(node: ET.Element, name: str, tags: Tuple[str, ...] = CONTAINER_TAGS) -> Optional[ET.Element]:
    for child in list(node):
        if child.tag in tags and child.attrib.get("name") == name:
            return child
    return None


def unwrap_cards(node: ET.Element) -> List[ET.Element]:
    """读取节点下的牌名节点：直接在直接子级，或唯一 cards 容器内。"""
    direct = [c for c in list(node) if c.tag in CARD_NODE_TAGS]
    if direct:
        return direct
    cards = find_direct(node, "cards")
    if cards is not None:
        return [c for c in list(cards) if c.tag in CARD_NODE_TAGS]
    return []


def num(node: ET.Element, key: str, default: float = 0.0) -> float:
    raw = node.attrib.get(key)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        raise LevelSyncError(f"{node.attrib.get('name')} 的 {key} 非法：{raw}")


# ---------------------------------------------------------------------------
# slot 生成
# ---------------------------------------------------------------------------

def build_slot(node: ET.Element, parent_w: float, parent_h: float, z_index: int) -> Dict[str, Any]:
    name = node.attrib.get("name", "")
    x, y = num(node, "x"), num(node, "y")
    w, h = num(node, "width", CARD_WIDTH), num(node, "height", CARD_HEIGHT)
    if w <= 0 or h <= 0:
        raise LevelSyncError(f"{name} 尺寸非法：{w}×{h}")
    center_x = x + w / 2 - parent_w / 2
    center_y = parent_h / 2 - (y + h / 2)
    return {
        "nodeName": name,
        "nodeId": node.attrib.get("id", ""),
        "x": round(center_x, 3),
        "y": round(center_y, 3),
        "width": CARD_WIDTH,
        "height": CARD_HEIGHT,
        "rotation": num(node, "rotation"),
        "zIndex": z_index,
        "initialFaceUp": parse_figma_card(name)["side"] != "back",
        "figmaCard": parse_figma_card(name),
    }


def rects_overlap(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    ax0, ax1 = a["x"] - a["width"] / 2, a["x"] + a["width"] / 2
    ay0, ay1 = a["y"] - a["height"] / 2, a["y"] + a["height"] / 2
    bx0, bx1 = b["x"] - b["width"] / 2, b["x"] + b["width"] / 2
    by0, by1 = b["y"] - b["height"] / 2, b["y"] + b["height"] / 2
    return bx0 < ax1 and ax0 < bx1 and by0 < ay1 and ay0 < by1


def compute_covered_by(slots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for slot in slots:
        slot["coveredBy"] = []
        slot["covers"] = []
    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            if rects_overlap(slots[i], slots[j]):
                upper, lower = (slots[j], slots[i]) if slots[j]["zIndex"] > slots[i]["zIndex"] else (slots[i], slots[j])
                upper["covers"].append(lower["id"])
                lower["coveredBy"].append(upper["id"])
    return slots


def finalize_slots(raw_slots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    slots = []
    for index, raw in enumerate(raw_slots, start=1):
        slots.append({"id": f"slot_{index:03d}", **raw})
    return compute_covered_by(slots)


# ---------------------------------------------------------------------------
# currentCard 生成
# ---------------------------------------------------------------------------

def build_current_card(node: ET.Element) -> Optional[Dict[str, Any]]:
    candidates = [c.attrib.get("name", "") for c in unwrap_cards(node) if is_card_name(c.attrib.get("name", ""))]
    fronts = [name for name in candidates if FRONT_CARD_PATTERN.match(name)]
    if len(fronts) > 1:
        raise LevelSyncError(f"bp_open_hand 只能有 0 或 1 张正面牌，实际 {len(fronts)} 张：{sorted(fronts)}")
    if not fronts:
        return None
    name = fronts[0]
    return {"sourceName": name, "figmaCard": parse_figma_card(name)}


# ---------------------------------------------------------------------------
# 关卡解析
# ---------------------------------------------------------------------------

def build_level(frame: ET.Element) -> Dict[str, Any]:
    level_id = frame.attrib.get("name", "")
    match = LEVEL_PATTERN.match(level_id)
    if not match:
        raise LevelSyncError(f"非法关卡节点名：{level_id}")
    difficulty = int(match.group("difficulty"))

    main = find_direct(frame, "main")
    if main is None:
        raise LevelSyncError(f"{level_id} 缺少 main 子帧")
    bp_poker = find_direct(main, "bp_poker")
    if bp_poker is None:
        raise LevelSyncError(f"{level_id} / main 缺少 bp_poker")

    poker_w, poker_h = num(bp_poker, "width", CARD_WIDTH), num(bp_poker, "height", CARD_HEIGHT)
    raw_slots = []
    for child in unwrap_cards(bp_poker):
        if child.attrib.get("name") and is_card_name(child.attrib["name"]):
            raw_slots.append(build_slot(child, poker_w, poker_h, len(raw_slots) + 1))
    if not raw_slots:
        raise LevelSyncError(f"{level_id} / bp_poker 没有任何牌位")

    slots = finalize_slots(raw_slots)
    bp_open_hand = find_direct(main, "bp_open_hand")
    current_card = build_current_card(bp_open_hand) if bp_open_hand is not None else None

    design_w, design_h = poker_w, poker_h

    level: Dict[str, Any] = {
        "schemaVersion": 1,
        "levelId": level_id,
        "difficulty": difficulty,
        "source": {"type": "figma", "pageName": "卡牌玩法界面", "frameName": level_id},
        "designSize": {"width": design_w, "height": design_h},
        "cardSize": {"width": CARD_WIDTH, "height": CARD_HEIGHT},
        "slots": [
            {
                "id": slot["id"],
                "sourceName": slot["figmaCard"]["assetName"],
                "x": slot["x"],
                "y": slot["y"],
                "width": slot["width"],
                "height": slot["height"],
                "rotation": slot["rotation"],
                "zIndex": slot["zIndex"],
                "initialFaceUp": slot["initialFaceUp"],
                "coveredBy": slot["coveredBy"],
                "figmaCard": slot["figmaCard"],
                "covers": slot["covers"],
                "nodeId": slot["nodeId"],
            }
            for slot in slots
        ],
    }
    if current_card is not None:
        level["currentCard"] = current_card
    return level


# ---------------------------------------------------------------------------
# 校验（镜像 CardLevelRepository）
# ---------------------------------------------------------------------------

def validate_front_audit(level_id: str, label: str, audit: Dict[str, Any]) -> None:
    name = audit.get("assetName", "")
    match = FRONT_CARD_PATTERN.match(name)
    if not match:
        raise LevelSyncError(f"{level_id} / {label} 正面牌名称非法：{name}")
    suit, color, rank = match.group("suit"), match.group("color"), match.group("rank")
    rank_value = int(rank)
    rank_label = RANK_LABELS[rank]
    if SUIT_COLORS[suit] != color or not rank_label:
        raise LevelSyncError(f"{level_id} / {label} 正面牌命名不在允许矩阵内：{name}")
    expected = {
        "suit": suit, "color": color, "rankCode": rank,
        "rankValue": rank_value, "label": rank_label, "rankLabel": rank_label,
    }
    for key, value in expected.items():
        if audit.get(key) != value:
            raise LevelSyncError(f"{level_id} / {label} 正面牌审计不一致：{key} {audit.get(key)!r} != {value!r}")


def validate_level(level: Dict[str, Any]) -> None:
    level_id = level.get("levelId", "")
    if level.get("schemaVersion") != 1:
        raise LevelSyncError(f"{level_id} schemaVersion 必须为 1")
    if not LEVEL_PATTERN.match(level_id):
        raise LevelSyncError(f"{level_id} levelId 非法")
    slots = level.get("slots") or []
    if not slots:
        raise LevelSyncError(f"{level_id} 至少需要一个 slot")
    ids = set()
    for slot in slots:
        if not SLOT_ID_PATTERN.match(slot.get("id", "")):
            raise LevelSyncError(f"{level_id} slot id 非法：{slot.get('id')}")
        if slot["id"] in ids:
            raise LevelSyncError(f"{level_id} 存在重复 slot：{slot['id']}")
        ids.add(slot["id"])
        figma_card = slot.get("figmaCard")
        if not figma_card or figma_card.get("assetName") != slot.get("sourceName"):
            raise LevelSyncError(f"{level_id} / {slot['id']} sourceName 与 figmaCard.assetName 不一致")
        if figma_card.get("side") == "front":
            validate_front_audit(level_id, slot["id"], figma_card)
        elif figma_card.get("side") == "back":
            if not BACK_CARD_PATTERN.match(figma_card.get("assetName", "")):
                raise LevelSyncError(f"{level_id} / {slot['id']} 背面牌审计非法")
        elif figma_card.get("side") == "wild" and figma_card.get("assetName") != WILD_CARD_NAME:
            raise LevelSyncError(f"{level_id} / {slot['id']} wild 审计非法")
    for slot in slots:
        for covered_by in slot.get("coveredBy") or []:
            if covered_by not in ids:
                raise LevelSyncError(f"{level_id} / {slot['id']} coveredBy 引用不存在：{covered_by}")
        for covers in slot.get("covers") or []:
            if covers not in ids:
                raise LevelSyncError(f"{level_id} / {slot['id']} covers 引用不存在：{covers}")

    current = level.get("currentCard")
    if current is None:
        return
    audit = current.get("figmaCard")
    if not audit or audit.get("side") != "front":
        raise LevelSyncError(f"{level_id} currentCard 必须是正面牌")
    if current.get("sourceName") != audit.get("assetName"):
        raise LevelSyncError(f"{level_id} currentCard.sourceName 与 figmaCard.assetName 不一致")
    validate_front_audit(level_id, "currentCard", audit)
    for slot in slots:
        if slot["figmaCard"].get("side") == "front" and slot["figmaCard"].get("suit") == audit.get("suit") and slot["figmaCard"].get("rankCode") == audit.get("rankCode"):
            raise LevelSyncError(f"{level_id} currentCard 与 {slot['id']} 指定了同一张牌：{audit['assetName']}")


# ---------------------------------------------------------------------------
# plan / stage / review
# ---------------------------------------------------------------------------

def load_existing(level_id: str, card_root: Path) -> Optional[Dict[str, Any]]:
    path = card_root / f"{level_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LevelSyncError(f"现有配置读取失败：{path}：{exc}") from exc


def plan(metadata_text: str, levels_dir: Optional[Path] = None) -> Dict[str, Any]:
    root = parse_figma(metadata_text)
    page = root
    if root.attrib.get("name") != "卡牌玩法界面":
        page = find_direct(root, "卡牌玩法界面", ("canvas",))
        if page is None:
            raise LevelSyncError("页面必须为 卡牌玩法界面")
    frames = [
        frame for frame in direct_children(page, ("frame", "section", "group"))
        if LEVEL_PATTERN.match(frame.attrib.get("name", ""))
    ]
    if not frames:
        raise LevelSyncError("未找到任何 level_difficultyX_YY 关卡节点")
    levels = []
    for frame in frames:
        level_id = frame.attrib.get("name", "")
        if levels_dir is not None:
            path = next(
                (levels_dir / f"{level_id}{ext}" for ext in (".json", ".yaml") if (levels_dir / f"{level_id}{ext}").exists()),
                None,
            )
            if path is None:
                raise LevelSyncError(f"缺少关卡配置：{levels_dir / level_id}(.json/.yaml)")
            level_root = parse_figma(path.read_text(encoding="utf-8"))
            candidates = [el for el in list(level_root) if el.attrib.get("name") == level_id]
            if len(candidates) != 1:
                raise LevelSyncError(f"关卡配置必须包含唯一的 {level_id} 根节点：{path}")
            frame = candidates[0]
        levels.append(build_level(frame))
    if not levels:
        raise LevelSyncError("未找到任何 level_difficultyX_YY 关卡节点")
    for level in levels:
        validate_level(level)
    return {"page": "卡牌玩法界面", "count": len(levels), "levels": levels}


def stage(plan_result: Dict[str, Any], root_dir: Path, rotations: Optional[Dict[str, Dict[str, int]]] = None) -> Dict[str, Any]:
    review_dir = root_dir / REVIEW_REL
    card_root = root_dir / CARD_LEVELS_REL
    if review_dir.exists():
        raise LevelSyncError(f"已有待审阅批次：{review_dir}，请先 review-status 并 promote 或 discard")
    review_dir.mkdir(parents=True, exist_ok=False)
    manifest = []
    for level in plan_result["levels"]:
        level_id = level["levelId"]
        existing = load_existing(level_id, card_root)
        if rotations is not None:
            rot_map = rotations.get(level_id)
            if not rot_map:
                raise LevelSyncError(f"缺少 {level_id} 的 rotation 映射")
            for slot in level["slots"]:
                node_id = slot.get("nodeId", "")
                if node_id not in rot_map:
                    raise LevelSyncError(f"{level_id} / {slot['id']} 缺少 nodeId {node_id!r} 的 rotation")
                slot["rotation"] = int(rot_map[node_id])
                slot.pop("nodeId", None)
        else:
            for slot in level["slots"]:
                slot.pop("nodeId", None)
        manifest.append({
            "levelId": level_id,
            "isNew": existing is None,
            "existingSlotCount": len((existing or {}).get("slots") or []),
            "existingCurrentCard": (existing or {}).get("currentCard"),
            "plannedCurrentCard": level.get("currentCard"),
            "slotCount": len(level["slots"]),
        })
        (review_dir / f"{level_id}.json").write_text(json.dumps(level, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = review_dir / "review-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"reviewDir": str(review_dir.relative_to(root_dir)), "levels": manifest}


def read_review_manifest(root_dir: Path) -> Tuple[Path, List[Dict[str, Any]]]:
    review_dir = root_dir / REVIEW_REL
    manifest_path = review_dir / "review-manifest.json"
    if not manifest_path.exists():
        raise LevelSyncError(f"没有待审阅批次：{review_dir}")
    return review_dir, json.loads(manifest_path.read_text(encoding="utf-8"))


def _patch_existing(level_id: str, planned: Dict[str, Any], card_root: Path) -> Tuple[str, Dict[str, Any]]:
    """existing JSON 只更新 currentCard；全新关卡返回 planned。"""
    existing = load_existing(level_id, card_root)
    if existing is None:
        return level_id, planned
    if "currentCard" in planned:
        existing["currentCard"] = planned["currentCard"]
    else:
        existing.pop("currentCard", None)
    return level_id, existing


def promote(root_dir: Path, confirmed: bool) -> Dict[str, Any]:
    if not confirmed:
        raise LevelSyncError("promote 必须显式 --confirmed")
    review_dir, manifest = read_review_manifest(root_dir)
    card_root = root_dir / CARD_LEVELS_REL
    updated = []
    backups = {}
    for entry in manifest:
        level_id = entry["levelId"]
        planned = json.loads((review_dir / f"{level_id}.json").read_text(encoding="utf-8"))
        validate_level(planned)
        _, target = _patch_existing(level_id, planned, card_root)
        validate_level(target)
        target_path = card_root / f"{level_id}.json"
        if target_path.exists():
            backups[str(target_path)] = target_path.read_bytes()
        updated.append(level_id)
    try:
        for entry in manifest:
            level_id = entry["levelId"]
            planned = json.loads((review_dir / f"{level_id}.json").read_text(encoding="utf-8"))
            _, target = _patch_existing(level_id, planned, card_root)
            target_path = card_root / f"{level_id}.json"
            target_path.write_text(json.dumps(target, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception as exc:
        for path_text, data in backups.items():
            Path(path_text).write_bytes(data)
        raise LevelSyncError(f"promote 失败已回滚：{exc}") from exc
    for path in sorted(review_dir.rglob("*")):
        if path.is_file():
            path.unlink()
    review_dir.rmdir()
    return {"promoted": updated}


def discard_review(root_dir: Path, confirmed: bool) -> Dict[str, Any]:
    if not confirmed:
        raise LevelSyncError("discard-review 必须显式 --confirmed")
    review_dir, _ = read_review_manifest(root_dir)
    for path in sorted(review_dir.rglob("*")):
        if path.is_file():
            path.unlink()
    review_dir.rmdir()
    return {"discarded": True}


def verify(card_root: Path) -> Dict[str, Any]:
    results = []
    for path in sorted(card_root.glob("*.json")):
        try:
            validate_level(json.loads(path.read_text(encoding="utf-8")))
            results.append({"levelId": path.stem, "ok": True})
        except (LevelSyncError, json.JSONDecodeError) as exc:
            results.append({"levelId": path.stem, "ok": False, "error": str(exc)})
    failed = [r for r in results if not r["ok"]]
    return {"ok": not failed, "results": results}


def review_status(root_dir: Path) -> Dict[str, Any]:
    review_dir = root_dir / REVIEW_REL
    if not review_dir.exists():
        return {"pending": False, **verify(root_dir / CARD_LEVELS_REL)}
    manifest = json.loads((review_dir / "review-manifest.json").read_text(encoding="utf-8"))
    return {"pending": True, "reviewDir": str(review_dir.relative_to(root_dir)), "levels": manifest}


def guard_build(root_dir: Path) -> Dict[str, Any]:
    if (root_dir / REVIEW_REL).exists():
        raise LevelSyncError(f"存在未确认的牌阵审阅批次：{REVIEW_REL}，必须先 promote 或 discard")
    return {"ok": True}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="审阅式同步 Figma 每关牌阵配置")
    sub = parser.add_subparsers(dest="command", required=True)

    locate = sub.add_parser("locate", help="从顶层页面列表解析页面 id")
    locate.add_argument("--metadata", required=True)
    locate.add_argument("--page", default="卡牌玩法界面")
    locate.add_argument("--output")

    plan_ = sub.add_parser("plan", help="解析页面配置生成每关 stage JSON")
    plan_.add_argument("--metadata", required=True)
    plan_.add_argument("--levels-dir", help="逐关 YAML 目录（本地 get_figma_data 按关卡 nodeId 拉取）")
    plan_.add_argument("--output")
    plan_.add_argument("--root", default=".")

    stage_ = sub.add_parser("stage", help="把 plan 结果写入临时审阅目录")
    stage_.add_argument("--plan", required=True)
    stage_.add_argument("--rotations", help="逐关 rotation 映射 JSON（nodeId → 角度，由 figma_rotations.py 从 Figma REST API 生成）")
    stage_.add_argument("--root", default=".")

    for name in ("review-status", "status"):
        cmd = sub.add_parser(name, help="报告待审阅批次或校验正式配置")
        cmd.add_argument("--root", default=".")

    promote_ = sub.add_parser("promote", help="确认后更新正式配置")
    promote_.add_argument("--root", default=".")
    promote_.add_argument("--confirmed", action="store_true")

    discard_ = sub.add_parser("discard-review", help="丢弃被拒绝的审阅批次")
    discard_.add_argument("--root", default=".")
    discard_.add_argument("--confirmed", action="store_true")

    guard_ = sub.add_parser("guard-build", help="存在待审阅批次时失败")
    guard_.add_argument("--root", default=".")

    verify_ = sub.add_parser("verify", help="校验正式配置")
    verify_.add_argument("--root", default=".")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "locate":
            result = locate_page(Path(args.metadata).read_text(encoding="utf-8"), args.page)
            write_output(result, args.output)
            return 0
        root_dir = Path(args.root).resolve()
        if args.command == "plan":
            levels_dir = Path(args.levels_dir).resolve() if args.levels_dir else None
            result = plan(Path(args.metadata).read_text(encoding="utf-8"), levels_dir)
            write_output({"page": result["page"], "count": result["count"], "levels": result["levels"]}, args.output)
        elif args.command == "stage":
            rotations = None
            if args.rotations:
                rotations = json.loads(Path(args.rotations).read_text(encoding="utf-8"))
            result = stage(json.loads(Path(args.plan).read_text(encoding="utf-8")), root_dir, rotations)
            write_output(result)
        elif args.command in ("review-status", "status"):
            write_output(review_status(root_dir))
        elif args.command == "promote":
            write_output(promote(root_dir, args.confirmed))
        elif args.command == "discard-review":
            write_output(discard_review(root_dir, args.confirmed))
        elif args.command == "guard-build":
            write_output(guard_build(root_dir))
        elif args.command == "verify":
            write_output(verify(root_dir / CARD_LEVELS_REL))
        return 0
    except LevelSyncError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
