# Directory Structure (Trinity Web & Extension Architecture · 三形态同构)

> `ST-pack-transfer` 的目录组织：**同一份纯前端核心**跑在三种入口——独立 Web 页、ST/Luker 扩展插件、Node/Vitest 测试环境。

---

## Overview (概述)

项目采用**三形态同构**（"Trinity"），详见根 `CLAUDE.md`「三形态入口，同构核心」与 `AGENTS.md` L1-MR-6：

1. **ST / Luker 扩展插件**：`git clone` 进宿主的第三方扩展目录（Luker 用户私有扩展须**平铺**在 `data/<user>/extensions/<name>/`，见 `AGENTS.md` L1-MR-12）。宿主读 `manifest.json`（`js: index.js`、`css: style.css`）后以原生 ES 模块加载根 `index.js`；插件经扩展列表行按钮打开**全屏模态** `#st-converter-modal-overlay`（抽屉注入与 `mountSettingsDrawer()` 已于 2026-10-15 删除）。
2. **独立 Web 应用**：`npm run dev`（Vite 开发服务器，`http://127.0.0.1:3040`，`strictPort`）或 `npm run preview`（4173）。页面 `index.html` 是**空骨架**（仅 `<div class="app-container" id="app"></div>` + 末尾 `<script type="module" src="./index.js">`）。
3. **GitHub Pages 静态站点**：`npm run build`（=`vite build --base=./`）产出 `dist/`；`.github/workflows/deploy.yml` 在 push `main` 时自动部署（`vite.config.js` 中 `base: './'`、`worker.format: 'es'`）。

关键原则：

- **依赖自包含（装完即用）**：第三方库以本地封装副本形式放 `src/vendor/`（`zip.js`、`fzstd.js`），**勿升级、勿改动，只用其已有 API**；用户通过 Git URL 一键克隆安装后**不需要**跑 `npm install` / `npm run build`（`AGENTS.md` L1-MR-11）。
- **标准 ESM，无 IIFE 打包**：源码即原生 ES 模块，构建由 Vite 处理（含 module Worker）；**不存在** esbuild/IIFE 打包流程。
- **宿主自适应嗅探 + 原生 UI 注入**：`src/ui/host-bridge.js` 的 `detectHost()` 区分宿主/独立；宿主内除注入工作台抽屉外，还向宿主原生备份 UI 注入入口按钮（见 component-guidelines 的注入约定）。
- **可选后端静默降级**：`src/storage/authority-store.js` 探测 `window.STAuthority.AuthoritySDK`，不可用时所有接口返回 `null/false`，纯前端路径（IndexedDB / OPFS / 内存 Blob）保持全功能，主路径**不因后端缺失而阻塞**（`AGENTS.md` L0-11 / L1-MR-1）。

> **已不存在的形态（出现即为陈旧描述）**：`src/plugins/`、`dist/plugins/`、`npm run build:plugins`、IIFE 自包含包、`globalThis.__tavernConvert` 全局命名空间、`tavern-convert-` DOM 前缀、200 KiB 包体积预算、`yauzl` / `yazl` 依赖与 `src/io/**`、`cli.js`、`test/zipjs-io.test.js`、「58 项测试」。它们属于 09-04 之前的 CLI + IIFE 插件时代，已随统一工作台重构删除。

---

## Directory Layout (目录布局 · 2026-09-24 快照)

