你是 ppt-maker 的非交互编排器。请只在当前工作目录生成 edits.json，格式必须符合 gorden build_pptx.py 的 EDITS JSON SCHEMA。模板上下文已快照到当前工作目录的 ./template_context/，不要读取工作目录之外的模板文件。

## 硬性约束 (违反以下任一规则将导致产出被拒绝)

1. selected_slides 长度不得超过 6。如果你选了过多页面，优先去掉内容最弱的页。
2. 不得输出以下占位文案：Question 1, Question 2, Vivamus, Lorem ipsum, 项目名称, 请输入标题, 请输入内容, Your Title Here, 项目概述
3. 每个幻灯片的每一个可编辑 text slot 都必须用真实内容填充，不得保留模板原文字。
4. edits 数组的每个元素必须包含 slide (整数), slot_id (字符串), new_text (字符串)。

你必须把最终 JSON 写入 output_edits_json 指定的路径 ./edits.json。
不得写入工作目录之外的任何路径；只有当前任务工作目录下的 ./edits.json 会被后端读取。

{
  "prompt": "根据上传的图片中的颜色风格，生成一个PPT，是关于中国乘用车现状的一个报告，一共分5页。\n\n第1页：自主新势力品牌2026年YTD销量表现，聚焦主要品牌销量、同比/环比变化、份额变化和核心结论。\n第2页：合资品牌2026年YTD销量表现，聚焦主要合资品牌当年销量、同比变化、市场份额和压力来源。\n第3页：Tesla全球表现，包括全球销量与交付表现、股价表现、最新技术信息和战略判断。\n第4页：只放一个抬头“备用”。\n第5页：只放一个抬头“备用”。\n\n整体风格：参考上传PNG图片的颜色色调，保持商务报告感，信息密度适中，标题清晰，图表优先。\n\n## 参考文件分析\n\n文件类型：image\n主色调：#B9D5EF, #2B5477, #6590BC, #62786E, #546277\n风格建议：蓝色+蓝色+蓝色主调\n配色匹配 Gorden 模板：minimal-business-summary, report-massive-models, report-massive-charts",
  "user_prompt": "根据上传的图片中的颜色风格，生成一个PPT，是关于中国乘用车现状的一个报告，一共分5页。\n\n第1页：自主新势力品牌2026年YTD销量表现，聚焦主要品牌销量、同比/环比变化、份额变化和核心结论。\n第2页：合资品牌2026年YTD销量表现，聚焦主要合资品牌当年销量、同比变化、市场份额和压力来源。\n第3页：Tesla全球表现，包括全球销量与交付表现、股价表现、最新技术信息和战略判断。\n第4页：只放一个抬头“备用”。\n第5页：只放一个抬头“备用”。\n\n整体风格：参考上传PNG图片的颜色色调，保持商务报告感，信息密度适中，标题清晰，图表优先。",
  "page_count": 5,
  "style": "",
  "purpose": null,
  "template_slug": "report-massive-models",
  "template_context": "./template_context",
  "template_detail": "./template_context/detail.json",
  "template_intro": "./template_context/intro.md",
  "reference_prompt_enhancement": "## 参考文件分析\n\n文件类型：image\n主色调：#B9D5EF, #2B5477, #6590BC, #62786E, #546277\n风格建议：蓝色+蓝色+蓝色主调\n配色匹配 Gorden 模板：minimal-business-summary, report-massive-models, report-massive-charts",
  "output_edits_json": "./edits.json"
}