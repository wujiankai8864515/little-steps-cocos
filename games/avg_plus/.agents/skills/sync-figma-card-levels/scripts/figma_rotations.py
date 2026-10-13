#!/usr/bin/env python3
"""figma_rotations.py — 从 Figma REST API 读取每关 bp_poker 每张牌的旋转角度。

只读 metadata，禁止下载图片。读取 levels-dir 中逐关 get_figma_data JSON（信封已解包），
按关卡帧 id 批量调用 `GET /v1/files/<fileKey>/nodes`，把每张牌的 Figma rotation（弧度）
换算为与既有 JSON 一致的度数约定：`角度 = -round(弧度×180/π)`，无 rotation 记 0。
输出 `{ levelId: { cardNodeId: 角度 } }`，供 `figma_levels.py stage --rotations` 使用。
"""

import argparse
import json
import math
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict


def load_content_text(text: str) -> str:
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


def find_child(nodes: list, name: str) -> Dict[str, Any]:
    for node in nodes:
        if node.get("name") == name:
            return node
    raise ValueError(f"缺少子节点：{name}")


def collect_levels(levels_dir: Path) -> Dict[str, Dict[str, Any]]:
    levels = {}
    for path in sorted(levels_dir.glob("*.json")):
        data = json.loads(load_content_text(path.read_text(encoding="utf-8")))
        nodes = data.get("nodes") or []
        if not nodes:
            raise ValueError(f"{path} 没有根节点")
        doc = nodes[0]
        level_id = doc.get("name", "")
        main = find_child(doc.get("children") or [], "main")
        poker = find_child(main.get("children") or [], "bp_poker")
        levels[level_id] = {
            "frameId": doc.get("id", ""),
            "cardIds": [c.get("id", "") for c in poker.get("children") or []],
        }
    return levels


def fetch_rotations(file_key: str, frame_ids: list, token: str) -> Dict[str, Dict[str, float]]:
    ids = ",".join(frame_ids)
    url = f"https://api.figma.com/v1/files/{file_key}/nodes?ids={ids}"
    req = urllib.request.Request(url, headers={"X-Figma-Token": token})
    with urllib.request.urlopen(req) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    result = {}
    for frame_id in frame_ids:
        frame = (payload.get("nodes") or {}).get(frame_id, {}).get("document")
        if frame is None:
            raise ValueError(f"REST 返回缺少节点：{frame_id}")
        main = find_child(frame.get("children") or [], "main")
        poker = find_child(main.get("children") or [], "bp_poker")
        rotations = {}
        for child in poker.get("children") or []:
            rad = child.get("rotation")
            rotations[child.get("id", "")] = int(0 if rad is None else -round(rad * 180 / math.pi))
        result[frame_id] = rotations
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="从 Figma REST API 读取每张牌的旋转角度")
    parser.add_argument("--levels-dir", required=True, help="逐关 get_figma_data JSON 目录")
    parser.add_argument("--file-key", required=True)
    parser.add_argument("--token-env", default="FIGMA_API_KEY")
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    token = os.environ.get(args.token_env)
    if not token:
        print(f"error: 未设置环境变量 {args.token_env}", file=sys.stderr)
        return 1
    try:
        levels = collect_levels(Path(args.levels_dir).resolve())
        if not levels:
            print("error: levels-dir 没有关卡 JSON", file=sys.stderr)
            return 1
        frames = fetch_rotations(args.file_key, sorted(set(l["frameId"] for l in levels.values())), token)
        mapping = {}
        for level_id, info in levels.items():
            mapping[level_id] = {cid: frames[info["frameId"]].get(cid, 0) for cid in info["cardIds"]}
        Path(args.output).write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"levels": len(mapping)}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
