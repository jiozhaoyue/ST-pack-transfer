# ST-pack-transfer 性能审计报告（2026-11-17）

> 审计性质：**只读审计**。除本报告外未改动代码 / 样式 / 测试 / 配置，未安装依赖，未派生子代理。
> 服务：`http://localhost:3040`（Vite dev，HTTP 200 / 5ms），全程单一端口，未开第二端口。
> 依据规范：`.trellis/spec/frontend/perf-budget.md`、`.trellis/spec/guides/rule-catalog.md`（R-21 / R-25）、`.trellis/spec/frontend/async-bounds.md`。

## 一、结论摘要

| 等级 | 数量 | 条目 |
| --- | --- | --- |
| **P0** | **0** | 无 |
| **P1** | **3** | P-02 教程模态长任务 111.61ms；P-03 切视图后 Blink 布局对象 +1.04MB / +15,339 节点；P-05 局域网吞吐端到端未实测、历史 300KB/s 需回归确认 |
| **P2** | **7** | P-01 / P-04 / P-06 / P-07 / P-08 / P-09 / P-10 |

**一句话**：常规交互反馈（切视图 / 切平台 / 展开选择器 / 滚动）实测 0.1–27.3ms，全部满足 ≤100ms；Worker 终止后置 null 与进度 rAF 单飞合帧均合规。主要风险集中在**教程模态渲染长任务**、**切视图后的布局对象残留**，以及**局域网吞吐修复后缺乏端到端实测**。

**预算口径说明（重要）**：`perf-budget.md` 明确把 `约 300KB/s`、`685.4MB/60.1s` 等列为**历史事故基线，不是目标值**。本报告严格区分“目标阈值”与“历史实测”，未把事故基线写成达标值。

---

## 二、发现表

