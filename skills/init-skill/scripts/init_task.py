#!/usr/bin/env python3
"""init-skill：创建任务目录并生成 task.yaml，用于管理本次任务。

Usage:
    python init_task.py --name <task_name>
    python init_task.py --name <task_name> --workspace <dir>
"""

import argparse
import os
import sys
from datetime import datetime

import yaml

STATUS_CREATED = "created"


def find_workspace_root() -> str:
    """向上查找包含 workspace 目录的项目根，返回 workspace 绝对路径。"""
    current = os.path.dirname(os.path.abspath(__file__))
    while True:
        candidate = os.path.join(current, "workspace")
        if os.path.isdir(candidate):
            return candidate
        parent = os.path.dirname(current)
        if parent == current:  # 已到文件系统根
            break
        current = parent
    # 回退：脚本目录的 ../../workspace
    return os.path.abspath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "workspace")
    )


def create_task(task_name: str = "", workspace_root: str = None) -> dict:
    """创建任务目录并生成 task.yaml。

    Args:
        task_name: 任务名称，为空时按时间戳自动生成
        workspace_root: workspace 根目录，为空时自动查找

    Returns:
        dict: {'ok', 'task_name', 'task_dir', 'task_yaml'} 或 {'ok': False, 'error'}
    """
    ws_root = workspace_root or find_workspace_root()
    os.makedirs(ws_root, exist_ok=True)

    if not task_name:
        task_name = datetime.now().strftime("task_%Y%m%d_%H%M%S")

    task_dir = os.path.join(ws_root, task_name)
    if os.path.exists(task_dir):
        return {"ok": False, "error": f"任务目录已存在: {task_dir}"}

    os.makedirs(task_dir, exist_ok=True)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    task_data = {
        "task_name": task_name,
        "created_at": now,
        "updated_at": now,
        "status": STATUS_CREATED,
    }

    yaml_path = os.path.join(task_dir, "task.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(task_data, f, allow_unicode=True, sort_keys=False)

    return {
        "ok": True,
        "task_name": task_name,
        "task_dir": task_dir,
        "task_yaml": yaml_path,
    }


def main():
    parser = argparse.ArgumentParser(description="init-skill：创建任务目录并生成 task.yaml")
    parser.add_argument("--name", "-n", default="", help="任务名称（默认自动生成时间戳）")
    parser.add_argument("--workspace", "-w", default="", help="workspace 根目录（默认自动查找项目根/workspace）")
    args = parser.parse_args()

    result = create_task(args.name or "", workspace_root=args.workspace or None)

    if result.get("ok"):
        print("✅ 任务创建成功")
        print(f"   任务目录: {result['task_dir']}")
        print(f"   task.yaml: {result['task_yaml']}")
        print(f"   任务名:   {result['task_name']}")
    else:
        print(f"❌ {result.get('error')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
