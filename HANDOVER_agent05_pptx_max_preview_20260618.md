### ☀️ 次日启动胶囊 (Boot Prompt)
请在明天开启新对话时，直接复制以下指令发给系统：

```text
请静默读取并完全理解当前目录下的 `HANDOVER_agent05_pptx_max_preview_20260618.md`。
1. 请将本对话的逻辑分支锁定为：【Agent05 PPT 成品最大预览】，并在你回复的第一句话使用 Markdown 的 H1 标题 (`# Agent05 PPT 成品最大预览 工作流重启`) 输出，以便系统自动重命名此对话。
2. 在执行任何操作前，请简要复述当前的【核心卡点】与【下一步行动】。等待我的确认后，再开始执行。
```

## 第一性原理与项目上下文

当前功能目标：Agent05 PPT Maker 的结果页首先服务于“检查 PPT 成片”。从第一性原理出发，成品 PPT 是最终用户交付物，结果态页面的最大可视面积应优先给 16:9 PPT 预览画布；下载、历史、文本提取、约束核验、参考增强说明都应作为辅助操作或诊断，不应默认压缩主画布。

项目路径在 Agent08 repo split 中已改名：旧路径 `/Users/tristanzh/agent/PPT-maker` 现在映射到新路径 `/Users/tristanzh/agent/agent05-pptx`。收工、扫描、git 状态、后续实现都必须以新 repo 根目录 `/Users/tristanzh/agent/agent05-pptx` 为准。

已读取 repo split notice：`/Users/tristanzh/agent/AGENT_REPO_SPLIT_NOTICE_20260618.md`。关键约束：

- 不要使用旧项目路径作为新 work root。
- 不要在 `/Users/tristanzh/agent` monorepo 根执行 `git stash pop`。
- 如需恢复 split 前后的未提交工作，必须按路径恢复到新 repo 前缀。
- 详细 split 证据在 `/Users/tristanzh/agent/HANDOVER_git_split_20260618.md`。

当前开发阶段：handoff/closing。上一阶段代码实现和验证已在对话中完成，但 repo split 后新 repo 源码承接状态存在风险，见“未解决的风险/报错”。

## 今日完成事项

今日在对话中完成了两类 Agent05 结果页修复/重设：

1. QuickLook iframe 裁切修复
   - 根因：wrapper 内层 `.preview-stage` 有 `padding: 28px 28px 62px`，且 `.preview-frame` 是 flex shrink item，导致 iframe layout viewport 先被压到约 484px，再做 transform，结果只显示半页。
   - 设计修复：去掉 wrapper 内部 padding；将 QuickLook iframe 设为 `flex: 0 0 auto`，保留原始 slide viewport 后再缩放。
   - 对话中验证数据：wrapper 版本 `2026-06-18.1`；QuickLook iframe client viewport 从约 `484x540` 修复为 `979x540`；缩放后不再右侧裁切。

2. 方案 A：画布优先成品预览页
   - 设计 spec：`docs/superpowers/specs/2026-06-18-agent05-max-preview-result-design.md`
   - 执行 plan：`docs/superpowers/plans/2026-06-18-agent05-max-preview-result-plan.md`
   - 设计目标：结果态显示 `PPT 成品最大预览`，移除旧成品卡片 chrome，把下载放到紧凑顶部动作条，把文本提取/约束核验/参考增强信息压到底部 `结果诊断` 轨道。
   - 对话中浏览器实测：在 1280x720 视口下，16:9 stage 从约 `542x305` 提升到约 `681x383`，宽高提升约 25.6%，面积提升约 58%。
   - 对话中生成截图：`/tmp/agent05-max-preview-result.png`。

对话中跑过的验证命令和结果：

```bash
npm test -- --run src/App.test.tsx
# 59 passed

npm run build
# passed

python3 -m pytest backend/tests -q
# 65 passed

