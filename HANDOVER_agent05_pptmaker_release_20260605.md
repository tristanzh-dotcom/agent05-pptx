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

本轮工作的核心原则：

- 不修改 `/Users/tristanzh/agent/.ai_skills/gorden-ppt-skill/`。
- 不修改 opencode 权限策略。
- 新需求严格按 SDD -> TDD -> 实现。
- Web 前端要减少用户认知负担：输入区只保留 prompt、参考文件、页数三个真实决策。

## 今日完成事项

### 后端

- 新增并接入 Reference Analyzer：
  - `backend/app/services/reference_analyzer.py`
  - `backend/app/routers/references.py`
  - `backend/app/main.py`
  - `requirements.txt`
- 支持 PDF/image 参考分析：
  - 文件类型检测：`.pptx` / `.pdf` / image / unknown。
  - PDF 文本提取、页数读取、截图生成。
  - 图片缩略图和配色提取。
  - 参考配色推荐模板排序。
  - 降级错误通过 `extraction_errors` 返回，不阻断生成。
- Mode A prompt 注入参考分析：
  - `backend/app/services/generation.py`
  - `backend/app/routers/generation.py`
  - 参考摘要写入 orchestration prompt。
  - 模板候选优先按推荐 slug 排序。
- Mode B 已完成：
  - `.pptx` 上传后跳过模板选择。
  - 使用 explicit address edits。
  - `validate_edits(page_count=None)` 跳过页数校验。
  - 源 PPTX 哈希不变。
- 质量门已完成：
  - `backend/app/services/validate_edits.py`
  - page_count 约束、占位文案检测、schema 校验、重复 slot 检测。
- 修复 QuickLook 预览误判：
  - `backend/app/services/files.py`
  - 之前只认 `<img>`，真实 PPTX 的 QuickLook 会生成 `div.slide` HTML。
  - 现在 `has_visual_content()` 同时接受 `<img>`、`class="slide"`、`class='slide'`。

### 前端

- 重构输入区为紧凑 Prompt Card：
  - `frontend/src/App.tsx`
  - 删除“高级参数”折叠面板。
  - 删除独立 ReferenceAnalysisCard。
  - 上传区并入 Prompt 卡片。
  - `.pptx -> 保留模板编辑内容`，`.pdf/.png -> 提取风格配色`。
  - PDF/image 上传后内联显示文件名、页数、字数、前三个色板。
  - Mode B 下页数控件改为静态提示：`页数保留源文件`。
  - 修复 `.pptx` 上传后“源文件”重复 chip。
- 模式标签三态：
  - `从模板生成`
  - `从模板生成（参考增强）`
  - `保留模板编辑内容`
- 生成完成后预览区新增参考增强摘要：
  - `Prompt 已增强：参考 ... · 配色 ... · 推荐模板 ...`
- 历史列表优化：
  - 新生成记录用 frontend localStorage 保存 prompt 前缀和类型标签。
  - 旧记录 fallback 为 `[模板生成] 生成记录`。
  - 不再把 `output.pptx` 作为主标题。
- 质量门错误结构化展示：
  - `frontend/src/qualityGate.ts`
  - `frontend/src/QualityGateError.tsx`
  - JSON 质量门错误渲染成可读卡片，普通错误保持纯文本。

### SDD 文档

本轮新增/更新：

- `docs/sdd/ppt-maker-web-edits-quality-gate.md`
- `docs/sdd/ppt-maker-web-mode-b.md`
- `docs/sdd/ppt-maker-web-reference-analyzer.md`
- `docs/sdd/ppt-maker-web-input-area-redesign.md`
- `docs/sdd/ppt-maker-web-visual-preview-template-cycling.md`
- `docs/sdd/ppt-maker-web-generation-state-persistence.md`

### 测试与验证

收工前重新执行：

```bash
python3 -m pytest backend/tests -q
# 53 passed

cd frontend && npm test -- --run
# 34 passed

cd frontend && npm run build
# passed
```

真实 QuickLook 预览验证：

- 对 `work/ppt-maker/20260604-190305_feedaf83/output.pptx` 请求 visual-preview。
- 重启后端后返回 `preview_url` 和 `mode: quicklook_html`。
- `index.html` 可访问，包含 `Preview.html`。

## 已作出的关键决策

- PDF/image 不引入新 Mode，只作为 Mode A prompt 增强。
- `.pptx` 上传保持 Mode B，即 `template_preserving_edit`。
- 不改后端文件列表 API；历史 prompt 展示采用 frontend-only localStorage metadata。
  - 局限：旧历史记录无法还原真实 prompt。
  - 取舍：符合“不改后端 API”的约束。
- 删除 `style` / `purpose` 独立输入。
  - 原因：它们本质是 prompt 文本，不是结构化参数。
  - 参考分析已自动提取风格，手填 style 可能冲突。
- Mode B 下不显示 page_count 下拉。
  - 原因：Mode B 保留源 PPTX 页数，`页面 10` 会误导用户。
- QuickLook 预览接受 HTML slide DOM。
  - 原因：macOS `qlmanage -p` 对 PPTX 可生成 `div.slide`，不一定生成 `<img>`。
  - 放弃只检测 `<img>` 的过严策略。
- “保留模板编辑内容”是状态标签，不是按钮。
  - 该标签不应有点击行为。

## 未解决的风险/报错

- 当前收工时端口状态：
  - `127.0.0.1:3000` 前端 Vite 正在监听。
  - `127.0.0.1:8000` 后端收工检查时未监听；后续曾重启过后端用于 QuickLook 验证。明天接手时先重新确认端口。
- Browser 可视化工具本轮未暴露为可调用工具，因此没有做 in-app Browser 截图验证；主要依赖测试、build、curl 以及真实 visual-preview 接口验证。
- footer 在源码中只有一处，测试也锁定只渲染一次；如果浏览器仍看到两次，优先怀疑打开了后端静态旧 build + Vite 页面叠加、缓存或服务指向不一致。
- 历史列表 prompt metadata 是 frontend localStorage，跨浏览器/清缓存不共享。
- `soffice` 和 `pdftoppm` 当前命令不可用；QuickLook 是主预览路径。`render_slides.py` 的 LibreOffice fallback 暂未接入本轮修复。
- 项目目录不是 git repo，不能用 `git diff` 总览；需要用文件时间和测试确认状态。

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

5. 优先做三个冒烟：

- Mode A：无文件输入 prompt 生成，确认模板选择、生成、下载、QuickLook 预览。
- Mode B：上传 `.pptx`，确认只显示 `保留模板编辑内容` 和 `页数保留源文件`，不出现模板选择。
- PDF/image：上传参考文件，确认内联页数/字数/色板，生成完成后显示 `Prompt 已增强`。

6. 若预览仍失败，第一步看：

```bash
curl -sS http://127.0.0.1:8000/agent05/api/files/<task_dir>/output.pptx/visual-preview | python3 -m json.tool
```

然后检查：

```bash
backend/app/services/files.py
backend/tests/test_api_skeleton.py::test_visual_preview_accepts_quicklook_slide_html_without_img
```

7. 回归命令：

```bash
python3 -m pytest backend/tests -q
cd frontend && npm test -- --run
cd frontend && npm run build
```
