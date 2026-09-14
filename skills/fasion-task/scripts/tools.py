"""fasion-task 核心对外接口"""

import os
import sys

# 确保 scripts 目录在 path 中
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from task_manager import create_task, get_task_dir, list_all_tasks, read_task_config
from file_collector import collect_files, _is_image
from image_meta import ImageMetaReader
from media_db.local_db import LocalTaskDb

_reader = ImageMetaReader()


def init_task(inputs: list[str], task_name: str = "", base_dir: str = None, mode: str = "local") -> dict:
    """
    初始化一个任务：创建目录 → 归集文件 → 读取元数据 → 写入 media.yaml。

    Args:
        inputs: 本地路径或 URL 列表
        task_name: 任务名，为空时自动生成
        base_dir: ai_art 根目录，不传则自动探测
        mode: 运行模式 local | remote

    Returns:
        {
            "task_name": str,
            "task_dir": str,
            "total": int,
            "items": [...]
        }
    """
    # 1. 创建任务
    name, task_dir, db, _ = create_task(task_name, base_dir, mode=mode, inputs=inputs)
    source_dir = os.path.join(task_dir, "source")

    # 2. 归集文件
    collect_results = collect_files(inputs, source_dir)

    # 3. 读取每张图片的元数据
    items = []
    for cr in collect_results:
        item = {
            "source_path": cr.get("source_path", ""),
            "original_path": cr.get("original_path", ""),
            "original_url": cr.get("original_url", ""),
            "url": "",
            "info": {},
            "content": None,
            "score": None,
        }

        if cr.get("error"):
            item["info"] = {"file_name": cr.get("file_name", ""), "error": cr["error"]}
        elif cr.get("skipped"):
            # 跳过的文件读取其现有元数据
            if os.path.exists(cr["source_path"]):
                item["info"] = _reader.read(cr["source_path"])
            else:
                item["info"] = {"file_name": cr.get("file_name", ""), "skipped": True}
        elif cr["source_path"] and _is_image(cr["file_name"]):
            item["info"] = _reader.read(cr["source_path"])
        else:
            # 非图片文件，只记录基本信息
            item["info"] = {
                "file_name": cr.get("file_name", ""),
                "file_size_kb": round(os.path.getsize(cr["source_path"]) / 1024, 2) if cr.get("source_path") and os.path.exists(cr["source_path"]) else 0,
            }

        items.append(item)

    # 4. 批量写入 media.yaml
    if items:
        db.append_items(items)

    # 5. 读取最终数据
    data = db.read()

    return {
        "task_name": name,
        "task_dir": task_dir,
        "mode": mode,
        "total": data.get("total", 0),
        "items": data.get("items", []),
    }


def update_item(task_name: str, item_id: int, **fields) -> dict:
    """
    按 ID 更新 item 字段。

    Args:
        task_name: 任务名
        item_id: item ID
        **fields: 要更新的字段（content, score, url 等）

    Returns:
        更新后的 item 数据
    """
    task_dir = get_task_dir(task_name)
    db = LocalTaskDb(task_dir)
    return db.update_item(item_id, **fields)


def read_task(task_name: str, base_dir: str = None) -> dict:
    """读取一个任务的完整 media.yaml 数据"""
    task_dir = get_task_dir(task_name, base_dir)
    db = LocalTaskDb(task_dir)
    return db.read()


def list_tasks(base_dir: str = None) -> list[dict]:
    """列出所有任务"""
    return list_all_tasks(base_dir)
