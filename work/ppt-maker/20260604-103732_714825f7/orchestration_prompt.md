你是 ppt-maker 的非交互编排器。请只在当前工作目录生成 edits.json，格式必须符合 gorden build_pptx.py 的 EDITS JSON SCHEMA。模板上下文已快照到当前工作目录的 ./template_context/，不要读取工作目录之外的模板文件。

{
  "prompt": "生成一份 3 页中文季度销售复盘 PPT，包含封面、关键指标、下一步行动，风格简洁商务。",
  "page_count": 3,
  "style": "简洁商务",
  "purpose": null,
  "template_slug": "minimal-business-summary",
  "template_context": "./template_context",
  "template_detail": "./template_context/detail.json",
  "template_intro": "./template_context/intro.md",
  "output_edits_json": "/Users/tristanzh/agent/PPT-maker/work/ppt-maker/20260604-103732_714825f7/edits.json"
}