```
ST-pack-transfer/
├── index.html              # 独立 Web 入口：空骨架（<div class="app-container" id="app"></div>），末尾 <script type="module" src="./index.js">
├── index.js                # 根控制器：detectHost → 独立/插件（模态）UI 装配 → ExportQueue + TaskManager
├── style.css               # 全部样式；每条规则必须以 #app.app-container 或自有覆盖层 id 为作用域根
├── manifest.json           # ST / Luker 扩展清单（js: index.js、css: style.css、loading_order: 50）
├── vite.config.js          # base: './'、worker.format: 'es'
├── src/
│   ├── core/               # 纯逻辑层（禁止 DOM 依赖），三形态共用
│   │   ├── builtin-assets.js    # 酒馆原生默认资产指纹库（剔除系统自带背景/主题，避免重复携带几十 MB）
│   │   ├── converter-worker.js  # Web Worker 入口（module worker），包装 core 的 plan/convert
│   │   ├── delta.js             # 基准 ZIP 增量差量引擎（条目级比对 → 仅新增/修改的补丁包）
│   │   ├── detect.js            # 源布局识别（LAYOUTS: st | l | tt | pt-native | unknown）
│   │   ├── filename-template.js # 导出文件名占位符解析 + 跨系统非法字符净化
│   │   ├── inspect.js           # hub 路径 → 业务类目（CATEGORIES）+ 历史备份/快照识别
│   │   ├── logger.js            # 结构化日志单例（级别过滤 / 环形缓冲 / 事件订阅 / 文本导出）
│   │   ├── null-writer.js       # dry-run 用的空写器（同接口、不落盘、不持资源）
│   │   ├── plan-preview.js      # 完全扫描与动作预测（ACTIONS / ACTION_LABELS / SPECIAL_*）
│   │   ├── pt-archive.js        # PT 原生归档 → hub 重建（manifest 校验 / 模块语义逆映射）
│   │   ├── report.js            # 转换报告（每模块复制/丢弃/合成计数 + 警告清单）
│   │   ├── splitter.js          # 智能分包引擎（每个分卷都是独立合法 Zip，非 .z01 裸分片）
│   │   ├── task-manager.js      # 长任务纯状态机（running|paused|aborted|done|failed），持久化经 adapter 注入
│   │   ├── transform.js         # 转换主入口 convert()（TARGETS: st|l|tt|pt），hub 规范化 + 逐条目路由
│   │   ├── worker-client.js     # Worker 调度；无 window/Worker（Node/Vitest）自动主线程降级
│   │   └── zip-io.js            # 通用 zip IO 适配器（zip.js + fzstd，原生注册 Method 93 Zstandard）
│   ├── storage/
│   │   ├── db.js                # IndexedDB（DB_VERSION 2；files store 带 origin: upload/host-export/converted/delta/split-part）
│   │   └── authority-store.js   # Authority 可选适配器：探测 window.STAuthority.AuthoritySDK，不可用则全部返回 null/false
│   ├── vendor/             # 本地封装的第三方引擎副本（勿升级、勿改动，只用已有 API）
│   │   ├── fzstd.js            # 纯 JS Zstandard 解压（Method 93）
│   │   └── zip.js              # @zip.js/zip.js 自包含副本
│   └── ui/                 # DOM 层（仅此层可依赖 document / window）
│       ├── workbench-template.js  # HTML 模板唯一来源（getWorkbenchHtml 无参数，两态逐字相同）
│       ├── workbench-view.js      # 工作台视图渲染与交互（图表 / 选择树 / 配额 / 设置视图）
│       ├── host-bridge.js         # 宿主嗅探 / CSRF / 备份拉取 / 恢复 / 扩展安装器 / 原生 UI 注入 / OPFS
│       ├── export-queue.js        # 旧待导出区（当前无调用方，只剩单测）
│       ├── escape.js              # DOM 注入防线：escapeHtml / isSafeHttpUrl / trustedStaticMarkup
│       ├── lan-transfer-panel.js  # 局域网互传面板（WebRTC）
│       ├── settings-panel.js / settings-store.js  # 设置视图与持久化
│       ├── chat-store-bridge.js / chat-store-inject.js  # 外部聊天库唯一接缝与三向编排
│       ├── private-files-store.js # 云端私有件本地存储
│       ├── qr.js                  # 二维码（局域网配对，现役）
│       ├── host-icons.js / fetch-bounds.js  # 当前无调用方（宿主图标 / 有界读取兜底）
│       ├── workbench-session.js   # 当前无调用方（旧会话状态）
│       └── 其余（migration-* 等）以 `ls src/ui` 为准
├── scripts/
│   ├── css-scope.js        # CSS 作用域守卫（PostCSS AST 走查，允许 @media 内嵌）
│   ├── dom-injection-guard.js  # innerHTML/outerHTML/insertAdjacentHTML 未转义插值守卫
│   └── single-template-source.js  # 单一模板源守卫：index.html 只许骨架 + 模板须含 REQUIRED_TEMPLATE_IDS
├── test/                   # Vitest（本地专属不入库；`npm test` 全绿即质量门槛）
│   ├── advanced-controls.test.js
│   ├── authority-store.test.js
│   ├── backup-chats.test.js
│   ├── builtin-assets.test.js
│   ├── concurrent-writer.test.js
│   ├── convert-resume.test.js
│   ├── convert.test.js
│   ├── css-scope.test.js
│   ├── db-origin.test.js
│   ├── delta.test.js
│   ├── detect-host.test.js
│   ├── detect.test.js
│   ├── dom-injection-guard.test.js
│   ├── durable-mirror.test.js
│   ├── escape.test.js
│   ├── export-queue.test.js
│   ├── filename-template.test.js
│   ├── filter.test.js
│   ├── incremental-merge.test.js
│   ├── logger.test.js
│   ├── mirror.test.js
│   ├── plan.test.js
│   ├── plugin.test.js
│   ├── private-configs.test.js
│   ├── read-write.test.js
│   ├── real-samples.test.js
│   ├── roundtrip.test.js
│   ├── smart-compression.test.js
│   ├── splitter.test.js
│   ├── batch-convert.test.js
│   ├── task-manager.test.js
│   ├── unified-tree.test.js
│   ├── web-converter.test.js
│   └── zstd-method93.test.js
├── fixtures/gen.js         # 确定性测试固件生成（npm run gen-fixtures）
├── docs/                   # research/ 研究记录 + superpowers/{specs,plans} 设计与实施文档
├── .trellis/               # Trellis 任务系统（spec / tasks / workspace）
├── data-zip/               # 本地样本目录（.gitignore，严禁入库）
└── dist/                   # Vite 构建产物（.gitignore，用于 GitHub Pages）
```

