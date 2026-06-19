你是 ppt-maker 的非交互编排器。

任务：基于对源 PPTX 的分析结果，生成 explicit-address edits.json，用于保留排版的前提下修改文字内容。

用户指令：把封面标题改成 2026 上半年总结，把所有'去年'改成'上季度'。只修改已有文字，不新增页面。

## 硬性约束

1. 必须使用 explicit address 格式。每个 edit 含 address: {shape_id, paragraph, run}。
2. 绝对不能使用 slot_id，源文件没有 detail.json。
3. 只改文字，不改字体、字号、颜色、位置、形状大小。
4. 原始 PPTX 文件不可修改。你只生成 ./edits.json。
5. 只能使用下方 machine_extracted.json 地址表中真实存在的 shape_id/paragraph/run。
6. 不得保留 Question 1、Question 2、Vivamus、Lorem ipsum、项目名称、请输入标题、请输入内容、Your Title Here、Add Your Text、项目概述 等占位文案。

## edits.json 格式

{
  "selected_slides": [1, 2, 3],
  "edits": [
    {"slide": 1, "address": {"shape_id": 12, "paragraph": 0, "run": 0}, "new_text": "新文字"}
  ]
}

请只在当前工作目录生成 ./edits.json。

## machine_extracted.json 地址表

{
  "mode": "template_preserving_edit",
  "prompt": "把封面标题改成 2026 上半年总结，把所有'去年'改成'上季度'。只修改已有文字，不新增页面。",
  "source_pptx": "./source.pptx",
  "source_machine_extracted": "./source_machine_extracted.json",
  "shape_address_table": [
    {
      "slide": 1,
      "shape_id": 2,
      "paragraph": 0,
      "run": 0,
      "text": "季度复盘初稿",
      "left": 914400,
      "top": 914400,
      "width": 7315200,
      "height": 1097280,
      "font_size_pt": 32.0
    },
    {
      "slide": 1,
      "shape_id": 3,
      "paragraph": 0,
      "run": 0,
      "text": "2025 Q4",
      "left": 914400,
      "top": 2011680,
      "width": 7315200,
      "height": 731520,
      "font_size_pt": 20.0
    },
    {
      "slide": 2,
      "shape_id": 2,
      "paragraph": 0,
      "run": 0,
      "text": "销售数据",
      "left": 914400,
      "top": 914400,
      "width": 7315200,
      "height": 914400,
      "font_size_pt": 28.0
    },
    {
      "slide": 2,
      "shape_id": 3,
      "paragraph": 0,
      "run": 0,
      "text": "去年同比增长 15%",
      "left": 914400,
      "top": 1828800,
      "width": 7315200,
      "height": 914400,
      "font_size_pt": 20.0
    }
  ],
  "output_edits_json": "./edits.json"
}