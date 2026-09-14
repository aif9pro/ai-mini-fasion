"""基于 MongoDB 的任务配置数据库实现（预留）"""

from .base_task_db import BaseTaskConfigDb


class MongoTaskConfigDb(BaseTaskConfigDb):
    """
    基于 MongoDB 的任务配置数据库实现（预留）。

    所有方法均抛出 NotImplementedError。
    """

    def __init__(self, connection_string: str, task_name: str):
        raise NotImplementedError("MongoDB support not implemented yet")

    def init(self, task_name: str, mode: str) -> None:
        raise NotImplementedError("MongoDB support not implemented yet")

    def read(self) -> dict:
        raise NotImplementedError("MongoDB support not implemented yet")

    def update(self, **fields) -> None:
        raise NotImplementedError("MongoDB support not implemented yet")

    def get_mode(self) -> str:
        raise NotImplementedError("MongoDB support not implemented yet")