> `test/` 清单是快照；**目录本身才是权威**（增删测试文件时无需回头改本文件，只需保持 `npm test` 全绿）。
> `test/` 与 `fixtures/` 是**本地专属目录，永不入库/永不上云**（铁律 21；判据 `git ls-files test e2e scripts fixtures` 恒为空）。
> 历史上的 `src/ui/archive-manager.js` 与 `src/ui/split-deliver-modal.js` 已于 2026-10-27 删除，
> 原「无调用点」自查结论随之失效。

---

## Single Template Source (单一模板源 · 2026-09-25 取代原「多入口同源同改」)

`index.html` 是**空骨架**（仅 `<div id="app" class="app-container"></div>` + 脚本入口）。
`src/ui/workbench-template.js` 的 `getWorkbenchHtml()`（**无参数**）是**唯一**的结构来源：
独立态由 `bootstrap()` 在 `#app` 为空时注入，插件态由 `ensureConverterModal()` 注入到
`#st-converter-modal-overlay > #app.app-container`。两态产物**逐字相同**。

- **结构改动只需改一处**（`workbench-template.js`）；原「两份副本同时改」的自查法已作废。
- 新增/删除业务节点须同步 `scripts/single-template-source.js` 的 `REQUIRED_TEMPLATE_IDS`，
  否则 `npm run check:template-source` 的校验面与两态一致性断言同时失效。
- 权威约定（单一模板源、机器断言、历史事故）写在
  [Component Guidelines](./component-guidelines.md) 的 **Single Template Source Mandate** 一节，**不要在此重复描述**。

> `AGENTS.md` / `CLAUDE.md` 的 L1-MR-10「多入口同源同改」是**仓群通用规则**（且属禁止手改的真源同步块）：
> 它描述的是「**若**存在两份副本」的情形。本仓自 2026-09-25 起已通过结构消除该前提，
> 故该条在本仓**不适用**——判据是本节，而非那条通用规则。

---

## Module Responsibilities (模块职责与交互边界)

