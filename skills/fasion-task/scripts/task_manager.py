"""任务管理器 —— 创建任务目录、生成任务名、初始化 media_db & task_db"""

import os
import random
import string
from datetime import datetime

import yaml

from media_db.local_db import LocalTaskDb
from task_db.local_task_db import LocalTaskConfigDb

# workspace 相对于 ai_art 根目录的路径
_WORKSPACE_ROOT = "workspace"


def get_workspace_root(base_dir: str = None) -> str:
    """
    获取 workspace 根目录的绝对路径。
    默认为 ai_art/workspace/。
    可通过 FASION_TASK_WORKSPACE 环境变量覆盖。
    """
    env_ws = os.environ.get("FASION_TASK_WORKSPACE")
    if env_ws:
        return os.path.abspath(env_ws)

    if base_dir:
        return os.path.join(base_dir, _WORKSPACE_ROOT)

    # 默认：从 scripts 目录向上找 ai_art 根
    current = os.path.dirname(os.path.abspath(__file__))
    while current != "/":
        if os.path.basename(current) == "ai_art":
            return os.path.join(current, _WORKSPACE_ROOT)
        current = os.path.dirname(current)

    # 回退到当前工作目录
    return os.path.join(os.getcwd(), _WORKSPACE_ROOT)


def generate_task_name() -> str:
    """生成格式为 yy_mm_dd_xxx 的任务名（xxx = 3 位随机小写字母）"""
    now = datetime.now()
    date_part = now.strftime("%y_%m_%d")
    suffix = "".join(random.choices(string.ascii_lowercase, k=3))
    return f"{date_part}_{suffix}"


def get_task_dir(task_name: str, base_dir: str = None) -> str:
    """获取任务目录的绝对路径"""
    return os.path.join(get_workspace_root(base_dir), task_name)


def create_task(
    task_name: str = "",
    base_dir: str = None,
    mode: str = "local",
    inputs: list[str] = None,
) -> tuple[str, str, LocalTaskDb, LocalTaskConfigDb]:
    """
    创建任务目录、media_db (media.yaml) 和 task_db (task_config.yaml)。

    Args:
        task_name: 任务名，为空时自动生成
        base_dir: ai_art 根目录
        mode: 运行模式 local | remote
        inputs: 原始输入列表

    Returns:
        (task_name, task_dir, media_db, task_config_db) 元组
    """
    if not task_name:
        task_name = generate_task_name()

    task_dir = get_task_dir(task_name, base_dir)
    source_dir = os.path.join(task_dir, "source")
    os.makedirs(source_dir, exist_ok=True)

    media_db = LocalTaskDb(task_dir)
    media_db.init(task_name)

    task_config_db = LocalTaskConfigDb(task_dir)
    task_config_db.init(task_name, mode)

    return task_name, task_dir, media_db, task_config_db


def read_task_config(task_dir: str) -> dict:
    """读取 task_config.yaml（便捷函数），不存在则返回空 dict"""
    config_path = os.path.join(task_dir, "task_config.yaml")
    if not os.path.exists(config_path):
        return {}
    db = LocalTaskConfigDb(task_dir)
    return db.read()


def list_all_tasks(base_dir: str = None) -> list[dict]:
    """列出所有任务"""
    ws = get_workspace_root(base_dir)
    if not os.path.exists(ws):
        return []

    tasks = []
    for name in sorted(os.listdir(ws)):
        task_dir = os.path.join(ws, name)
        db_path = os.path.join(task_dir, "media.yaml")
        if os.path.isdir(task_dir) and os.path.exists(db_path):
            with open(db_path, "r") as f:
                data = yaml.safe_load(f) or {}
            config = read_task_config(task_dir)
            tasks.append({
                "task_name": data.get("task_name", name),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
                "total": data.get("total", 0),
                "mode": config.get("mode", "local"),
            })
    return tasks
