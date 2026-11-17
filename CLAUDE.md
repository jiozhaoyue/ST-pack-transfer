# CLAUDE.md

<!-- RULES-POINTER v1 -->
本仓工程规则唯一真源：`RULES.md`（30 条）+ `RULES-DETAILS.md`（82 条细则）。动手前先读；收尾前跑 `npm run verify:rules`。
本文件不得复制 RULES.md 条文；冲突一律以 RULES.md 为准。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

四酒馆（SillyTavern / Luker / TauriTavern / PureTavern）数据包互转工作站。**纯前端为主、Authority 服务端为可选增强层**——核心功能在纯浏览器环境完整闭环，Authority 可用时自动增强（产物持久化/断点托管），不可用时静默降级，绝不阻塞主路径。

## 常用命令

```bash
npm test                          # Vitest 全量（当前 934 passed / 2 skipped / 95 文件）
npx vitest run test/xxx.test.js   # 单文件
npx vitest run -t "用例名"         # 单条用例
npm run dev                       # 开发热重载（仅开发；**UI 验收不用它**），本地端口 3040
npm run build && npm run preview  # UI 验收：本地静态服务器托管 dist（同一端口 3040）
npm run build                     # vite build --base=./（产出 GitHub Pages 静态站点）
npm run e2e                       # 实例侧 E2E（需要 Dev 实例在跑；只许连 Dev，见 e2e/lib/guard.cjs）
npm run e2e:web                   # 独立 Web / 云子路径形态 E2E（**不需要实例**；自己起静态服务器）
npm run e2e:web -- --rebuild      # 同上，强制重建 dist（mtime 判据看不见"删了源码文件"）
npm run check:css-scope           # CSS 双前缀铁律守卫（PostCSS AST）
npm run check:dom-injection       # DOM 注入守卫（innerHTML 未转义插值）
npm run check:template-source     # 单一模板源守卫（index.html 只许骨架）
npm run check:dom-scope           # 宿主 DOM 写入作用域守卫（锚点白名单）
npm run check:control-consumer    # 控件消费点守卫（拦"死控件"）
npm run gen-fixtures              # 重新生成测试固件 fixtures/
```

无独立 lint/typecheck 命令——类型契约靠 JSDoc + 运行时目标守卫，质量门槛就是 `npm test` 全绿。

**UI 验收只走** `npm run build && npm run preview`（本地静态服务器 3040，与 dev 共用唯一端口）；禁止 `file://` 或 `npm run dev` 作为验收入口（2026-11-09 用户裁定）。按用户禁令，不得跑全量/大内存测试，只跑目标小测试。

**改端口**：只改 `vite.config.js` 的 `LOCAL_PORT`（默认 `3040`），或启动时设置环境变量 `PORT`；dev / preview / 本地静态服务共用这一处，不另开第二端口。

## 高层架构（跨文件才能看懂的部分）

### 三形态入口，同构核心

同一份 `src/core/` 代码跑在三种环境，入口分别是：

1. **独立 Web**：`index.html` 仅为空骨架（`#app.app-container`），`bootstrap()` 检测到 `#app` 为空时注入 `getWorkbenchHtml()`（**已无参数**）——与插件态共用同一模板函数。
2. **酒馆扩展插件**：`index.js` 检测宿主后向扩展列表注入行按钮，点击经 `openConverterModal()` 打开 `#st-converter-modal-overlay` 全屏模态（与独立态同一份模板）；并按宿主向原生备份 UI 注入入口按钮。抽屉注入（`mountSettingsDrawer`）已于 2026-10-15 删除。
3. **Node/Vitest**：`worker-client.js` 检测无 `Worker` 时自动主线程降级，转换逻辑零改动可测。

### 分层边界（硬性）

