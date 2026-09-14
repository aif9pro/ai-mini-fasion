#!/usr/bin/env python3
"""Format and validate the fasion-board JSON output."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

EXPECTED_SKILL = "fasion-board"
EXPECTED_LANGUAGE = "zh-CN"
EXPECTED_SCALES = [
    "extreme_long_shot",
    "long_shot",
    "medium_shot",
    "close_up",
    "extreme_close_up",
]
REQUIRED_TOP_LEVEL = {
    "skill",
    "version",
    "language",
    "source_role",
    "character_lock",
    "shots",
    "inferred_items",
}
REQUIRED_LOCK_FIELDS = {
    "name",
    "age_stage",
    "age_range",
    "gender_expression",
    "identity",
    "appearance",
    "styling",
    "fixed_features",
}
REQUIRED_APPEARANCE_FIELDS = {"face", "hair", "body", "signature_features"}
REQUIRED_STYLING_FIELDS = {"clothing", "makeup_hair", "accessories"}
REQUIRED_SHOT_FIELDS = {
    "shot_id",
    "shot_scale",
    "shot_scale_zh",
    "composition",
    "visual_focus",
    "prompt",
    "prompt_zh",
    "negative_prompt",
}


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as file:
            value = json.load(file)
    except FileNotFoundError as error:
        raise ValueError(f"输入文件不存在: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(
            f"JSON 解析失败: {path}:{error.lineno}:{error.colno} {error.msg}"
        ) from error

    if not isinstance(value, dict):
        raise ValueError("JSON 顶层必须是对象")
    return value


def missing_fields(value: dict[str, Any], required: set[str], path: str) -> list[str]:
    missing = sorted(required - value.keys())
    if missing:
        return [f"{path} 缺少字段: {', '.join(missing)}"]
    return []


def validate_board_document(document: dict[str, Any]) -> list[str]:
    errors = missing_fields(document, REQUIRED_TOP_LEVEL, "顶层")

    if document.get("skill") != EXPECTED_SKILL:
        errors.append(f"顶层.skill 必须为 {EXPECTED_SKILL!r}")
    if document.get("language") != EXPECTED_LANGUAGE:
        errors.append(f"顶层.language 必须为 {EXPECTED_LANGUAGE!r}")

    lock = document.get("character_lock")
    if not isinstance(lock, dict):
        errors.append("顶层.character_lock 必须是对象")
    else:
        errors.extend(missing_fields(lock, REQUIRED_LOCK_FIELDS, "character_lock"))
        appearance = lock.get("appearance")
        if not isinstance(appearance, dict):
            errors.append("character_lock.appearance 必须是对象")
        else:
            errors.extend(
                missing_fields(appearance, REQUIRED_APPEARANCE_FIELDS, "character_lock.appearance")
            )
            if not isinstance(appearance.get("signature_features"), list):
                errors.append("character_lock.appearance.signature_features 必须是数组")
        styling = lock.get("styling")
        if not isinstance(styling, dict):
            errors.append("character_lock.styling 必须是对象")
        else:
            errors.extend(
                missing_fields(styling, REQUIRED_STYLING_FIELDS, "character_lock.styling")
            )
        if not isinstance(lock.get("fixed_features"), list):
            errors.append("character_lock.fixed_features 必须是数组")

    shots = document.get("shots")
    if not isinstance(shots, list):
        errors.append("顶层.shots 必须是数组")
        return errors
    if len(shots) != 5:
        errors.append(f"顶层.shots 必须恰好包含 5 个镜头，当前为 {len(shots)} 个")
    actual_scales = []
    shot_ids = set()
    for index, shot in enumerate(shots, start=1):
        path = f"shots[{index}]"
        if not isinstance(shot, dict):
            errors.append(f"{path} 必须是对象")
            continue
        errors.extend(missing_fields(shot, REQUIRED_SHOT_FIELDS, path))
        scale = shot.get("shot_scale")
        actual_scales.append(scale)
        if scale not in EXPECTED_SCALES:
            errors.append(f"{path}.shot_scale 不是支持的景别: {scale!r}")
        shot_id = shot.get("shot_id")
        if shot_id in shot_ids:
            errors.append(f"{path}.shot_id 重复: {shot_id!r}")
        shot_ids.add(shot_id)
        for field in ("prompt", "prompt_zh", "negative_prompt"):
            if not isinstance(shot.get(field), str):
                errors.append(f"{path}.{field} 必须是字符串")
    if actual_scales != EXPECTED_SCALES:
        errors.append("shots 的景别顺序必须为远景、全景、中景、近景、特写")

    if not isinstance(document.get("inferred_items"), list):
        errors.append("顶层.inferred_items 必须是数组")
    return errors


def format_json(document: dict[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="格式化并校验 fasion-board 的 board.json 输出"
    )
    parser.add_argument("input", type=Path, help="输入 JSON 文件")
    parser.add_argument(
        "-o", "--output", type=Path, help="格式化后的输出路径；默认覆盖输入文件"
    )
    parser.add_argument(
        "--check", action="store_true", help="只校验，不写入格式化后的文件"
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        document = load_json(args.input)
        errors = validate_board_document(document)
        if errors:
            for error in errors:
                print(f"错误: {error}", file=sys.stderr)
            return 1

        if args.check:
            print(f"校验通过: {args.input}")
        else:
            output = args.output or args.input
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(format_json(document), encoding="utf-8")
            print(f"已格式化: {output}")
        return 0
    except ValueError as error:
        print(f"错误: {error}", file=sys.stderr)
        return 1
    except OSError as error:
        print(f"写入失败: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