| ID | 严重度 | 场景 | 位置(文件:行) | 实测数值 | 预算/阈值 | 差距 | 根因 | 修法 | 关联规则 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | P2 | 首屏（dev 3040） | `index.html` + Vite dev | responseStart **69.1ms**、responseEnd **76.4ms**、domInteractive **248.5ms**、DCL **2805.5ms**、load **2854.4ms**；**113 资源 / 109 script** | 首屏即时、不空白；交互反馈 ≤100ms | load 2.85s（dev 特征） | Vite dev 逐模块加载 109 个 ESM，串行解析（trace 中 `v8.parseOnBackground` max 908.5ms、`v8.evaluateModule` max 192.8ms） | 生产为单 bundle（`index-Bj65FLUi.js` 1024.8KB），但**生产首屏未实测**，应补一次 `vite preview` 同端口测量 | R-25 / perf-budget |
| P-02 | P1 | 长任务（教程模态） | `src/ui/workbench-view.js:6308-6321`（`showModal`） | 交互 trace：**1×111.61ms** 长任务；CPU profile：`showModal` self **61.73ms**；Layout max **43.21ms**、TimerFire max 161.58ms | 无 >50ms 长任务；交互反馈 ≤100ms | 超 50ms 阈值约 +61.6ms | `showModal()` 每次重建 `modal-extra` / `modal-actions` 的 innerHTML 并同步 `dlg.showModal()`，触发强制布局；伴随 MajorGC 4.21ms | 模态 DOM 复用 + 增量更新；把重建拆到多帧；教程面板单独缓存 | R-21 / R-25 |
| P-03 | P1 | 内存（切视图残留） | `src/ui/workbench-view.js` 视图渲染 | A/B：`38,187,583 B → 39,227,611 B`（**+1,040,028 B / +15,339 节点**）；增长类 `PhysicalBoxFragment` +42,960B、`ComputedStyle` +42,840B、`LayoutBlockFlow` +37,464B、`LayoutResult` +36,320B、`CSSAnimation` +15,600B、`KeyframeEffect` +12,480B | 重复操作后不应持续增长 | +1.04MB | 10 次切视图后 Blink 布局 / 动画对象未回收 | **注意：单次 A/B 不能证明泄漏**（heap 工具自述）；需强制 GC 后复测，若仍增长再查模板副本 / 事件监听释放 | R-21 / R-30 |
| P-04 | P2 | 内存（教程进出） | `index.js:2489`；`workbench-view.js:7758` | 10 次进出专项：压缩快照 2,600,799→2,617,670 B；增长以 V8 指令 +86,016B 为主，`V8FrameCallback` **+5**、`V8FrameRequestCallback` **+5**、`settle` +5；**无 Blink DOM 类显著增长** | 退出应无残留 | +5 个 rAF 回调（轻量） | 教程退出时未 `cancelAnimationFrame(tutorialRaf)`，遗留少量未执行回调 | 退出分支显式 `cancelAnimationFrame` | R-21 |
| P-05 | P1 | **局域网吞吐（重点）** | `src/ui/lan-transfer-panel.js:36-41, 422-428`；`src/core/lan-transfer.js:29` | 代码注释（2026-11-17）：修复前每块全量 `renderLan()` 重绘 → 1GB 约 **16384 次重绘**、实测 **约 300KB/s**；现已改 `UI_THROTTLE_MS=120`。本环境同页双端 WebRTC 握手失败（`dcState=connecting`），**端到端速率未测** | 不得慢于宿主原生；有界等待 | 修复后速率未知 | 修复前进度 UI 每块全量 DOM 重绘，成为接收端串行消费瓶颈 | 按第四节 C步骤做双 tab 回归，确认修复后真实速率 | R-25 / async-bounds |
| P-06 | P2 | 交互延迟 | `src/ui/workbench-view.js` | 切视图 chart↔transfer **0.7–4.5ms**、chart↔extension **0.6–11.1ms**；展开目标选择器 **0.1–0.2ms**；切平台 **4.4–27.3ms**；滚动长列表 **1ms** | ≤100ms | 全部达标（最大 27.3ms） | — | 无需修复；口径见附录 B | R-25 |
| P-07 | P2 | 高频回调合帧 | `workbench-view.js:6941-6958`；`export-queue.js:631,640`；`lan-transfer-panel.js:422-428` | 进度 `setProgress` 用单飞 `progressRaf`（6941-6958）；导出队列 rAF 合帧；**LAN 进度用 120ms 时间节流（≈8Hz），非 rAF** | 高频进度回调必须 rAF 合帧 | LAN 用时间节流而非 rAF | 吞吐修复采用时间节流降频 | 120ms 节流已把频率降到 8Hz，实质避免重绘风暴；如需严格符合 R-21 字面，可让 LAN 进度复用 `progressRaf` 单飞队列 | R-21 |
| P-08 | P2 | Worker 生命周期 | `src/core/worker-client.js:29-43,55,141,208-224` | `finishAborted()` 内 `worker.terminate()` 后显式 `workerInstance = null`（212-215）；降级条件 `!supportsWebWorker() \|\| typeof source === 'string'`（55/141）；`isOfflineBuild()` 显式关 Worker（29-35） | terminate 后引用置 null | 达标 | — | 无需修复 | R-21 / MR-8 |
| P-09 | P2 | 大包 / 长列表渲染 | `src/core/demo-tree.js`；`workbench-view.js` | 教程模式：**1,299 DOM 元素 / 159,954 字符 HTML / 90 行 / 61 SVG / 11 树节点**；最长滚动容器 `.view-body` scrollHeight 1625 / clientHeight 366，滚动反馈 **1ms**；**帧率未测**（本环境 rAF 不回调） | 不卡顿、可读数真实 | 规模可控；帧率缺测 | — | 真实 GB 级包渲染与帧率需在可见桌面窗口补测 | R-25 |
| P-10 | P2 | 构建体积 / 首屏请求 | `dist/` | 15 文件 / **3,057,364 B（2,985.7 KB）**；最大 `index-Bj65FLUi.js` 1024.80KB、`sql-wasm-inline` 937.50KB、`jsqr` 250.90KB、CSS 240.30KB、`converter-worker` 212.80KB、字体 3 个共 约 292KB；生产首屏 **4 请求**（html+js+css+notice） | 交互 ≤100ms；首屏即时 | 主 bundle >1MB | sql-wasm 内联占 937.5KB | 评估 sql-wasm 按需加载；目前未超预算，仅提示 | MR-25 |