- `src/core/` — 纯逻辑，**禁止 DOM 依赖**。`transform.js`（911 行，convert 主入口）、`plan-preview.js`、`delta.js`、`splitter.js`、`zip-io.js`（vendor zip.js 封装）、`pt-archive.js`（PT 原生归档 → hub 重建，`D-23`）、`pack-inject.js`（聊天库注入判定，纯决策）、`zip-augment.js`（源包增强，纯 IO）、`asset-list.js`（官方资产列表）、`transfer-plan.js`（分片台账）、`webdav-client.js`、`transfer-target.js`、`host-capabilities.js`。
- `src/app/` — 应用层（只被根 `index.js` 使用）。`task-runtime.js`（半成品持久化 / 断点节流 / 批量续传判定）、`conversion-runner.js`（转换接线：`TaskManager` + 暂停 / 继续 / 中止 / 真增量续传）、`transfer-runner.js`（分片上传/下载/断点）、`pull-entry.js`（从宿主拉取的顺序编排）。
- `src/ui/` — 可 DOM。`workbench-template.js` 是 HTML 模板唯一来源，`host-bridge.js`（1202 行）负责宿主嗅探/CSRF/拉取/恢复/注入；`chat-store-bridge.js` 是**与外部聊天库打交道的唯一落点**（特性检测 + 有界等待 + 静默降级），`chat-store-inject.js` 负责三个方向的编排（打包并入 / 从库导出 / 还原后入库）。
- `src/storage/` — `db.js`（IndexedDB，DB_VERSION 2，files store 带 `origin` 字段区分 upload/host-export/converted/delta/split-part）、`authority-store.js`（可选后端适配器）。
- `public/` — Vite 的 publicDir（构建时摊平到 `dist/` 根）。当前只有 `file-protocol-notice.js`：`file://` 双击时给一句说明（模块脚本在 `file://` 下必被 CORS 拒，不提示就只剩白屏）。
- `index.js` — 根控制器，串起 detectHost → 视图装配 → `conversionRunner`（暂停 / 续传）→ 产物落地。
- `src/vendor/` — zip.js / fzstd / fontawesome 本地副本，**勿升级改动**，只用其已有 API。

### 关键机制（需读多文件才懂）

**平台代码双轨制**：宿主检测返回 `st|luker|standalone`（平台码），转换器只认 `st|l|tt|pt`（布局码）。凡把宿主平台传给 `convert()` / 文件名模板，必须经 `host-bridge.js` 的 `hostLayoutCode()` 归一（`luker→l`）。`/api/users/backup` 等端点调用则用平台码（ST 不支持 selection、Luker 支持）。

**Worker 并发管线**：`worker-client.js` 把 plan/convert 任务投给 `converter-worker.js`；pause/abort 先 `worker.terminate()` 再重建（见 `034b7ab` 修复——terminate 后必须重置 `workerInstance`）。Node 环境整个 Worker 路径降级为主线程同步执行。

**TaskManager 断点续传**：`task-manager.js` 是纯状态机（running/paused/aborted/done/failed），副作用经 adapter 注入（OPFS checkpoint 或 Authority KV）。`transform.js` 的 `options.signal`/`resumeCrcMap`/`onEntryDone` 三参数与其对接——crc 命中即跳过并计 `resumedCount`。

**Authority 适配器降级链**：`authority-store.js` 探测 `window.STAuthority.AuthoritySDK`，不可用时所有接口返回 `null/false`，调用方无需分支。`createCheckpointAdapter()` 实现与 TaskManager 持久化 adapter 相同的 `{save,load,remove}` 接缝。blob 按 4MB 分块落盘 + KV 存清单。

**宿主 UI 注入**：`host-bridge.js` 用共享 `watchHostDom` MutationObserver（200ms 去抖）统一四个注入点（扩展抽屉/菜单/账号弹层/管理面板行/Luker 备份管理器），幂等 + `dataset.stZipInjected` 防重，宿主重渲染自动自愈。注入元素复用宿主原生类（`menu_button` 等），零新增 CSS。

### 产物统一出口

所有转换/宿主拉取产物进待导出区（`export-queue.js`），**不自动下载**；临时条目在下载/存工作区时才入 IndexedDB。ExportQueue 渲染走 rAF 合帧防批量转换时整表高频重建。

## 踩过的坑（违反即返工）

