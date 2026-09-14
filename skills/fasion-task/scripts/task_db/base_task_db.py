"""任务配置数据库抽象基类 —— 管理 task_config.yaml"""

from abc import ABC, abstractmethod


class BaseTaskConfigDb(ABC):
    """任务配置数据库抽象基类"""

    @abstractmethod
    def init(self, task_name: str, mode: str) -> None:
        """初始化任务配置"""

    @abstractmethod
    def read(self) -> dict:
        """读取任务配置"""

    @abstractmethod
    def update(self, **fields) -> None:
        """更新任务配置字段（如 mode）"""

    @abstractmethod
    def get_mode(self) -> str:
        """获取运行模式"""
