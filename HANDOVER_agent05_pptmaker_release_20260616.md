### ☀️ 次日启动胶囊 (Boot Prompt)
请在明天开启新对话时，直接复制以下指令发给系统：

```text
请静默读取并完全理解当前目录下的 `HANDOVER_agent05_pptmaker_release_20260616.md`。
1. 请将本对话的逻辑分支锁定为：【Agent05 PPT Maker 发布】，并在你回复的第一句话使用 Markdown 的 H1 标题 (`# Agent05 PPT Maker 发布 工作流重启`) 输出，以便系统自动重命名此对话。
2. 在执行任何操作前，请简要复述当前的【核心卡点】与【下一步行动】。等待我的确认后，再开始执行。
```

## 第一性原理与项目上下文

Agent05 的核心目的不是“生成一个文件”，而是让用户在本地发布页中完成一个可理解、可检查、可下载、可迭代的 PPT 生成工作流。

当前工作流由三层组成：

- `/Users/tristanzh/agent/PPT-maker/backend`：FastAPI 后端，负责参考文件分析、模板/生成编排、文件历史、QuickLook 预览包装。
- `/Users/tristanzh/agent/PPT-maker/frontend`：React/Vite 嵌入式工作台，负责输入、上传、生成状态、结果预览、历史操作。
- `/Users/tristanzh/agent/web`：共享发布页壳，负责 `/agent05` 路由、iframe 挂载、API/WebSocket 代理。该目录不是本项目根，但今天为完成 Agent05 发布页可用性做了最小路由级联动修改。

今天的方向是：先修复用户已指出的页面阶段混乱、历史层级混乱、预览比例/滚动/错乱问题，再用 in-app browser 从第一性原理重新审查剩余不合理交互。

## 今日完成事项

项目根内核心改动：

- `docs/sdd/ppt-maker-web-workbench-layout.md`
  - 新增阶段聚焦契约：`compose -> generating -> result -> history drawer`。
  - 新增单页 QuickLook 预览契约。
  - 新增发布壳不得显示模型/实现细节元信息的契约。
- `frontend/src/App.tsx`
  - 将桌面主工作区改为单阶段焦点：输入、生成中、结果检查互斥显示。
  - 历史记录从常驻底部条改为桌面抽屉；窄屏保留 History tab。
  - 修复窄屏根 grid 行模板，避免 `生成/预览/历史` tab 被拉伸成巨大空列。
  - 修复预览高度链路，使 PPT 预览在桌面和窄屏都保持 16:9。
  - 保留后端不可用提示、上传错误 detail 展示、多文件参考输入等现有能力。
- `frontend/src/App.test.tsx`
  - 更新/新增阶段聚焦、历史抽屉、窄屏 tab、16:9 预览高度链路等测试。
  - 当前前端测试为 49 项。
- `backend/app/services/files.py`
  - QuickLook wrapper 支持单页 `.slide` 显示。
  - 对 QuickLook HTML 中 unitless CSS length 做 `px` 归一化。
  - 增加上一页/下一页控件与 `data-ql-slide-index` 标记。
- `backend/tests/test_api_skeleton.py`
  - 验证 QuickLook wrapper 包含 unit normalization、单页显示、翻页控件。
- `docs/agent05-release-qa-20260616.md`
  - 记录最终 QA 命令、真实浏览器测量、运行状态和剩余风险。
- `HANDOVER_agent05_pptmaker_release_20260605.md`
  - 追加 2026-06-16 更新段，避免旧交接继续指向已完成的布局问题。

外部联动改动，位于 `/Users/tristanzh/agent/web`：

- `server.mjs`
  - 删除 Agent05 发布壳底部无效模型配置区。
- `app/agent05.css`
  - 将 Agent05 壳从三行布局改为抬头栏 + iframe 两行布局，释放 iframe 高度。
- `tests/agent05-service.test.mjs`
  - 断言发布壳不再包含 `模型配置`、`DeepSeek 中文生成`、`QuickLook 预览` 等实现细节。
- `tests/agent05-browser-layout.test.mjs`
  - 断言发布壳无模型配置区、iframe 高度足够、外层无滚动溢出。

已执行验证：

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
# 49 passed

npm run build
# passed

cd /Users/tristanzh/agent/PPT-maker
python3 -m pytest backend/tests -q
# 56 passed

cd /Users/tristanzh/agent/web
node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
# 10 passed

cd /Users/tristanzh/agent/PPT-maker
./scripts/agent05_release_smoke.sh
# Agent05 release smoke passed.
```

真实浏览器测量：