1. **CSS 作用域铁律**：`style.css` 所有规则必须挂在 `#app.app-container`（独立态与模态态统一根）或自有覆盖层 id（`#st-converter-modal-overlay` / `#wb-detail-overlay`）之下；`.st-converter-drawer-app` 已随抽屉注入删除（2026-10-15），出现即为陈旧描述。裸选择器（`.menu_button`/`.inline-drawer` 等酒馆全站类）会污染宿主全站 UI——2026-09 实测发生并修复，严禁回归。配色一律继承宿主 `--SmartTheme*` 变量 + `var(..., 回退值)`，禁止硬编码金色系。
2. **严禁写本地酒馆实例目录**；实例更新只走 Git（`git clone`/`git pull`/原生扩展安装器）。
3. **计划先行**：Trellis 任务 PRD 未回填不得提交代码；`implement.md` 复选框随执行实时勾选。
4. **完成即推送**：测试绿后 `git push` 到 origin，不得只提交不推送。
5. **子代理只准用自身能力 + 并行不阻塞**：只调用本 agent 平台自带的子代理功能（Copilot 即 `runSubagent`）；**禁止调用其他 agent**（`trellis channel spawn` 的 claude/codex worker、pebrel delegate、外部 CLI agent 等）。多个子代理必须**一次性并发派发**，主代理同一轮内并行推进自身工作，不串行、不空等、不轮询。
6. **✅ 暂停 → 续传后产物缺条目（2026-09-28 **已修**）**：`transform.js` 的 `onProgress` 在**投递给 writer 之前**上报 ⇒ 断点清单记的是「已读到」而非「已写入」；暂停走 `worker.terminate()` 丢掉半成品；续传按 crc **跳过**而目标 zip 是**新建空包** ⇒ 被跳过的条目**旧产物没有（已丢）、新产物也没有（被跳过）**，用户拿到**残缺包**却看到"转换成功"（实测 1500 条聊天 → 1437 条）。
   **既有测试为何没抓到**：单测 `test/convert-resume.test.js` 锁的是**机理**（`not.toContain`）、实例矩阵只断言「日志出现跳过 N 项」——没有一条问过**产物完不完整**。
   **现修法（真增量续传）**：跳过门改为「**半成品里真有它的字节**」（`transform.js` 的 `appendedNames`）；暂停改**协作式收尾**（worker `close()` 成合法 zip → 主线程落 OPFS → `setPauseCheckpoint`）；续传用 zip.js `appendZip` **原样搬运**（字节级、零重压缩）再继续写。降级链（无 OPFS/配额/收尾失败/不同源）一律回到「完整重做」且**必须留日志**。
   取证与全部读数：`.trellis/spec/frontend/state-management.md` §8、`.trellis/spec/guides/standalone-web-and-cloud-e2e.md` §4.6、E2E `npm run e2e:web -- --only pause-resume`（判据：**跳过 N > 0 且 源 == 产物**，缺一不算真增量）。
7. **`#file-input` 只在「尚无源包」时采纳新文件**：同一页面里再喂一个包**不会**换源包（只入库）。E2E 里"量第二个包"必须**另开上下文**，否则量到的是第一个包（2026-09-28 实测把 66 MB 用例量成了 12 MB 包的耗时，读数"308 MB/s"一眼假）。
8. **改 `base` 要改构建脚本，不是 vite.config**：`npm run build` 是 `vite build --base=./`，**CLI 标志覆盖**配置里的 `base` —— 只改 `vite.config.js` 对产物毫无影响（实测过一次"无效实验"）。
9. **运行器的 `dist` 新鲜度判据只看 mtime**：**看不见「删了源码文件」** ⇒ 凡涉及删/换文件的实验必须 `npm run e2e:web -- --rebuild`。
10. **`[hidden]` 压不过同特异度的 `display`（2026-10-14 实测事故）**：`style.css` 给 `.wb-gate` 写了 `display:flex`，与插件内全局兜底 `#app.app-container [hidden]` **特异度相同**，源码顺序决定胜负 ⇒ 空壳框永远可见；而 `showGate()` 全仓无调用点 ⇒ 从不触发、永远显示、内容为空。**默认隐藏的容器若被写了 `display`，必须另写一条特异度更高的 `[hidden]` 覆盖规则**。同类：空容器占位（`#category-summary-badge` 空时是个空胶囊，用 `:empty{display:none}` 治）。
11. **两个 UI 守卫按「文件源码正则」提取控件与文案** ⇒ **注释里不得出现控件标签字面量**（会被当成无 id 控件误报）；要断言**渲染结果**必须调用 `getWorkbenchHtml()`，读文件源码会把注释一并算进来（本轮「文案纪律」断言全误报过一次）。守卫只强制「声明存在」，**不验证声明为真**——死控件能通过。
12. **宿主原生入口禁止同构假设，调研必须先读宿主 `docs/**`（2026-11-04 事故）**：
    - **TT 没有** `#account_button` / `.userBackupButton`；原生导出在扩展列表的「Data Migration」→ `#data_migration_export_button`。
    - **PT 有**一方扩展「PureTavern 数据管理」→ `#pure-tavern-data-management-entry` → `dialog#pure-tavern-data-management-dialog` → `#ptdm-export`；且 PT **没有** `/api/users/backup`，它走 `POST /api/backups/archive/export`（`{moduleIds, includeSecrets}`）。
    - 曾凭「TT 是 ST 派生」+ 一次 grep 就断言 TT/PT「无原生入口」，被用户当面否决。
    - 调研顺序：宿主 `docs/**`（含子目录）→ 一方扩展的 `manifest.json` / `settings.html` → 运行实例 DOM 取证；**禁止**用 grep 源码代替调研。
    - 注意 TT 的 `docs/API/Migration.md` 是**「从 SillyTavern 扩展适配到 TauriTavern」指南**，不是数据迁移文档。
    - 事实表见 `.trellis/spec/frontend/host-capabilities.md` 末节。

