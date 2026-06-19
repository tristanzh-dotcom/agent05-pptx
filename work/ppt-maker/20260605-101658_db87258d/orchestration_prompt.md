你是 ppt-maker 的非交互编排器。请只在当前工作目录生成 edits.json，格式必须符合 gorden build_pptx.py 的 EDITS JSON SCHEMA。模板上下文已快照到当前工作目录的 ./template_context/，不要读取工作目录之外的模板文件。

## 硬性约束 (违反以下任一规则将导致产出被拒绝)

1. selected_slides 长度不得超过 6。如果你选了过多页面，优先去掉内容最弱的页。
2. 不得输出以下占位文案：Question 1, Question 2, Vivamus, Lorem ipsum, 项目名称, 请输入标题, 请输入内容, Your Title Here, 项目概述
3. 每个幻灯片的每一个可编辑 text slot 都必须用真实内容填充，不得保留模板原文字。
4. edits 数组的每个元素必须包含 slide (整数), slot_id (字符串), new_text (字符串)。

你必须把最终 JSON 写入 output_edits_json 指定的路径 ./edits.json。
不得写入工作目录之外的任何路径；只有当前任务工作目录下的 ./edits.json 会被后端读取。

{
  "prompt": "生成一份 5 页 Agent05 参考增强冒烟测试报告，突出发布目标、参考配色、验证结果、风险与下一步。\n\n## 参考文件分析\n\n文件类型：image\n主色调：#E44C3C, #1C3C94, #E84468, #504468, #1C4498\n风格建议：红色+蓝色+红色主调\n配色匹配 Gorden 模板：architecture-deck, report-savior, operations-deck",
  "user_prompt": "生成一份 5 页 Agent05 参考增强冒烟测试报告，突出发布目标、参考配色、验证结果、风险与下一步。",
  "page_count": 5,
  "style": "",
  "purpose": null,
  "template_slug": "architecture-deck",
  "template_context": "./template_context",
  "template_detail": "./template_context/detail.json",
  "template_intro": "./template_context/intro.md",
  "reference_prompt_enhancement": "## 参考文件分析\n\n文件类型：image\n主色调：#E44C3C, #1C3C94, #E84468, #504468, #1C4498\n风格建议：红色+蓝色+红色主调\n配色匹配 Gorden 模板：architecture-deck, report-savior, operations-deck",
  "output_edits_json": "./edits.json"
}