- 1440x900：preview stage `924.4 x 520`，ratio `1.778`。
- 820x900：preview stage `584 x 328.5`，ratio `1.778`。
- 外层/内层均无横向溢出。
- `hasModelCopy === false`。
- `hasPermanentHistoryStrip === false`。

## 已作出的关键决策

- 放弃“三栏同屏”：输入、结果、历史不能同时作为一屏主焦点，否则用户不知道当前阶段。
- 历史不再常驻底部：历史是复用/恢复入口，不是生成前后的主任务。
- 预览必须按 PPT slide 而不是整份 HTML 文档缩放：QuickLook 的多页 HTML 不能作为一个长网页直接 iframe。
- 发布壳不展示模型配置：模型/实现细节对最终用户无用，只会挤占 Agent05 的有效工作区。
- 端口仍保留 `8000`：`8000 -> 8005` 迁移属于 agent00 端口治理，不在今天的 Agent05 发布修复中执行。
- 未触发新的真实生成：最后一轮 in-app browser 审查只填了 Prompt，没有点击真实 `Generate PPT`，避免产生新的 LLM/PPT 历史记录干扰诊断。

## 未解决的风险/报错

in-app browser 在最后一轮审查中发现以下未修复问题，明天应优先处理：

1. 窄屏状态机错位：
   - 点击顶部 `历史记录` 没有切到 History tab，也没有抽屉出现。
   - 点击 `新建 PPT` 后顶部状态变成 Compose，但仍停留在 History tab。
   - 点击 `查看结果` 后顶部状态变成 Result，但仍停留在 Generate tab。
   - 根因判断：`workspaceFocus` 和 `activePanel` 是两个独立状态源，窄屏下没有同步。
2. 历史抽屉语义不清：
   - 桌面抽屉打开后没有明确 `关闭` 按钮。
   - 抽屉已经展示完整历史，但按钮仍叫 `更多历史`，实际更像关闭/收起。
3. 旧历史文件的预览工件没有随新代码刷新：
   - 直链打开 `20260616-151209_b309d364/output.pptx/visual-preview/index.html` 仍没有新翻页控件。
   - 说明旧 `visual_preview/index.html` 未被版本化失效或重建。
4. 当前历史 PPT 预览仍有破图/线框残片：
   - 窄屏和直链截图都能看到破图占位与排版残片。
   - 预览层不应把破图状态当作正常成功。
5. 文本提取结果展开后信息过载：
   - 大量 slide OCR/text fragments 直接塞入页面。
   - 需要摘要化或独立完整文本视图。
6. 生成质量未核验用户硬约束：
   - 用户曾要求第 4/5 页只放“备用”，但当前历史结果第 4/5 页仍是趋势/指标内容。
   - UI 没有提示“约束未满足”。
7. QuickLook 可访问 DOM 仍暴露多页内容：
   - in-app browser DOM snapshot 中可读到所有页文本，与单页视觉预览模型不一致。
   - 需要在重建预览工件后确认；如果仍存在，应为非当前 slide 加 `aria-hidden="true"`。

运行状态：

- `127.0.0.1:3000` 已重启并监听。
- `127.0.0.1:8000` 后端仍监听。
- 工作区存在很多其他项目脏改动；Agent05 后续提交必须严格只纳入相关文件。

## 下一步行动

明天第一步先不要改代码，先复现并确认窄屏状态机问题：

```bash
cd /Users/tristanzh/agent/PPT-maker
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8000 -sTCP:LISTEN
./scripts/agent05_release_smoke.sh
```

然后在 in-app browser 打开：

```text
http://127.0.0.1:3000/agent05
```

建议按以下 SDD/TDD 顺序推进：

1. SDD：在 `docs/sdd/ppt-maker-web-workbench-layout.md` 追加“窄屏单一状态机契约”。
2. TDD：在 `frontend/src/App.test.tsx` 增加 RED 测试：
   - 窄屏点击 `历史记录` 应显示 History tab。
   - 窄屏点击 `新建 PPT` 应显示 Generate tab。
   - 窄屏点击 `查看结果` 应显示 Preview tab。
   - 桌面历史抽屉必须有 `关闭` 按钮，且完整历史状态不显示误导性 `更多历史`。
3. 实现：统一 `workspaceFocus` 与 `activePanel`，或引入单一 `currentStage/currentPanel` 状态机。
4. 第二批 SDD/TDD：
   - 预览工件版本化与旧预览自动重建。
   - 破图/空白/裁切视觉健康检查。
   - 文本提取摘要化。
   - 生成后约束核验面板。

必跑验证：

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
npm run build

cd /Users/tristanzh/agent/PPT-maker
python3 -m pytest backend/tests -q
./scripts/agent05_release_smoke.sh

cd /Users/tristanzh/agent/web
node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
```
