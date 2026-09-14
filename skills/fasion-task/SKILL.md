# fasion-task Skill

媒体素材任务初始化 Skill，负责创建任务目录、归集文件、读取图片基础元数据。

## 核心功能

- 接收本地路径或 URL 作为输入
- 在 `ai_art/workspace/` 下创建任务目录
- 生成 `task_config.yaml`（任务配置）+ `db.yaml`（数据记录）
- 归集文件到 `source/` 子目录
- 读取图片 EXIF 和基础信息写入 `db.yaml`
- 提供 `update_item` 接口供后续 Skill 回填

## 任务目录结构

```
workspace/{task_name}/
├── task_config.yaml      # 任务配置（运行模式、创建时间）
├── db.yaml               # 数据记录（id、文件信息、分析结果）
└── source/               # 原始素材
    ├── 1.png
    └── 2.png
```

## task_config.yaml

```yaml
task_name: "测试2"
created_at: "2026-06-14 19:30:00"
mode: "local"
```

### 运行模式

| mode | 说明 |
|------|------|
| `local` | 本地模式，不操作图片上传到云 |
| `remote` | 云端模式，自动上传图片素材到云 |

## CLI 命令

```bash
# 初始化任务（默认 local 模式）
python scripts/cli.py init /path/to/img.jpg --name my_task

# 初始化 remote 模式任务
python scripts/cli.py init-dir /path/to/photos/ --name my_task --mode remote

# 从文件列表初始化
python scripts/cli.py init-from-file inputs.txt --name my_task --mode local

# 更新 item 字段
python scripts/cli.py update my_task --item-id 1 --fields score=9.5

# 读取任务
python scripts/cli.py read my_task

# 列出所有任务
python scripts/cli.py list

# 自检
python scripts/cli.py test
```

## Python API

```python
from tools import init_task, update_item, read_task, list_tasks

# 初始化任务（local 模式）
result = init_task(inputs=["/path/to/img.jpg"], task_name="my_task", mode="local")

# 更新 item
update_item("my_task", item_id=1, content="...", score=9.5)

# 读取任务
data = read_task("my_task")

# 列出所有任务（含 mode）
tasks = list_tasks()
```

## 数据库

- 本地模式：`LocalTaskDb`（YAML 文件）
- MongoDB 模式：`MongoTaskDb`（预留，未实现）

## 依赖

- Pillow >= 10.0（必须）
- PyYAML >= 6.0（必须）
- requests >= 2.28（必须）
- piexif >= 1.1（可选）