### 1. 根 `index.js`（根控制器）
- `bootstrap()`：`document.getElementById('app')` 存在 → **独立 Web 模式**，直接复用 `index.html` 的空骨架，`#app` 为空时注入 `getWorkbenchHtml()` 后调 `main(app)`；命中宿主 → **插件模式**，向扩展列表注入行按钮，点击经 `openConverterModal()` 打开全屏模态 `#st-converter-modal-overlay > #app.app-container`（不预注入工作台）。
- `main(root)`：`createWorkbenchView({ actions, qr })`（`index.js:878`）→ 接 `actions`（导入 / 转换 / 拉取 / 恢复 / 删除 / 上传 / 局域网 / 云端）→ `await syncPackages()` 读库并渲染 → `refreshStorageQuota()`（启动 + 15s 兜底 + 页面可见时刷新）→ 按设置决定是否打开教程。
- `ensureConverterModal()` 用 `getWorkbenchHtml()` 构建模态容器；与独立态同源同模板，产物逐字相同。

### 2. `src/ui/host-bridge.js`（宿主边界唯一出口）
- 平台判定：`detectHost()` 返回**平台码** `st | luker | standalone`；`hostLayoutCode()` 把 `luker → l` 归一为**布局码** `st | l | tt | pt`。凡把宿主平台传给 `convert()` 或文件名模板处**必须经 `hostLayoutCode()`**（否则抛 `convert: target 必须是 st|l|tt|pt 之一`）。该双轨制的**权威表述**在 [Hook Guidelines](./hook-guidelines.md)，本节不复述细节。
- 服务端校验：`verifyHostPlatform()`（`GET /version`）、`validateBackupShape()`（导出后软校验，仅告警不阻断）。
- 认证与端点：`getCsrfToken()` / `getHandle()`；`fetchHostBackup()`（含 OPFS 半成品与 `resumeCheckpoint` 续传）、`restoreToHost()` / `restoreToLuker()` / `incrementalMergeArchives()`。端点调用传**平台码**（ST `/api/users/backup` 不支持 selection，Luker 支持）。
- 扩展安装器：`discoverHostExtensions()` / `installExtensionViaHost()` / `deleteExtensionViaHost()` / `checkHostThirdPartyAnomaly()` / `renderExtensionInstallerModal()`。
- OPFS 临时文件：`supportsOpfs()` / `opfsTmpHandle()` / `opfsHandleToFile()` / `opfsTmpCleanup()`。
- UI 注入（**全部经共享 `watchHostDom`**）：`mountExtensionRowButton()`（扩展列表行，打开工作台模态）、`registerMenuButton()`（扩展菜单，兼容保留）、`mountNativeBackupButton()`（ST 账号弹层 + 管理面板的 `.userBackupButton` 旁）、`mountLukerBackupManagerButton()`（Luker `.userBackupManager .backupActionRow`）、`mountTtDataMigrationButton()`（TT `#data_migration_export_button`）、`mountPtDataManagementButton()`（PT 数据管理 dialog 的 `#ptdm-export`）；`setupDrawerToggles(root)` 负责嵌套子抽屉折叠。
- 宿主能力适配器（均在本模块，遵循「宿主差异只进桥接层」）：`confirmDialog(message) → Promise<boolean>`（官方文档路径 `getContext().Popup.show.confirm`，不可用时降级 `window.confirm`）、`makeHostButton({...})`（注入按钮工厂）。
- 恢复链路：`restoreToHost()` / `isRestoreInFlight()` / `cancelRestoreInFlight()`（在途控制器由本模块持有，故无 DOM 的 Node 环境可单测）。

### 3. `src/ui/workbench-template.js`（HTML 模板**唯一来源** · 分区式）

- 唯一出口 `getWorkbenchHtml()`（**无参数**）——独立态与插件模态态由同一函数产出**逐字相同**的标记；
  `index.html` 自 2026-09-25 起仅为空骨架（详见本节 Multi-Entry 一节的现行约定与 §「Single Template Source」）。
