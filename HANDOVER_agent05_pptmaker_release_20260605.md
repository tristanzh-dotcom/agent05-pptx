### ☀️ 次日启动胶囊 (Boot Prompt)
请在明天开启新对话时，直接复制以下指令发给系统：

```text
请静默读取并完全理解当前目录下的 `HANDOVER_agent05_pptmaker_release_20260605.md`。
1. 请将本对话的逻辑分支锁定为：【Agent05 PPT Maker 发布】，并在你回复的第一句话使用 Markdown 的 H1 标题 (`# Agent05 PPT Maker 发布 工作流重启`) 输出，以便系统自动重命名此对话。
2. 在执行任何操作前，请简要复述当前的【核心卡点】与【下一步行动】。等待我的确认后，再开始执行。
```

## 第一性原理与项目上下文

当前项目是 `ppt-maker` Web 发布链路，核心目标是把 Agent05 的 PPT 生成/编辑能力做成稳定可用的 Web 工作台：

- Mode A：用户输入 prompt，从 Gorden 模板生成新 PPTX。
- Mode B：用户上传现有 `.pptx`，保留排版，仅按 prompt 编辑文字。
- PDF/image 参考增强：用户上传 PDF 或图片后，不新增模式，只提取文本和配色注入 Mode A prompt。
- 发布态 UI 的核心任务只有两个：输入生成意图；检查、下载、复用生成产物。

本轮工作遵循：

- 不修改 `/Users/tristanzh/agent/.ai_skills/gorden-ppt-skill/`。
- 不修改 opencode 权限策略。
- 新需求严格按 SDD -> TDD -> 实现。
- 前端布局必须服从 Agent 平台整体风格，不在 Agent05 内部重复平台外壳信息。

## 2026-06-16 当前状态更新

本轮已按 SDD -> TDD -> 实现推进到可交给 TZ 浏览器测试的状态。

新增/更新的关键交付物：

- `docs/sdd/ppt-maker-web-workbench-layout.md`
  - 增补 Runtime Reliability、Preview Quality、Reference Upload 合同。
- `docs/superpowers/plans/2026-06-16-agent05-release-completion-plan.md`
  - 8 个任务已全部勾选完成。
- `docs/agent05-release-qa-20260616.md`
  - 记录完整测试、浏览器验收、运行态和剩余风险。
- `scripts/agent05_release_smoke.sh`
  - 一条命令检查 3000 发布页、8000 后端、Agent05 iframe、生成状态和文件列表。

当前运行态：

- Web 发布服务：`http://127.0.0.1:3000/agent05`
- PPT Maker 后端：`http://127.0.0.1:8000`
- 后端通过 detached screen 保活：

```bash
screen -ls
screen -S agent05-backend -X quit
```

已完成的关键修复：

- 后端未启动时，Agent05 显示 `PPT Maker 后端未启动`，不再把 raw `ECONNREFUSED` JSON 暴露给最终用户。
- 完成态默认恢复最新 PPTX 到预览/下载，而不是回到空白生成表单。
- 运行态刷新后显示进度和 `Cancel`，不暗示用户重新点击 Generate。
- 预览框固定标准 PPT 16:9，QuickLook iframe 使用 `scrolling="no"`，避免嵌套网页滚动条。
- `更多历史` 变成有界完整历史层，不再把页面压乱。
- 上传参考文件失败显示后端 typed detail，例如 `unsupported_reference_type`。
- 后端 PNG/PDF 参考分析 API、前端多文件显示、真实 PNG 代理上传均已验证。
- LLM 编排提示词已明确：用户要求某页只放标题/备用/空白时，不得为了填满模板槽位生成额外正文。

已执行并通过：

```bash
python3 -m pytest backend/tests -q
# 56 passed

cd frontend && npm test -- --run
# 46 passed

cd frontend && npm run build
# passed

cd /Users/tristanzh/agent/web
node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
# 10 passed

cd /Users/tristanzh/agent/PPT-maker
./scripts/agent05_release_smoke.sh
# Agent05 release smoke passed.
```

浏览器验收：

- URL：`http://127.0.0.1:3000/agent05`
- 1280x874 视口下，外层 document 不滚动，页脚在视口内。
- iframe 内生成控制台和预览区同屏存在。
- 最新 PPTX 自动载入预览。
- 预览 iframe `scrolling=no`，预览 stage `aspect-video`。
- 展开 `更多历史` 后，外层 document 仍保持视口高度，完整历史层可见。

仍需 TZ 手动确认：

- 用真实业务 prompt 和参考图片再生成一次 PPTX，检查内容质量、备用页是否只保留标题、下载文件是否符合预期。
- 如果要把后端端口从 `8000` 改为 `8005`，必须交给 agent00 端口治理 SDD/TDD，不在本工作流直接迁移。

## 今日完成事项

### 发布冒烟与回归

- 确认前端 `127.0.0.1:3000` 可访问，后端 `127.0.0.1:8000` 可启动。
- Mode A 浏览器生成通过：
  - `work/ppt-maker/20260605-101117_dcac4efd/output.pptx`
  - QuickLook visual-preview 返回 `mode: quicklook_html`。
