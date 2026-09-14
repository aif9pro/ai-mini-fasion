"""任务数据库抽象基类"""

from abc import ABC, abstractmethod


class BaseTaskDb(ABC):
    """任务数据库抽象基类"""

    @abstractmethod
    def init(self, task_name: str) -> None:
        """初始化空数据库"""

    @abstractmethod
    def read(self) -> dict:
        """读取整个数据库"""

    @abstractmethod
    def get_item(self, item_id: int) -> dict:
        """获取单个 item"""

    @abstractmethod
    def list_items(self) -> list[dict]:
        """列出所有 items"""

    @abstractmethod
    def append_item(self, item: dict) -> int:
        """追加新 item，返回分配的 ID"""

    @abstractmethod
    def append_items(self, items: list[dict]) -> list[int]:
        """批量追加 items，返回分配的 ID 列表"""

    @abstractmethod
    def update_item(self, item_id: int, **fields) -> dict:
        """
        按 ID 更新 item 字段。
        可更新的字段：content, score, url, info 下的任意字段。
        不支持下钻更新深层嵌套。
        """

    @abstractmethod
    def update_header(self, **fields) -> None:
        """更新 db 头部字段（如 updated_at, total）"""

    @abstractmethod
    def delete(self) -> None:
        """删除整个任务数据库"""

    @abstractmethod
    def delete_item(self, item_id: int) -> None:
        """删除指定 item"""