## Trellis 任务流

本项目用 Trellis 管理任务。当前任务 `python ./.trellis/scripts/task.py current`；工作流 `.trellis/workflow.md`；分层规范 `.trellis/spec/backend/`（core）与 `.trellis/spec/frontend/`（ui）。更全的项目规则与统一开发规则见 [AGENTS.md](./AGENTS.md)。

<!-- TAVERN-RULES:START v2.0.0 -->
<!-- 本块由 tavern-harness/scripts/sync_tavern_rules.py 自动生成，请勿手动编辑 -->
<!-- 真源: tavern-harness · rules/ · 仓群 my-repo · v2.0.0 -->
<!-- 同步时间: 2026-11-17T20:37:52+08:00 -->
<!-- 内容哈希: sha256:656aef9279cd798a（仅覆盖规则正文，不含本头部与「项目覆盖」节） -->
<!-- 覆盖声明: 本仓如需覆盖某条规则，请在文末「项目覆盖」节声明并说明理由 -->

# 统一开发规则（v2.0.0）

> 由 `tavern-harness` 真源仓同步生成，请勿手动编辑。
> 适用仓群：**My-repo 仓群（酒馆扩展 / 工具插件）**。

# 统一开发规则 · 精简核心

> 本块由 `tavern-harness` 同步生成，请勿手改。**一行一条**，只保留可判定判据。
> 全文与案例不在此处：真源仓 `tavern-harness` 的 `rules/L0-global.md`、`rules/groups/*.md`、`rules/frontend-ui.md`、`rules/pitfalls.md`。
> 分级：**MUST** 违反即不通过；**SHOULD** 需说明理由。

## A. 边界与安全

- **L0-1 实例边界（MUST）**：宿主实例运行时数据可读写；被 git 跟踪的宿主源码严禁改动；指向工作区仓的 symlink/junction 严禁写穿。实例更新只走 git 或宿主原生安装器。
- **L0-6 高风险先问（MUST）**：删除/覆盖文件、装依赖、大重构、对外可见写操作（推送/PR/评论）必须先获用户授权。
- **L0-7 Git 纪律（MUST）**：`git add <显式路径>`，禁 `-A`/`-u`/`.`；提交前暂存区必须恰等于本次清单；完成即推 `origin`，禁推 `upstream`。
- **MR-14 零泄露（MUST）**：无本地绝对路径、无凭据、无真实聊天数据；凭据只存本机浏览器。

## B. 流程

- **L0-2 计划先行（MUST）**：多项改动先落计划文件，验收标准不得 `TBD`；执行中实时勾选。
- **L0-3 检索先行（MUST）**：实现前先查现成方案；WebSearch + GitHub API 两路都试过才算。
- **L0-4 变更可审（MUST）**：比较用 diff；改文件用块级 Edit，禁整文件覆盖；禁 shell 重定向写源码。
- **L0-5 决策用问答（MUST）**：需用户决策必须用交互问答工具并聚合多问；禁正文提问后结束回合。
- **L0-14 文档先行（SHOULD）**：改前先读 spec/开发文档；文档不足先补文档。
- **L0-17 交付落点（MUST）**：规范进 spec 目录；被 `.gitignore` 忽略的目录不算交付。

## C. 并发