---

## 三、逐项测量记录

### 1. 首屏（任务 1）

方法：`tabs.open` → `trace.start` → `navigate` → `trace.stop` → `trace.analyze`，并在页面内读 `performance.getEntriesByType('navigation'|'resource')`。

原始数据：
- navigation：`responseStart 69.1 / responseEnd 76.4 / domInteractive 248.5 / domContentLoadedEventEnd 2805.5 / loadEventEnd 2854.4 / duration 2854.4`（ms）。
- resource：**113 条，其中 script 109 条**（dev ESM 特征）。
- trace（3009ms，incomplete=false，记录 5637 事件）：`longTasks=1`，`longTaskBlocking=149.168ms`；`Layout` 17 次 total 112.4ms / max **50.832ms**；`v8.evaluateModule` 2 次 max **192.813ms**；`RunTask` max 199.168ms。
- DOM：`#app` 5 个子节点、innerHTML 75,104 字符；`readyState=complete`；控制台 error **0**。
- 教程浮层：`autoTutorial` 默认 **true**（`settings-panel.js:18`），首次由 `index.js:2489` 的首帧 `requestAnimationFrame(() => view.openTutorial())` 弹出。**代码层面属“首帧即时”**，符合规则；但本测量环境 rAF 不回调（见附录 B），`firstOpenMs` 无法用 MutationObserver 取到，记为**环境限制未测**，不据此判失败。

### 2. 交互延迟（任务 2）

方法：页面内点击 → `MutationObserver` 观测 `#app` 的 childList/subtree/attributes/characterData 首次变更时刻（`domMs`），并以 `setTimeout` 兜底。每个样本上限 800ms。

原始数据：
- chart↔transfer（6 样本）：`0.7, 1.2, 4.4, 1.2, 4.5, 1.2` ms。
- chart↔extension（6 样本）：`3.9, 11.1, 0.9, 5.0, 0.6, 4.2` ms。
- 展开目标选择器（3 样本）：`0.2, 0.2, 0.1` ms。
- 切平台 pick-Luker / pick-ST：`7.0, 4.4, 4.7` / `4.4, 27.3` ms。
- 滚动长列表：`.view-body` 滚动 300px 后强制布局 **1ms**。

结论：全部 <100ms，最大 27.3ms。**口径限制**：本环境 `requestAnimationFrame` 不回调，无法测“首帧可见更新”；用 DOM mutation 时刻作代理，与规范口径不完全一致（详见附录 B）。

### 3. 长任务（任务 3）

方法：`trace.start` → 20 次切视图 + 教程 open/skip → `trace.stop` → `trace.analyze`；再 `cpu.start` → 教程 open/skip → `cpu.stop` → `cpu.analyze` 定位热点。

原始数据：
- 交互 trace（1318.9ms，incomplete=false，2385 事件）：`longTasks=1`，`longTaskBlocking=111.613ms`；`RunTask` max **161.613ms**、`TimerFire` max 161.577ms、`EventDispatch` max 158.506ms、`FunctionCall` max 158.212ms、`Layout` 38 次 total 147.84ms / max 43.21ms；`MajorGC` 4.207ms。
- CPU profile（862.6ms）：`(idle) 747.8ms`、`showModal` **61.727ms**、`(program) 23.0ms`、`db.js onupgradeneeded 3.0ms`、`renderTargetPicker 1.2ms`。
- 归因：长任务落在教程 open/skip 序列，`showModal`（`workbench-view.js:6308-6321`）的 innerHTML 重建 + 同步 showModal 为主要 JS 热点。

### 4. 内存（任务 4）

