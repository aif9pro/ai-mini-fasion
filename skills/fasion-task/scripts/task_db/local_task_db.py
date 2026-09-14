"""基于 YAML 文件的任务配置数据库实现"""

import os
from datetime import datetime

import yaml

from .base_task_db import BaseTaskConfigDb


class LocalTaskConfigDb(BaseTaskConfigDb):
    """
    基于 YAML 文件的任务配置数据库。
    数据持久化到 {task_dir}/task_config.yaml。
    """

    def __init__(self, task_dir: str):
        self.task_dir = task_dir
        self.config_path = os.path.join(task_dir, "task_config.yaml")

    # ---- helpers ----

    def _load(self) -> dict:
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"task_config.yaml not found: {self.config_path}")
        with open(self.config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _save(self, data: dict) -> None:
        os.makedirs(self.task_dir, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    @staticmethod
    def _now() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ---- public api ----

    def init(self, task_name: str, mode: str) -> None:
        """初始化任务配置"""
        config = {
            "task_name": task_name,
            "created_at": self._now(),
            "mode": mode,
        }
        self._save(config)

    def read(self) -> dict:
        """读取任务配置"""
        return self._load()

    def update(self, **fields) -> None:
        """更新任务配置字段"""
        config = self._load()
        for key, value in fields.items():
            config[key] = value
        config["updated_at"] = self._now()
        self._save(config)

    def get_mode(self) -> str:
        """获取运行模式"""
        return self._load().get("mode", "local")