- Mode B 协议级生成通过：
  - `work/ppt-maker/20260605-101534_ea030f6a/output.pptx`
  - 源 PPTX 哈希保持不变，输出 PPTX 哈希变化。
  - QuickLook visual-preview 通过。
- PDF/image 分析接口通过：
  - PDF 返回页数、字数、色板、推荐模板。
  - 图片返回色板，`ocr_unavailable` 作为降级信息返回但不阻断。
- 参考增强生成验证：
  - 首选推荐 `architecture-deck` 时真实构建失败，暴露模板推荐排序风险。
  - 手动选择 `minimal-business-summary` 后生成通过：
    - `work/ppt-maker/20260605-102016_2fb718bd/output.pptx`
    - Prompt 中确认注入参考分析摘要。
    - QuickLook visual-preview 通过。

### Workbench 布局 SDD/TDD/GREEN

- 新增并更新布局 SDD：
  - `docs/sdd/ppt-maker-web-workbench-layout.md`
- SDD 约束：
  - 桌面双栏：左侧生成控制台，右侧 PPT 结果工作区。
  - 不依赖 raw `100dvh`，高度应基于平台内容区。
  - `<960px` effective content width 进入 `生成 / 预览 / 历史` Tabs。
  - Header 删除后端 URL / 前端挂载路径。
  - Footer 免责声明只出现一次。
  - 视觉预览失败时显示 `渲染预览不可用`。
- TDD RED：
  - 在 `frontend/src/App.test.tsx` 新增布局行为测试。
  - 初始运行结果：`37 tests | 4 failed | 33 passed`。
  - 失败点均为新布局缺失，无误报。
- GREEN 实现：
  - `frontend/src/App.tsx`
  - 发布态 Header：`PPT生成 + 后端已连接`。
  - 桌面双栏：`生成控制台` + `PPT 结果工作区`。
  - 最近历史常驻显示最近 3 条。
  - `更多历史` 展开完整列表。
  - 窄屏 `生成 / 预览 / 历史` Tabs。
  - 窄屏生成完成后自动切到 `预览`。
  - 视觉预览失败保留下载，并显示 `渲染预览不可用`。

### 验证命令

已执行：

```bash
cd frontend && npm test -- --run
# 37 passed

cd frontend && npm run build
# passed
```

浏览器验证：

- 1440px：
  - `PPT生成`、`后端已连接` 存在。
  - `生成控制台` 存在。
  - `PPT 结果工作区` 存在。
  - `最近历史` 存在。
  - 后端 URL 和 `/agent05/index.html` 不显示。
  - 免责声明出现 1 次。
- 900px：
  - 显示 `生成 / 预览 / 历史` Tabs。
  - 默认选中 `生成`。

### 之前已完成并仍需保留的功能

- Reference Analyzer：
  - `backend/app/services/reference_analyzer.py`
  - `backend/app/routers/references.py`
- Mode A 参考增强注入：
  - `backend/app/services/generation.py`
  - `backend/app/routers/generation.py`
- Mode B template-preserving edit。
- 质量门：
  - `backend/app/services/validate_edits.py`
- QuickLook 预览接受 `<img>` 和 `class="slide"` HTML。
- 前端质量门结构化展示：
  - `frontend/src/qualityGate.ts`
  - `frontend/src/QualityGateError.tsx`

## 已作出的关键决策

- PDF/image 不引入新 Mode，只作为 Mode A prompt 增强。
- `.pptx` 上传保持 Mode B，即 `template_preserving_edit`。
- 不改后端文件列表 API；历史 prompt 展示继续采用 frontend localStorage metadata。
- 删除 `style` / `purpose` 独立输入；它们本质是 prompt 文本。
- Mode B 下不显示 page_count 下拉，显示 `页数保留源文件`。
- QuickLook 预览接受 HTML slide DOM，放弃只检测 `<img>` 的过严策略。
- Workbench 双栏方向正确，但今天截图证明：最近历史不应继续塞在左栏下半段。
- Agent05 内部不应复制平台 Header；应服从 Agent02/03/04 的统一外壳风格。
- 底部应从免责声明改为 Agent04 风格模型配置栏，免责声明弱化或挪到设置/tooltip。

## 未解决的风险/报错

- 最新截图暴露的新 UI 问题尚未实现修复：
  - `最近生成` 在满屏状态下仍不能一屏完整显示。
  - 左栏承担 Prompt、上传、页数、生成按钮、历史，垂直空间仍过载。
  - Agent05 内部 Header 风格和 Agent02/03/04 不一致，且仍像平台 Header 的重复版本。
  - 页面底部缺少 Agent04 同款模型配置栏。
- 推荐模板排序风险：
  - 图片参考增强把 `architecture-deck` 排在第一时，真实构建失败。
  - 错误包含 `expected_text mismatch` 和多个文本溢出。
  - 同一参考分析改选 `minimal-business-summary` 可通过。
