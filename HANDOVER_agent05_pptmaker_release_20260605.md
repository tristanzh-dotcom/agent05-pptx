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
