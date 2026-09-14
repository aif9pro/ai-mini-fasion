"""基于 YAML 文件的任务数据库实现"""

import os
from datetime import datetime

import yaml

from .base_db import BaseTaskDb


class LocalTaskDb(BaseTaskDb):
    """
    基于 YAML 文件的任务数据库实现。
    数据持久化到 {task_dir}/media.yaml。
    """

    def __init__(self, task_dir: str):
        self.task_dir = task_dir
        self.db_path = os.path.join(task_dir, "media.yaml")

    # ---- helpers ----

    def _load(self) -> dict:
        """从文件加载数据库"""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"media.yaml not found: {self.db_path}")
        with open(self.db_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _save(self, data: dict) -> None:
        """保存数据库到文件"""
        os.makedirs(self.task_dir, exist_ok=True)
        with open(self.db_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    def _next_id(self, data: dict) -> int:
        """获取下一个自增 ID"""
        items = data.get("items", [])
        if not items:
            return 1
        return max(item.get("id", 0) for item in items) + 1

    def _now(self) -> str:
        """当前时间字符串"""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ---- public api ----

    def init(self, task_name: str) -> None:
        """初始化空数据库"""
        data = {
            "task_name": task_name,
            "created_at": self._now(),
            "updated_at": self._now(),
            "total": 0,
            "items": [],
        }
        self._save(data)

    def read(self) -> dict:
        """读取整个数据库"""
        return self._load()

    def get_item(self, item_id: int) -> dict:
        """获取单个 item"""
        data = self._load()
        for item in data.get("items", []):
            if item["id"] == item_id:
                return item
        raise ValueError(f"Item with id {item_id} not found")

    def list_items(self) -> list[dict]:
        """列出所有 items"""
        data = self._load()
        return data.get("items", [])

    def append_item(self, item: dict) -> int:
        """追加新 item，返回分配的 ID"""
        data = self._load()
        new_id = self._next_id(data)
        item["id"] = new_id
        data.setdefault("items", []).append(item)
        data["total"] = len(data["items"])
        data["updated_at"] = self._now()
        self._save(data)
        return new_id

    def append_items(self, items: list[dict]) -> list[int]:
        """批量追加 items，返回分配的 ID 列表"""
        data = self._load()
        ids = []
        for item in items:
            new_id = self._next_id(data)
            item["id"] = new_id
            data.setdefault("items", []).append(item)
            ids.append(new_id)
        data["total"] = len(data["items"])
        data["updated_at"] = self._now()
        self._save(data)
        return ids

    def update_item(self, item_id: int, **fields) -> dict:
        """
        按 ID 更新 item 字段。
        支持 info 子字段的合并更新。
        """
        data = self._load()
        for item in data.get("items", []):
            if item["id"] == item_id:
                for key, value in fields.items():
                    if key == "info" and isinstance(value, dict):
                        # 合并 info 子字段
                        item.setdefault("info", {}).update(value)
                    else:
                        item[key] = value
                data["updated_at"] = self._now()
                self._save(data)
                return item
        raise ValueError(f"Item with id {item_id} not found")

    def update_header(self, **fields) -> None:
        """更新 db 头部字段"""
        data = self._load()
        for key, value in fields.items():
            data[key] = value
        data["updated_at"] = self._now()
        self._save(data)

    def delete(self) -> None:
        """删除整个任务数据库"""
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def delete_item(self, item_id: int) -> None:
        """删除指定 item"""
        data = self._load()
        original_len = len(data.get("items", []))
        data["items"] = [item for item in data.get("items", []) if item["id"] != item_id]
        if len(data["items"]) == original_len:
            raise ValueError(f"Item with id {item_id} not found")
        data["total"] = len(data["items"])
        data["updated_at"] = self._now()
        self._save(data)
