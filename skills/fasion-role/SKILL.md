---
name: fasion-role
description: 根据人物需求设计统一、可视化的人物形象，并输出简洁的角色 JSON 与通用图像生成 Prompt。
metadata:
  version: "3.0.0"
  author: "AI Factory Team"
  created_at: "2026-09-13"
  tags: "character-design, fashion, portrait, styling, prompt-design, visual-development"
---

# fasion-role

## 用途

将自然语言人物需求转译为可继续创作的人物形象资产，覆盖身份、外观、性格、造型、行为、叙事背景和视觉一致性。最终输出一个标准 JSON 对象，包含单个角色的基本信息和通用图像生成 Prompt。

在用户主要需要摄影机位、光影、空间或整组画面策划时，将本 skill 的角色设定交给 `fasion-mood`，不要用本 skill 替代完整摄影方案。

## 触发场景

- 设计原创角色、模特、品牌人物或虚拟人。
- 整理人物的外貌、性格、气质、服装、妆发、配饰、姿态或标志性特征。
- 为品牌、时尚系列、杂志、Lookbook、影视、游戏或社交媒体建立人物形象。
- 将已有概念整理为结构化角色设定。
- 生成可用于不同图像模型的通用角色 Prompt。
- 为同一人物生成多个造型或场景并保持身份一致。

## 输入处理

支持自然语言和结构化补充信息。至少提取人物创意或用途；同时识别身份、年龄阶段、性别表达、外观、性格气质、服装造型、场景时代、画幅用途和硬约束。

缺少可选信息时，根据用途补全，并在 `role.source.inferred_items` 和 `intent.md` 中标记为推断，不得伪装成用户明确要求。年龄阶段必须明确；未成年人只使用适龄、非性化的服装、姿态、妆发和叙事。

## 执行流程

1. 解析需求、用途、明确约束和缺失项，写入 `fasion_role/intent.md`。
2. 先建立身份、外观锚点、性格、造型、行为和叙事一致性，写入 `fasion_role/design.md`。
3. 按输出规范生成最终 `output/role.json`。
4. 按校验规则检查并记录结果到 `fasion_role/validation.md`。发现设计层问题时，先修订 `design.md`，再重新生成 JSON。

不得跳过需求与设计阶段，直接堆叠形容词生成 Prompt。

## 文件产物

- `fasion_role/intent.md`：需求摘要、用途、硬约束、冲突和推断项。
- `fasion_role/design.md`：人物设计决策、稳定锚点和变化维度。
- `fasion_role/validation.md`：校验结果和修正记录。
- `output/role.json`：唯一最终交付产物。

没有明确任务目录时，使用项目根目录下的 `output/role.json`；有明确任务目录时，使用 `{task_dir}/output/role.json`。不要把用户任务产物写入本 skill 自身目录。默认不生成图片或额外说明文档。

## 参考资料

按需读取以下文件，避免把详细规则重新写入主流程：

- `references/design-principles.md`：角色拆解、识别锚点、稳定项与变化项、年龄和安全原则。
- `references/prompt-rules.md`：通用 Prompt 的组织顺序和负向约束规则。
- `references/validation.md`：JSON、字段、人物一致性、安全和失败处理检查清单。
- `references/output/role.json`：`output/role.json` 的标准 JSON 模板，生成和校验时以此字段结构为准。
- `scripts/format_role_json.py`：格式化并校验 `role.json` 的标准脚本。

## 输出格式化

生成或修改 `role.json` 后，使用标准脚本校验并格式化：

```bash
python3 scripts/format_role_json.py {task_dir}/output/role.json
```

只校验、不写回文件：

```bash
python3 scripts/format_role_json.py {task_dir}/output/role.json --check
```

严格生成合法 JSON：键名和字符串使用双引号，不使用注释、尾随逗号、单引号或 YAML 语法。默认只输出一个 `role` 对象；只有用户明确要求多角色时，才将 `role` 替换为 `roles` 数组，并让每个元素沿用同一角色字段结构。

`output/role.json` 只保留角色交付所需的核心信息：顶层记录 skill、版本、语言和用途；`role` 内记录身份、外观、性格、造型、行为、叙事、稳定/可变项、通用 Prompt 和来源信息。不要恢复平台字段、参数字段或 JSON Schema，也不要输出空泛的大段分析文本。

生成后必须完成 `references/validation.md` 中的检查，并确保最终文件符合 `references/output/role.json`。