- **L0-8 子代理（MUST）**：模型由用户指定；一次性并发派发、主代理并行推进、不空等不轮询；任务自包含；子代理与主代理不得写同一文件。

## D. 宿主适配

- **L0-9 桥接层隔离（MUST）**：宿主差异只进单一 host-bridge 模块，不散落业务层。
- **L0-10 CSS 作用域（MUST）**：禁 `*`/`body`/`:root`/裸宿主类；每条规则带本扩展前缀；配色只用宿主变量并给回退值。
- **L0-11 纯前端优先（MUST）**：主路径必须纯浏览器闭环；后端只作可选增强，走适配器 + 特性检测 + 静默降级。
- **L0-12 跨宿主禁 Host Bridge（MUST）**：跨宿主插件只用可移植子集，禁宿主补丁路径。
- **MR-2 事实源（MUST）**：用户资产存宿主服务端原生目录；浏览器存储只作可重建缓存。
- **MR-4 UI 落点（MUST）**：设置页只放设置；复杂交互用官方 Popup；消息旁内容挂官方 RENDERED 事件。不在官方文档的位置就是禁止的位置。
- **MR-5 API 事实（MUST）**：以官方文档为准，禁翻宿主源码找 API。

## E. 前端 UI（跨仓通用）

- **MR-15 滚动容器唯一（MUST）**：每视图只允许一个纵向滚动容器；`overflow-x` 一律 `hidden`，禁横向滚动条；`overflow: scroll` 禁用，只用 `auto`/`visible`；滚动条只准 `scrollbar-width: thin` 或 6px 自定义，禁系统粗条；手机全高用 `100dvh` 且保留 `100vh` 兜底。
- **MR-16 动态分格（MUST）**：图表区按数量自适应——1 个占满、2 个平分、3 个四宫格留空、宽屏最多 4 列；**禁止自由拖拽单卡宽高**，拖拽只允许调整既有分隔条比例；禁止压成单条并排。
- **MR-17 分隔条白名单（MUST）**：分隔条只允许在图表之间、图表与列表之间；类名必须登记；手机端禁拖拽手柄。
- **MR-18 美观优先（MUST）**：任何响应式都不得产生不美观结果；不为塞下而硬做，也不能显示不全。退让顺序：换行/堆叠 > 容器滚动 > 隐次要信息 > 纯图标（带 aria-label/title）。禁压扁控件、缩字号硬塞、裁功能性文案。
- **MR-19 无重复入口（MUST）**：同一动作只允许一个入口；同一页面出现两个同义按钮即为缺陷。
- **MR-20 全平台一致（MUST）**：web/手机/竖屏功能按钮必须全显示不压缩；读数在所有平台可见且同源；标签只用一种语言，禁「中文（English）」双写。
- **MR-21 全屏语义（MUST）**：全屏 = 占满插件 DOM 的另一个视图，不是浏览器全屏、不是就地内联展开。
- **MR-22 单一模板源（MUST）**：HTML 节点只有一个来源；同 UI 多副本必须在同一次提交内一并修改。

## F. 稳定性

- **MR-7 有界等待（MUST）**：任何 `await`（媒体事件、跨源 fetch、渲染 promise）必须能 settle，不得永久 pending。
- **MR-8 Worker 生命周期（MUST）**：`terminate()` 后必须把引用置 `null`。
- **MR-9 高频回调合帧（MUST）**：流式/高频进度驱动 DOM 必须 rAF 合帧。
- **MR-23 失败不静默（MUST）**：耗时操作必须有可见进度与明确结果，不得只剩空面板或暗遮罩；失败不得整体中断，必须保存进度、输出报告、让用户选择；不支持的能力如实说明，禁返假空清单。

## G. 工程与质量

- **L0-13 / MR-13 测试门（MUST）**：发版前测试全绿、零回归；端到端只对 Dev 实例；禁高内存/大规模测试。
- **MR-6 三形态同构（SHOULD）**：纯逻辑核心可跑独立 Web / 插件 / Node 测试三入口；核心层禁 DOM 依赖。
- **MR-11 依赖自包含（MUST）**：装完即用，不得要求用户跑构建；第三方库放 vendor 目录勿升级。
- **MR-12 宿主目录约定（MUST）**：Luker 用户扩展平铺，禁嵌套 `third-party`。
- **L0-15 中文（SHOULD）**：文档、注释、回复用中文；代码标识符与专有名词除外。
- **L0-16 端口段位（MUST）**：实例段独占；出厂默认端口禁用；本地服务统一端口；周边工具从约定段起号。
- **MR-24 禁硬编码（MUST）**：尺寸、超时、上限、URL、端口、平台名、颜色、文案一律走常量/配置/i18n。

