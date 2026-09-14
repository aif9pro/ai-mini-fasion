#!/usr/bin/env python3
"""Format and validate the compact fasion-role JSON output."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

EXPECTED_SKILL = "fasion-role"
REQUIRED_TOP_LEVEL = {"skill", "version", "language", "usage", "role"}
REQUIRED_ROLE_FIELDS = {
    "id",
    "name",
    "type",
    "age_stage",
    "age_range",
    "gender_expression",
    "identity",
    "appearance",
    "personality",
    "styling",
    "behavior",
    "story",
    "consistency",
    "prompt",
    "negative_prompt",
    "source",
}
REQUIRED_NESTED_FIELDS = {
    "appearance": {"face", "hair", "body", "signature_features"},
    "styling": {"clothing", "makeup_hair", "accessories"},
    "behavior": {"expression", "pose", "habit"},
    "consistency": {"fixed", "variable"},
    "source": {"user_constraints", "inferred_items"},
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


def validate_object_fields(
    value: dict[str, Any], required: set[str], path: str
) -> list[str]:
    missing = sorted(required - value.keys())
    if missing:
        return [f"{path} 缺少字段: {', '.join(missing)}"]
    return []


def validate_role_document(document: dict[str, Any]) -> list[str]:
    errors = validate_object_fields(document, REQUIRED_TOP_LEVEL, "顶层")

    if document.get("skill") != EXPECTED_SKILL:
        errors.append(f"顶层.skill 必须为 {EXPECTED_SKILL!r}")
    if document.get("language") != "zh-CN":
        errors.append("顶层.language 必须为 'zh-CN'")

    role = document.get("role")
    if not isinstance(role, dict):
        errors.append("顶层.role 必须是对象")
        return errors

    errors.extend(validate_object_fields(role, REQUIRED_ROLE_FIELDS, "role"))
    for field, required in REQUIRED_NESTED_FIELDS.items():
        nested = role.get(field)
        if not isinstance(nested, dict):
            errors.append(f"role.{field} 必须是对象")
            continue
        errors.extend(validate_object_fields(nested, required, f"role.{field}"))

    if not isinstance(role.get("personality"), list):
        errors.append("role.personality 必须是数组")
    for field in ("signature_features",):
        appearance = role.get("appearance")
        if isinstance(appearance, dict) and not isinstance(appearance.get(field), list):
            errors.append(f"role.appearance.{field} 必须是数组")
    for field in ("fixed", "variable"):
        consistency = role.get("consistency")
        if isinstance(consistency, dict) and not isinstance(consistency.get(field), list):
            errors.append(f"role.consistency.{field} 必须是数组")
    for field in ("user_constraints", "inferred_items"):
        source = role.get("source")
        if isinstance(source, dict) and not isinstance(source.get(field), list):
            errors.append(f"role.source.{field} 必须是数组")

    return errors


def format_json(document: dict[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="格式化并校验 fasion-role 的 role.json 输出"
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
        errors = validate_role_document(document)
        if errors:
            for error in errors:
                print(f"错误: {error}", file=sys.stderr)
            return 1

        if not args.check:
            output = args.output or args.input
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(format_json(document), encoding="utf-8")
            print(f"已格式化: {output}")
        else:
            print(f"校验通过: {args.input}")
        return 0
    except ValueError as error:
        print(f"错误: {error}", file=sys.stderr)
        return 1
    except OSError as error:
        print(f"写入失败: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