- 历史 metadata 仍是 frontend localStorage：
  - 跨浏览器/清缓存不共享。
  - 旧历史仍只能 fallback 为 `[模板生成] 生成记录`。
- `soffice` 和 `pdftoppm` 当前不可用；QuickLook 是主预览路径。
- Git 状态：
  - Git root 是 `/Users/tristanzh/agent`。
  - 当前 `PPT-maker` 路径下 `git diff -- PPT-maker` 为空，说明 PPT-maker 当前没有未提交 diff。
  - 仓库中存在其他项目未提交改动：
    - `Passenger-Vehicle-Intel/...`
    - `Personal-Asset/...`
  - 不应把这些无关改动纳入 Agent05 提交。

## 下一步行动

1. 先确认服务状态：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN || true
lsof -nP -iTCP:8000 -sTCP:LISTEN || true
```

2. 如后端未运行，启动：

```bash
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

3. 如前端未运行，启动：

```bash
cd frontend && npm run dev
```

4. 打开：

```text
http://127.0.0.1:3000/agent05/
```

5. 下一轮优先做新的 SDD/TDD：

- 修改 `docs/sdd/ppt-maker-web-workbench-layout.md`：
  - 最近历史从左栏移出，改成右侧/底部横向 compact history strip。
  - Agent05 内部 Header 改为与 Agent02/03/04 统一的轻量工作台工具栏，删除平台字段重复。
  - 底部栏改成模型配置：
    - `DeepSeek 中文生成`
    - `codex-base 英文报告`
    - `bge-m3 本地语义检索`
    - `QuickLook 预览`
    - `Gorden PPTX 构建`
- 写 RED 测试：
  - 最近生成横条首屏可见且不在左栏内。
  - Agent05 不再渲染 `项目名称 / 可视化编辑`。
  - 底部显示模型配置栏。
  - 免责声明不再占主底栏。
- GREEN 实现后跑：

```bash
cd frontend && npm test -- --run
cd frontend && npm run build
```

6. 若要继续 `git push`：

```bash
git -C /Users/tristanzh/agent status --short -- PPT-maker
git -C /Users/tristanzh/agent status --short
git -C /Users/tristanzh/agent push origin HEAD
```

注意：如果根仓库仍只有其他项目脏改动，Agent05 不应创建包含无关项目的提交。

## 2026-06-16 更新：发布页阶段聚焦与预览布局已修复

本轮已按 SDD/TDD 完成 Agent05 PPT Maker 发布页主要 UI/预览问题修复。

已完成：

- 输入、生成中、结果检查、历史记录改为阶段聚焦模型：
  - 无成品时默认 `PPT 生成输入`。
  - 生成中默认 `PPT 生成进度`。
  - 已有成品/生成完成后默认 `PPT 检查结果`。
  - 历史记录不再作为常驻底部条挤占主页面，桌面改为抽屉，窄屏保留在 History tab。
- `/agent05` web 发布壳已删除无效模型配置页脚：
  - 不再显示 `模型配置`、`DeepSeek 中文生成`、`QuickLook 预览` 等实现细节。
  - iframe 主区域拿回垂直空间。
- PPT 成品预览修复为标准 16:9：
  - React 预览容器高度链路已补齐，桌面和窄屏都不再塌缩。
  - QuickLook wrapper 只显示单张 `.slide`，支持上一页/下一页，并将 unitless QuickLook CSS 长度规范化为 `px`。
  - iframe 设置 `scrolling="no"`，避免内部网页滚动条破坏 PPT 画布。
- 窄屏根 grid 修复为 `auto auto 1fr`：
  - `生成 / 预览 / 历史` tablist 不再被拉伸成巨大空列。
- 发布页真实服务已重启：
  - `127.0.0.1:3000` 当前 PID：以 `server.mjs` 新版本运行。
  - `127.0.0.1:8000` 后端仍在运行。

最终验证：

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
# 49 passed

npm run build
# passed, final asset includes /agent05/assets/index-CVkEan9n.js

cd /Users/tristanzh/agent/PPT-maker
python3 -m pytest backend/tests -q
# 56 passed

cd /Users/tristanzh/agent/web
node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
# 10 passed
```

真实浏览器测量：

- 1440x900：outer `scrollWidth === clientWidth`；preview stage `924.4 x 520`，ratio `1.778`。
- 820x900：outer/inner 均无横向溢出；preview stage `584 x 328.5`，ratio `1.778`；tablist 高度 `38px`。
- `hasModelCopy === false`，`hasPermanentHistoryStrip === false`。

当前建议下一步：

1. TZ 在浏览器打开 `http://127.0.0.1:3000/agent05` 做人工验收。
2. 若继续产品化，下一阶段不再优先修布局，而应回到内容质量与模板选择：
   - 真实生成 PPT 的版式质量门。
   - 参考图片色彩/模板匹配稳定性。
   - 历史记录 metadata 从 localStorage 迁到后端持久化。
3. 端口 `8000 -> 8005` 仍交给 agent00 端口治理工作流，不在本次 Agent05 修复内迁移。
