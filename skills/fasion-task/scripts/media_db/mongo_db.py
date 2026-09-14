"""基于 MongoDB 的任务数据库实现（预留）"""

from .base_db import BaseTaskDb


class MongoTaskDb(BaseTaskDb):
    """
    基于 MongoDB 的任务数据库实现（预留）。

    所有方法均抛出 NotImplementedError。
    后续实现时连接 MongoDB Atlas 或自建实例，
    每个任务对应一个 collection。
    """

    def __init__(self, connection_string: str, task_name: str):
        raise NotImplementedError("MongoDB support not implemented yet")

    def init(self, task_name: str) -> None:
        raise NotImplementedError("MongoDB support not implemented yet")

    def read(self) -> dict:
        raise NotImplementedError("MongoDB support not implemented yet")

    def get_item(self, item_id: int) -> dict:
        raise NotImplementedError("MongoDB support not implemented yet")

    def list_items(self) -> list[dict]:
        raise NotImplementedError("MongoDB support not implemented yet")

    def append_item(self, item: dict) -> int:
        raise NotImplementedError("MongoDB support not implemented yet")

    def append_items(self, items: list[dict]) -> list[int]:
        raise NotImplementedError("MongoDB support not implemented yet")

    def update_item(self, item_id: int, **fields) -> dict:
        raise NotImplementedError("MongoDB support not implemented yet")

    def update_header(self, **fields) -> None:
        raise NotImplementedError("MongoDB support not implemented yet")

    def delete(self) -> None:
        raise NotImplementedError("MongoDB support not implemented yet")

    def delete_item(self, item_id: int) -> None:
        raise NotImplementedError("MongoDB support not implemented yet")