## H. 性能

- **MR-25 性能预算（MUST）**：交互反馈 ≤ 100ms；本地部署从宿主拉取 ≤ 10s；任何操作不得慢于宿主原生；首屏与教程浮层必须即时。

## 展开与案例

- 全文细则：真源仓 `tavern-harness` 的 `rules/L0-global.md`、`rules/groups/*.md`、`rules/frontend-ui.md`。
- 事故案例：`rules/pitfalls.md`（P-1 ~ P-19），只在排查时读。
- 本仓特有约束写在本块末尾「项目覆盖」节，不得写进正文。

## 项目覆盖

<!-- TAVERN-RULES:END -->

## 项目细则补充（2026-11-05 追加，用户明令）

1. **文档先行 / 禁止直接读源码理解功能**（MUST）：任何功能理解先查
   `docs/DEVELOPER-GUIDE.md`、`.trellis/spec/`、`mini-trellis mem recall`。文档不足时**先补文档**，
   使「只读文档即可知道怎么改」；只有进入编辑阶段才允许读目标源码片段，读完把知识回流到文档。
2. **计划先落盘**（MUST）：多项改动先写 `docs/PLAN-2026-11-05.md`（目标 / 判据 / 改点 / 依赖 / 分工），
   执行中实时更新状态与证据，禁止凭记忆批量补记。
3. **规则注入门禁**（MUST）：`.claude/hooks/session-start.py` 每次会话启动注入 `## 铁律`；
   `user-prompt-submit.py` **每 5 条用户消息注入一次**；`search-gate.py` 作为 `PreToolUse`
   门禁，未完成 Web/GitHub 检索前拦截实现类写操作（`.trellis/`、`docs/`、`tasks/` 与只读放行，
   `TRELLIS_SEARCH_GATE=0` 紧急禁用）。规则只改 `iron-rules.md`，hook 只读文件。
4. **数据正确性优先**（MUST）：配额 / 体积 / 勾选读数必须同源、实时、可复核；读不到就如实显示
   「未提供」，禁止假 0、假缓存、假成功。
5. **布局铁律**（MUST）：控件与自身文字不得拆行；图表用自适应网格（宽屏最多 4 列），不得压成单条并排；
   每个图表 DOM 边相互贴着、可拖拽改高宽、不留空白；默认隐藏容器必须补高特异度 `[hidden]` 规则。
6. **只认上游宿主**（MUST）：Luker 只认原上游；任何 fork 仅开发版，不得把 fork 特有行为当产品事实。
7. **宿主设置只读**（MUST）：从宿主拉取只打开原生拉取位置并弹窗提示用户自己点「从宿主拉取」；
   禁止自动点注入按钮，禁止更改宿主任何勾选/设置记忆；默认不勾选仅在拉取后的插件侧生效。
8. **文档与 README 同步**（MUST，2026-11-11 用户明令）：每次功能更新 / 行为变更，必须在
   **同一次提交内**同步更新 `docs/DEVELOPER-GUIDE.md` 与 `README.md`；只改代码不改文档视为未完成。
   判据：`git diff` 中改动的 `src/` 文件必须在两份文档里有对应条目或读法更新。
9. **实例实测走 Playwright 无头后台**（MUST，2026-11-12 用户明令）：Dev 实例（尤其 Dev Luker）
   的界面实测一律用 Playwright 无头浏览器、后台运行；复用 `e2e/` 的库 API（全局解析，不新装包），
   不得弹出前台窗口、不占用前台浏览器面板。
10. **响应式美学**（MUST，2026-11-12 用户明令）：任何响应式不得出现不美观的响应；美观优先，
   不为塞下而硬做、不得显示不全。只允许「换行 / 堆叠 / 容器滚动 → 整块隐藏次要信息 →
   纯图标（带 aria-label/title）」；禁止压扁控件、缩小字号硬塞、`line-clamp` 裁掉功能性文案。
   判据：`.trellis/spec/frontend/responsive-and-aesthetics.md`。