./scripts/agent05_release_smoke.sh
# Agent05 release smoke passed
```

## 已作出的关键决策

- 选择方案 A：画布优先结果页。
  - 放弃方案 B“点击后全屏预览”，因为默认结果页仍浪费空间。
  - 放弃方案 C“输入/预览左右双栏”，因为成品检查阶段不应继续牺牲画布面积。
- 结果态诊断默认收起。
  - 文本提取、约束核验、参考增强信息都是诊断，不是最终交付物。
  - 诊断入口保留，但默认只占底部紧凑轨道。
- 下载操作上移到顶部动作条。
  - 下载是结果页一等操作，但不应在画布内部占一行。
- 共享 web shell 不在本次业务前端范围内。
  - 当前剩余占高主要来自发布壳产品 header、左侧导航、底部模型配置栏。
  - 根据最高 web 发布边界规则，业务 workflow 不应擅自改 shared web shell 视觉范式；如需进一步放大，需要交给 web 发布工作流。

## 未解决的风险/报错

最高优先级风险：repo split 后新 repo 源码未承接今天对话中的实现。

在新权威根目录 `/Users/tristanzh/agent/agent05-pptx` 执行的证据：

```bash
git rev-parse --show-toplevel
# /Users/tristanzh/agent/agent05-pptx

git status --short
# ?? frontend/dist/
# ?? frontend/node_modules/
# ?? work/
```

进一步核对发现：

- 新 repo 的 `frontend/dist/assets/index-C3DACW8T.js` 包含 `PPT 成品最大预览`、`结果诊断` 等构建产物。
- 但新 repo 的 `frontend/src/App.tsx` 仍是旧源码片段，未包含 `PPT 成品最大预览`。
- 新 repo 的 `backend/app/services/files.py` 仍未包含 `VISUAL_PREVIEW_WRAPPER_VERSION = "2026-06-18.1"`、`VisualResourceParser`、`flex: 0 0 auto` 等 QuickLook wrapper 修复源码。
- 新 repo 下没有 `docs/superpowers/specs/2026-06-18-agent05-max-preview-result-design.md` 或 `docs/superpowers/plans/2026-06-18-agent05-max-preview-result-plan.md`。

结论：当前可运行/可测的 `frontend/dist` 产物包含今天最后的 UI，但 durable source-of-truth 在新 repo 里尚未恢复。不能把“dist 可运行”误认为“源码已完成迁移”。

不要做的事：

- 不要在 `/Users/tristanzh/agent` 执行 `git stash pop`。
- 不要把旧路径 `/Users/tristanzh/agent/PPT-maker` 当成项目根继续扫描。
- 不要把 monorepo 根看到的旧路径删除解释为项目文件被删除。

## 下一步行动

明天第一步：

```bash
cd /Users/tristanzh/agent/agent05-pptx
git status --short
rg -n "PPT 成品最大预览|结果诊断|VISUAL_PREVIEW_WRAPPER_VERSION|2026-06-18.1|flex: 0 0 auto" frontend/src backend/app docs/sdd -S
```

预期：如果源码仍未包含这些标识，需要先做“路径化恢复/重放今天实现”，而不是继续新功能。

建议恢复顺序：

1. 在新 repo 中重放 QuickLook wrapper 修复：
   - `backend/app/services/files.py`
   - `backend/tests/test_api_skeleton.py`
   - `docs/sdd/ppt-maker-web-workbench-layout.md`
2. 在新 repo 中重放成品最大预览页：
   - `frontend/src/App.tsx`
   - `frontend/src/App.test.tsx`
   - `docs/sdd/ppt-maker-web-workbench-layout.md`
   - `docs/superpowers/specs/2026-06-18-agent05-max-preview-result-design.md`
   - `docs/superpowers/plans/2026-06-18-agent05-max-preview-result-plan.md`
3. 恢复后重新验证：

```bash
cd /Users/tristanzh/agent/agent05-pptx
npm test -- --run src/App.test.tsx
npm run build
python3 -m pytest backend/tests -q
./scripts/agent05_release_smoke.sh
```

4. 用浏览器打开：

```text
http://127.0.0.1:3000/agent05
```

确认 stage 接近今天实测的 `681x383`，且右侧不再裁切。

后续如 TZ 要继续压榨更大可视面积，应该另开 web 发布工作流处理 shared web shell：产品 header、左侧导航、底部模型配置栏的空间治理。