方法：`heap.snapshot` A → 10 次切视图 + 3 次教程进出 → `heap.snapshot` B → `heap.compare`；再 `heap.snapshot` C0 → 10 次纯教程进出 → C1 → compare。

原始数据：
- A/B selfBytes **38,187,583 → 39,227,611**（+1,040,028 B）；nodes 132,200→147,539（+15,339）；edges 495,350→544,692。
- A/B 增长 top：`system/InstructionStream` +78,848B、`PhysicalBoxFragment` +42,960B、`ComputedStyle` +42,840B、`LayoutBlockFlow` +37,464B、`LayoutResult` +36,320B、`Object` +33,868B、`CSSAnimation` +15,600B、`KeyframeEffect` +12,480B。
- 纯教程 10 次（C0/C1 压缩 2,600,799→2,617,670 B）：`InstructionStream` +86,016B、`V8FrameCallback` +5、`V8FrameRequestCallback` +5、`settle` +5；Blink DOM 类无显著增长。

解读：**混合操作的 +1.04MB 主要来自切视图**（Blink 布局对象），教程本身基本干净但有 rAF 回调残留迹象。因未强制 GC，A/B 差异含未回收临时对象，**不能据此断言泄漏**，需强制 GC 后复测。

### 5. Worker 生命周期（任务 5）

读 `src/core/worker-client.js` 全文（290 行）：
- `finishAborted()`（208-224）：`try { worker.terminate(); } catch {}` 后 `workerInstance = null`（212-215），注释明确“terminate 后该实例不可再用；置空让下一次任务重建，否则永久挂起”——**符合 R-21 / MR-8**。
- 主线程降级：`runPlanTask`（55）与 `runConversionTask`（141）在 `!supportsWebWorker() || typeof source === 'string'` 时直接调用 `generatePlan` / `convert`，传 `io: zipIo`。
- 离线产物：`isOfflineBuild()`（29-31）检测 `globalThis.__ST_ZIP_OFFLINE__`，显式关闭 Worker 路径（避免 file:// 下 CORS / 无 import.meta）。
- 有界等待：暂停收尾 `PAUSE_FINALIZE_TIMEOUT_MS = 30000`（16），超时回落“硬终止 + 无半成品”。

结论：**合规，无需修复**。

### 6. 高频回调 rAF 合帧（任务 6）

静态定位到的 DOM 直写 / 合帧点：
- `workbench-view.js:6941-6958`：`pendingProgress` + `progressRaf` 单飞 rAF，`setProgress` 多次调用只保留最后一次 apply——**合规**。
- `workbench-view.js:7109-7112`：拖拽模态 rAF 合帧；`7758`：`tutorialRaf`；`6825`：双 rAF settle。
- `export-queue.js:631,640`：注释明确“与 view.js 进度条 rAF 合帧同款策略，避免每条产物一次全量重绘”。
- `qr.js:99-129`：二维码扫描 tick 用 rAF 并 `cancelAnimationFrame`。
- `lan-transfer-panel.js:422-428`：LAN 进度用 **120ms 时间节流**（非 rAF）；这是 2026-11-17 吞吐修复的一部分，频率降至 8Hz，实质避免重绘风暴。

结论：主进度路径 rAF 单飞合规；LAN 用时间节流而非 rAF，属设计取舍，建议如追求 R-21 字面一致性则复用 `progressRaf`。

### 7. 局域网吞吐（任务 7，重点）

代码路径（静态，已核）：
- 协议：WebRTC DataChannel + 一次性取件码（`lan-transfer-panel.js:10`）。
- 分片：`CHUNK_SIZE = 64 * 1024`（`lan-transfer.js:29`）；`HIGH_WATER_MARK = CHUNK_SIZE*64 = 4MB`、`LOW_WATER_MARK = CHUNK_SIZE*16`（`lan-transfer-panel.js:40-41`）做背压（412-415 行 `bufferedamountlow` 有界等待）。
- 速率：`rateOf()` 用 3 秒滑动窗口（254-263 行），与 UI 刷新解耦。
- 修复证据：`lan-transfer-panel.js:36-39` 注释原文记录——每块 `setSend/setRecv` 触发 `renderLan()` 全量重绘，1GB 包约 16384 次重绘，**实测仅 约 300KB/s**；2026-11-17 改为 `UI_THROTTLE_MS=120`（39 行），发送端 424-428 行按节流窗口刷新，终态强制刷新。

