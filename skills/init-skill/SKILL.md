---
name: init-skill
description: 项目任务初始化工具，在 workspace 下创建任务目录并生成 task.yaml 用于管理本次任务。
---

# Init Skill

## 概述

Init Skill 负责创建项目任务：在 `workspace/` 下创建任务目录，并生成 `task.yaml` 用于管理本次任务（记录任务名、创建时间、状态等）。

## 核心功能

- ✅ 创建任务目录：在 `workspace/{task_name}/` 下创建任务目录
- ✅ 生成 task.yaml：记录任务名、创建时间、更新时间、状态
- ✅ 自动命名：未指定任务名时按时间戳自动生成

## 任务目录结构

```
workspace/{task_name}/
└── task.yaml          # 任务配置（任务名、时间、状态）
```

## task.yaml 结构

```yaml
task_name: "my-project"
created_at: "2026-08-23 17:00:00"
updated_at: "2026-08-23 17:00:00"
status: created
```

| 字段 | 说明 |
|------|------|
| `task_name` | 任务名称 |
| `created_at` | 创建时间 |
| `updated_at` | 最后更新时间 |
| `status` | 任务状态（created → designed → optimized → done） |

## 使用方法

### 命令行工具

```bash
# 指定任务名
python scripts/init_task.py --name my_project

# 自动生成任务名（时间戳）
python scripts/init_task.py

# 指定 workspace 根目录
python scripts/init_task.py --name my_project --workspace /path/to/workspace
```

**输出示例**：

```
✅ 任务创建成功
   任务目录: /path/to/workspace/my_project
   task.yaml: /path/to/workspace/my_project/task.yaml
   任务名:   my_project
```

### Python API

```python
from init_task import create_task

result = create_task("my_project")
if result["ok"]:
    print(result["task_dir"])
    print(result["task_yaml"])
```

## 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `--name, -n` | string | 否 | 任务名称（默认自动生成时间戳） |
| `--workspace, -w` | string | 否 | workspace 根目录（默认自动查找项目根/workspace） |

## 依赖

- PyYAML >= 6.0