- 渲染顺序按**操作流**（图表 → 数据包 → 设置/日志/帮助 的视图切换），分区与控件纪律见
  [`workbench-single-view.md`](./workbench-single-view.md)：

  | 区 | 内容 | 披露 |
  | --- | --- | --- |
  | 图表区 | `#chart-card` + `#chart-stack`（类目/体积卡、格式下拉、可拖拽尺寸） | 常驻 |
  | 数据包区 | `#zone-card` + `#zone-tabs`（导入/导出）+ `#zone-body` + `#action-row` + `#batch-bar` | 常驻 |
  | 配额区 | `#quota-head`（摘要行，详情默认收起） | 常驻 |
  | 进度底栏 | `#workbench-progress`（进度条 + 「点此查看日志」） | 常驻 |
  | 设置 / 日志 / 帮助 | `#view-settings` / `#view-log` / `#view-help` | 视图切换（面板内，非浮层） |

> 上表取代 09-25 版分区（`#stash-list` / `#category-panel` / `#task-controls` / `#report-panel` / `#log-console-mount`
> 均已在 2026-10-27 重写时删除）。

- 复用宿主原生类只有 `.menu_button`（10 处）与 `.text_pole`（13 处）；`.inline-drawer` / `.checkbox_label` / `.extension_block` 当前模板**未使用**。图标一律**内联 SVG**（`workbench-view.js` 的 `svg()` 辅助），无 Font Awesome 类、无 emoji。
- 徽标组只渲染一份（在页头 `header`）——历史上两处同时渲染导致重复 id，第二份 `#env-badge` 永远停在「检测中」。
- **两态无任何分支差异**：`getWorkbenchHtml()` 不接参数，独立态与模态态产物逐字相同；关闭按钮 `#btn-close` 恒在模板里，由独立态 CSS 隐藏。历史「抽屉态」差异（`#status-row` / `#btn-storage-inspector`）已随 2026-10-15 抽屉删除而消失。机器断言见 `test/single-template-source.test.js`。

### 4. `src/ui/escape.js`（DOM 注入防线）
- `escapeHtml()`（覆盖 `& < > " '`，元素上下文与**属性上下文**通用）、`isSafeHttpUrl()`（只放行 http/https）、`trustedStaticMarkup()`（恒等函数，唯一作用是让守卫放行并让 reviewer 一眼看完全部豁免点：`grep -rn "trustedStaticMarkup(" src/ index.js`）。
- 配套守卫：`npm run check:dom-injection`（`scripts/dom-injection-guard.js`）扫描 `src/ui/**` 与根 `index.js`；豁免需写 `dom-injection-guard:allow <理由>`（单条）或 `allow-file <理由>`（整文件，当前**没有文件**使用）。

### 5. 产物落地（原 `src/ui/export-queue.js`，当前未接线）
- 转换 / 拉取的产物由 `index.js` 的 `deliverCreated()` 决定去向：`settings.keepExport` 为真时写 IndexedDB
  （`saveFile`，`origin: ORIGINS.CONVERTED`，随后 `syncPackages()` 并切到导出区），否则直接 `downloadBlob()`。
  **不自动下载**由该设置控制，不是无条件行为。
- `export-queue.js` 的内存队列与 `renderExportQueue()` 自 2026-10-27 起**无调用方**（只剩单测），不要按它接线。

### 6. `src/core/delta.js`（增量导出）
- `compareArchives` 基于条目元数据（文件名 / 未压缩大小 / CRC32）快速比对；`generateDeltaArchive` 只含新增与修改条目，并附审计清单 `_delta_manifest.json`。

### 7. 日志视图（原 `src/ui/log-console.js`，已删除）
- 日志的渲染与过滤现由 `src/ui/workbench-view.js` 负责：`log()` 写入 `#log-lines`、`logText()` / `exportLog()` 导出、`#view-log` 为整页视图（点底部进度条进入）；`src/core/logger.js` 仍是唯一日志源，订阅接口 `logger.subscribe(fn)` 未变。

### 8. `src/storage/authority-store.js`（可选后端，不阻塞主路径）
- 探测 `window.STAuthority.AuthoritySDK`；不可用时全部接口返回 `null/false`，调用方无需分支。
- `createCheckpointAdapter()` 实现与 `TaskManager` 持久化 adapter 相同的 `{ save, load, remove }` 接缝；blob 按 4MB 分块落盘、清单存 KV。