浏览器实测尝试与限制：
- 在页面上下文 `import('/src/core/lan-transfer.js')` 得到 `CHUNK_SIZE=65536`，尝试同页双 `RTCPeerConnection` + DataChannel 发送 8MB 数据。结果 `dcState="connecting"`，5s 内未 open，ICE 候选在测量环境无法完成握手，**端到端速率未能测得**（环境限制，非代码缺陷）。
- 合成重绘实验：在页面内构造 24 行 DOM 的 `innerHTML` 全量重建 + 强制布局，60 次平均 **0.673ms/次**。该简化 DOM 远轻于真实 `renderLan()`，**不能用于反推真实吞吐**；仅证明“每块全量重绘会线性累积成显著阻塞”。
- 结论：用户举例的 **约 300KB/s 确为修复前真实历史值**（代码注释明确记载），且已通过 120ms 节流修复；**修复后真实速率未测，不能声称达标**，需按第四节 C复测。

### 8. 大包 / 长列表（任务 8）

- 教程数据由 `demo-tree.js` 的扁平清单交给真实 `buildChartTree()` 生成（符合 2026-11-17 用户裁定：禁止手写分组树）。教程模式实测 DOM 规模：1,299 元素 / 159,954 字符 / 90 行 / 61 SVG / 11 树节点。
- 最长滚动容器 `.view-body`：scrollHeight 1625 / clientHeight 366，滚动 300px 反馈 1ms。
- **帧率未测**：本环境 `requestAnimationFrame` 不回调，无法取得 rAF 帧间隔；需在可见桌面窗口补测。
- 真实 GB 级包渲染上限未测（未构造大包，避免高内存测试违反 R-24）。

### 9. 构建体积（任务 9）

- `dist/` 共 **15 文件 / 3,057,364 B（2,985.7 KB）**；源码 `src/` 129 文件 / 3,593.5 KB。
- 最大产物：`index-Bj65FLUi.js` 1024.80KB、`sql-wasm-inline-Bu2UiMUi.js` 937.50KB、`jsqr-B14VOGw5.js` 250.90KB、`index-FtN3xL-i.css` 240.30KB、`converter-worker-CFyovAa1.js` 212.80KB、FontAwesome woff2 三个共 约 292KB。
- 生产首屏请求：`index.html` + `index-Bj65FLUi.js` + `index-FtN3xL-i.css` + `file-protocol-notice.js` = **4 个**（字体 / jsqr / worker 按需）。`index.html` 仅骨架 + `#app`，符合单一模板源。

---

## 四、可复现步骤

### A. 首屏 / 交互 / 长任务（已执行）
1. 开 tab 到 `http://localhost:3040/`。
2. `trace.start({durationMs:10000})` → `navigate` → `trace.stop` → `trace.analyze({fileID})`；页面内读 `performance.getEntriesByType('navigation'|'resource')`。
3. 交互：`evaluate` 内点击控件，`MutationObserver` 观测 `#app` 变更时刻（见附录 A 口径）。
4. 长任务：`trace.start` → 连续切视图 10 轮 + 教程 open/skip → `trace.stop` / `analyze`；`cpu.start` → 教程 open/skip → `cpu.stop` / `analyze`。

### B. 内存（已执行）
`heap.snapshot` → 10×切视图 + 3×教程进出 → `heap.snapshot` → `heap.compare`；再做纯教程 10 次进出专项对比。**复测时应先强制 GC** 以排除临时对象干扰。

