#!/usr/bin/env python
"""fasion-task CLI 入口"""

import argparse
import json
import os
import sys

_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from tools import init_task, update_item, read_task, list_tasks


def _get_mode(args) -> str:
    return getattr(args, "mode", "local") or "local"


def cmd_init(args):
    """初始化任务"""
    result = init_task(inputs=args.inputs, task_name=args.name or "", mode=_get_mode(args))
    _print_result(result)


def cmd_init_from_file(args):
    """从文件读取输入列表初始化"""
    with open(args.file, "r") as f:
        inputs = [line.strip() for line in f if line.strip()]
    result = init_task(inputs=inputs, task_name=args.name or "", mode=_get_mode(args))
    _print_result(result)


def cmd_init_dir(args):
    """初始化整个目录"""
    dir_path = args.directory
    if not os.path.isdir(dir_path):
        print(f"Error: directory not found: {dir_path}")
        sys.exit(1)

    inputs = []
    for fname in sorted(os.listdir(dir_path)):
        fpath = os.path.join(dir_path, fname)
        if os.path.isfile(fpath):
            inputs.append(fpath)

    result = init_task(inputs=inputs, task_name=args.name or "", mode=_get_mode(args))
    _print_result(result)


def cmd_update(args):
    """更新 item 字段"""
    fields = {}
    for pair in (args.fields or []):
        if "=" in pair:
            key, value = pair.split("=", 1)
            # 尝试 JSON 解析
            try:
                fields[key] = json.loads(value)
            except (json.JSONDecodeError, ValueError):
                fields[key] = value

    result = update_item(task_name=args.task_name, item_id=args.item_id, **fields)
    _print_result(result)


def cmd_read(args):
    """读取任务"""
    data = read_task(args.task_name)
    _print_result(data)


def cmd_list(args):
    """列出所有任务"""
    tasks = list_tasks()
    if tasks:
        for t in tasks:
            mode = t.get('mode', 'local')
            print(f"  [{t['task_name']}]  mode={mode}  total={t['total']}  created={t['created_at']}  updated={t['updated_at']}")
    else:
        print("No tasks found.")


def cmd_test(args):
    """运行自检"""
    print("=== fasion-task self-check ===")

    # 检查依赖
    try:
        import yaml
        print("  ✅ PyYAML")
    except ImportError:
        print("  ❌ PyYAML not installed")

    try:
        from PIL import Image
        print("  ✅ Pillow")
    except ImportError:
        print("  ❌ Pillow not installed")

    try:
        import piexif
        print("  ✅ piexif (optional)")
    except ImportError:
        print("  ⚠️  piexif not installed (optional)")

    try:
        import requests
        print("  ✅ requests")
    except ImportError:
        print("  ❌ requests not installed")

    # 检查 media_db 模块
    try:
        from media_db.local_db import LocalTaskDb
        print("  ✅ media_db.local_db")
    except Exception as e:
        print(f"  ❌ media_db.local_db: {e}")

    # 检查 task_db 模块
    try:
        from task_db.local_task_db import LocalTaskConfigDb
        print("  ✅ task_db.local_task_db")
    except Exception as e:
        print(f"  ❌ task_db.local_task_db: {e}")

    # 检查 image_meta
    try:
        from image_meta import ImageMetaReader
        reader = ImageMetaReader()
        print("  ✅ image_meta")
    except Exception as e:
        print(f"  ❌ image_meta: {e}")

    # 检查 task_manager
    try:
        from task_manager import generate_task_name, get_workspace_root
        ws = get_workspace_root()
        tn = generate_task_name()
        print(f"  ✅ task_manager (workspace={ws}, sample_name={tn})")
    except Exception as e:
        print(f"  ❌ task_manager: {e}")

    print("=== check complete ===")


def _print_result(data):
    """格式化输出结果"""
    if isinstance(data, dict):
        print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
    elif isinstance(data, list):
        print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
    else:
        print(data)


def main():
    parser = argparse.ArgumentParser(description="fasion-task CLI")
    subparsers = parser.add_subparsers(dest="command", help="commands")

    # init
    p_init = subparsers.add_parser("init", help="Initialize a task with input paths/URLs")
    p_init.add_argument("inputs", nargs="+", help="Local paths or URLs")
    p_init.add_argument("--name", "-n", default="", help="Task name (auto-generate if empty)")
    p_init.add_argument("--mode", "-m", default="local", choices=["local", "remote"], help="Run mode (default: local)")

    # init-from-file
    p_file = subparsers.add_parser("init-from-file", help="Initialize from a text file (one input per line)")
    p_file.add_argument("file", help="Text file path")
    p_file.add_argument("--name", "-n", default="", help="Task name")
    p_file.add_argument("--mode", "-m", default="local", choices=["local", "remote"], help="Run mode")

    # init-dir
    p_dir = subparsers.add_parser("init-dir", help="Initialize from all files in a directory")
    p_dir.add_argument("directory", help="Directory path")
    p_dir.add_argument("--name", "-n", default="", help="Task name")
    p_dir.add_argument("--mode", "-m", default="local", choices=["local", "remote"], help="Run mode")

    # update
    p_upd = subparsers.add_parser("update", help="Update item fields")
    p_upd.add_argument("task_name", help="Task name")
    p_upd.add_argument("--item-id", "-i", type=int, required=True, help="Item ID")
    p_upd.add_argument("--fields", "-f", nargs="*", help='Fields to update, e.g. --fields score=9.5 content="good"')

    # read
    p_read = subparsers.add_parser("read", help="Read a task")
    p_read.add_argument("task_name", help="Task name")

    # list
    subparsers.add_parser("list", help="List all tasks")

    # test
    subparsers.add_parser("test", help="Run self-check")

    args = parser.parse_args()

    if args.command == "init":
        cmd_init(args)
    elif args.command == "init-from-file":
        cmd_init_from_file(args)
    elif args.command == "init-dir":
        cmd_init_dir(args)
    elif args.command == "update":
        cmd_update(args)
    elif args.command == "read":
        cmd_read(args)
    elif args.command == "list":
        cmd_list(args)
    elif args.command == "test":
        cmd_test(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
