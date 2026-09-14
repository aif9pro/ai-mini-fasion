---
name: fasion-board
description: 读取当前任务目录下的 role.json，基于角色固定形象设计生成一组包含五种不同景别的分镜图 Prompt，并输出标准 board.json。
metadata:
  version: "1.0.0"
  author: "AI Factory Team"
  created_at: "2026-09-15"
  tags: "storyboard, shot-list, fashion, prompt-design, visual-consistency"
---

# fasion-board

## 用途

将 `fasion-role` 生成的角色设定转译为一组可用于图像生成的分镜图 Prompt。五个镜头必须围绕同一角色展开，保持角色身份、年龄、脸部、发型、体态、核心造型和固定识别锚点一致，仅改变景别、构图重点、动作或叙事信息。

## 输入

只读取当前任务目录下的 `role.json`：

```text
{task_dir}/role.json
```

若当前任务目录未明确指定，使用当前工作目录下的 `role.json`。文件必须符合 `references/output/role.json` 中的角色结构；默认读取顶层 `role` 对象，兼容顶层 `roles` 数组时读取第一个角色。

不得重新设计角色，不得擅自改变输入中的年龄阶段、性别表达、身份、外观、固定造型或 `consistency.fixed`。输入缺少可选信息时，只补全分镜所需的镜头、动作、构图或环境信息，并在输出的 `inferred_items` 中标记。

## 执行流程

1. 读取并解析 `{task_dir}/role.json`，提取角色核心身份、外观、造型、行为、故事、固定锚点和用户约束。
2. 建立跨五个镜头复用的 `character_lock`，将不可改变的角色信息写成一致性前缀。
3. 依次生成远景、全景、中景、近景和特写五个分镜图 Prompt。
4. 检查五个镜头的景别是否不同、角色形象是否一致、Prompt 是否可直接生成。
5. 将唯一最终交付产物写入 `{task_dir}/output/board.json`。

## 文件产物

- `{task_dir}/output/board.json`：五镜头分镜 Prompt 的唯一最终交付产物。

不要把输出写入本 skill 自身目录。默认不生成图片、额外说明文档或未经请求的角色分析。

## 参考资料

- `references/shot-rules.md`：五种景别、镜头职责和 Prompt 编排规则。
- `references/validation.md`：输入、角色一致性、景别和 JSON 校验清单。
- `references/output/board.json`：标准输出 JSON 模板。
- `scripts/format_board_json.py`：格式化并校验 `board.json` 的标准脚本。

## 输出格式化

生成或修改 `board.json` 后，使用标准脚本校验并格式化：

```bash
python3 scripts/format_board_json.py {task_dir}/output/board.json
```

只校验、不写回文件：

```bash
python3 scripts/format_board_json.py {task_dir}/output/board.json --check
```

## 输出要求

严格生成合法 JSON：键名和字符串使用双引号，不使用注释、尾随逗号、单引号或 YAML 语法。`shots` 必须且只能包含 5 个元素，景别依次为 `extreme_long_shot`、`long_shot`、`medium_shot`、`close_up`、`extreme_close_up`。

每个镜头必须包含独立的 `prompt`、`prompt_zh` 和 `negative_prompt`。Prompt 需要同时明确角色固定形象、景别、构图、动作或表情、场景叙事、服装表现和画面用途；不得只输出镜头术语或空泛风格词。

生成后必须完成 `references/validation.md` 中的检查，并确保最终文件符合 `references/output/board.json`。