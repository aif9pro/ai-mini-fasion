# 输出校验与失败处理

## 校验清单

1. 使用 `references/output/role.json` 作为字段模板校验 JSON 结构，并确认文件可解析。
2. 确认顶层包含 `skill`、`version`、`language`、`usage` 和 `role`，不包含平台适配字段。
3. 确认默认只输出一个 `role` 对象；只有用户明确要求多角色时才使用 `roles` 数组。
4. 确认每个角色包含 `id`、`name`、`type`、`age_stage`、`age_range`、`gender_expression`、`identity`、`appearance`、`personality`、`styling`、`behavior`、`story`、`consistency`、`prompt` 和 `source`。
5. 确认年龄阶段明确，行为、服装和妆发与年龄一致。
6. 确认核心身份和外观锚点在 `prompt`、`consistency.fixed` 和用户约束中一致。
7. 确认 `source.user_constraints` 和 `source.inferred_items` 保留来源信息。
8. 确认描述可观察、可生成，不只堆叠抽象审美词。
9. 确认 `negative_prompt` 包含必要的身份一致性和图像质量负向约束。
10. 确认没有未成年人性化、裸露或挑逗性内容。
11. 确认字符串中的引号、换行和反斜杠已正确转义。

设计层问题必须回退修改 `design.md` 后重新生成，不能只在 `validation.md` 记录问题而保留错误结果。

## 异常处理

- 只有审美词：结合用途补全身份和年龄，并标记 `inferred`。
- 信息冲突：优先保留用户后写的明确要求，在 `intent.md` 记录取舍。
- 多角色没有区分标准：先建立不同身份锚点、色彩或轮廓，再输出列表。
- 信息不足：输出最小可用方案，将待确认内容放入 `source.inferred_items`，不阻塞交付。
- 没有任务目录：使用项目根目录下的 `output/role.json`，不要写入 skill 自身目录。