### C. 局域网吞吐（**待执行，本环境受阻**）
1. 两台设备（或同机两浏览器实例）打开插件，处于同一网络。
2. 导入区勾选一个已知大小的包（建议 ≥100MB，便于稳态读数）。
3. 发送端点「生成取件码」显示二维码；接收端扫码 / 粘贴取件码 → 生成应答码；发送端粘贴应答码 → 「开始传输」。
4. 传输中读取 UI 速率（`formatRate(rate)`，3 秒滑动窗口）与浏览器 DevTools Network / `chrome://webrtc-internals` 的 DataChannel 吞吐量。
5. 记录：包大小、稳态速率（KB/s 与 MB/s）、峰值 / 谷值、CPU 占用；与历史 约 300KB/s 对比。
6. 本子代理环境同页双端 ICE 握手失败，无法完成第 3–5 步；该项为**明确未测**。

---

## 五、限制与未测项（不估算、不编造）

1. **rAF 在本测量环境不回调**：所有依赖 `requestAnimationFrame` 的“首帧可见更新”与帧率指标无法取得；交互延迟改用 DOM mutation 时刻代理，教程首次弹出改由代码审查确认（首帧 rAF）。
2. **端到端局域网速率未测**：同页 WebRTC 握手失败；不把代码注释中的 300KB/s 当作修复后实测值。
3. **生产构建首屏未测**：本次只测 dev（3040，109 ESM 模块）；生产单 bundle 首屏需另测（仍用 3040 端口的 preview，禁第二端口）。
4. **内存 A/B 未强制 GC**：差异含未回收临时对象，不足以证明泄漏；P-03 为“待确认”而非“已确认泄漏”。
5. **真实大包渲染 / 帧率未测**：遵循 R-24 禁高内存 / 大规模测试，未构造 GB 级包。
6. **首屏 FCP/LCP/INP/CLS**：trace 分析器不计算这些指标（insights 明示），故未列。

---

## 附录 A：测量方法与口径

- 交互反馈：`domMs = t(MutationObserver 首次观测到 #app 变更) - t(click)`。`frameMs`（双 rAF）在本环境全部落到 800ms 兜底，故不采用。
- 首屏：PerformanceNavigationTiming 各阶段 `performance.now()` 绝对时刻；trace 为 renderer 进程记录，事件时长不可简单相加（trace insights 明示）。
- 内存：`heap.compare` 的 `bytesDelta` 为 **shallow bytes** 差值，正值表示增长，**不等于泄漏证明**（工具自述）。
- CPU profile：`selfMs` 为采样值，仅用于相对归因，不等同精确耗时。

## 附录 B：原始数值集中索引

| 指标 | 原始值 |
| --- | --- |
| 首屏 nav(ms) | 69.1 / 76.4 / 248.5 / 2805.5 / 2854.4 / 2854.4 |
| 首屏资源 | 113（script 109） |
| 首屏 trace | longTasks 1 / blocking 149.168ms / Layout max 50.832ms / evaluateModule max 192.813ms |
| 交互(ms) | 切视图 0.6–11.1；选择器 0.1–0.2；切平台 4.4–27.3；滚动 1 |
| 交互 trace | longTasks 1 / blocking 111.613ms / RunTask max 161.613ms |
| CPU 热点(self ms) | showModal 61.727 / program 23.047 / db 3.042 |
| 内存 A/B(B) | 38,187,583 → 39,227,611（+1,040,028）；节点 +15,339 |
| 教程 10 次(B) | 2,600,799 → 2,617,670；V8FrameCallback +5 |
| LAN | CHUNK_SIZE 65536；HIGH_WATER 4MB；UI_THROTTLE 120ms；历史 约 300KB/s（已修） |
| 教程 DOM | 1,299 元素 / 159,954 字符 / 90 行 / 61 SVG / 11 树节点 |
| dist | 15 文件 / 3,057,364 B；首屏 4 请求 |

> 报告结束。审计员：性能审计子代理；日期 2026-11-17。
