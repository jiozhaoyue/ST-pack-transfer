# 开发者指南 · 功能清单与源码落点

> 面向**改这个仓的人**。用户向说明见 [README.md](../README.md)；跨会话的架构规范见 `.trellis/spec/`。
> 本文登记**已经实现的功能**与它们的源码落点。**未实现的不写进来**——"文档有、代码无"是本仓明确禁止的形态。
>
> 最后核对：2026-11-11（本轮功能改动对照 `src/` 与目标测试；未跑全量）。

---

## 一、三种运行形态（同一份核心）

同一份 `src/core/` 跑在三种入口下，入口分别装配、核心零分叉：

| 形态 | 入口 | 装配点 | 差异 |
| --- | --- | --- | --- |
| **独立 Web** | `index.html`（仅空骨架 `#app.app-container`） | `index.js` → `bootstrap()` → `main()` | 无宿主；`file-protocol-notice.js` 只在 `file://` 下给提示 |
| **酒馆扩展插件** | `index.js` 检测到宿主 | `index.js` → 扩展列表行按钮 → `openConverterModal()` | 全屏模态；额外注入宿主原生备份 UI 入口 |
| **模态态** | `openConverterModal()` 导出 | `index.js:2662` 附近 | 自绘覆盖层 `#st-converter-modal-overlay` |
| **file:// 单文件离线**（新） | `dist-offline/ST-pack-transfer-offline.html` | `scripts/build-offline.mjs` | 单文件、IIFE、Worker 强制主线程降级 |

**单一模板源**：`src/ui/workbench-template.js` 的 `getWorkbenchHtml()` 是 HTML 的**唯一**来源；
`index.html` 只允许有空骨架容器（`scripts/single-template-source.js` 守卫强制）。

---

## 二、功能清单

### 0. 能力矩阵：四酒馆原生 vs 插件

> 取证时点 2026-11-10，来源为四宿主实例源码（非推测）。
> 判定口径见 `.trellis/spec/frontend/host-capability-matrix.md`。

#### 0.1 数据包能力（宿主原生）

| 能力 | SillyTavern | Luker | TauriTavern | PureTavern |
| --- | --- | --- | --- | --- |
| **导出端点** | `POST /api/users/backup`（忽略 selection，全量） | 同端点，**支持 10 键 selection** | `POST /api/extensions/data-migration/export`（返回 job_id，轮询 `/job?id=`）；另有 `/api/users/backup` 兼容层 | `POST /api/backups/archive/export`（versioned/hashed ZIP） |
| **导入 / 恢复端点** | ❌ 无恢复端点 | ✅ `POST /api/users/restore-backup` + **8 MiB 分片** | ✅ `POST /api/extensions/data-migration/import`（multipart `archive`） | ✅ `POST /api/backups/archive/import`（另 `import/preview` 冲突预览） |
| **可导入格式** | — | 本包 ZIP | ZIP / tar / tar.gz / tgz，**可直接导入 ST 数据包** | 本包 ZIP + **TT 包**（语义转换） |
| **包内布局** | `data/<handle>/` 目录树 | 同 ST，selection 决定类目 | `data/default-user/` 树（ST 兼容） | `manifest.json` + 模块记录（versioned/hashed） |
| **导入策略** | — | 合并 / 覆盖 | 由迁移作业处理 | merge / skip / replace-module / replace-all / 受保护的本地替换 |
| **恢复点** | ❌ | ❌ | ❌ | ✅ 导入前自动建恢复点 + 导入日志 |
| **本地备份库** | ❌ | ❌ | ❌ | ✅ `/api/backups/archive/local/*`（默认保留 5 份） |
| **跨宿主互操作** | ❌ | ❌ | ✅ 导入端兼容 ST 布局 | ✅ 内置 TT 互操作（模块记录 ↔ `data/default-user` 语义转换） |

#### 0.2 传输能力（宿主原生）

| 能力 | ST | Luker | TT | PT |
| --- | --- | --- | --- | --- |
| 局域网互传 | ❌ | ✅ `/api/sync/v1/*`（服务端 ↔ 服务端） | ✅ 但为 **Rust 命令**，扩展不可 invoke | ❌ |
| 云端对象存储 | ❌ | ✅ S3 Sync（加密桶 / 冲突决策 / Undo） | ✅ TT-Sync v2 | ❌ |
| WebDAV | ❌ | ❌ | ❌ | ❌ |
| 存储面板 / 配额（原生） | ❌ | ✅ `storage-inspector.js` | ❌ | ❌ |

> 本插件另有**自建存储审查面板**（四宿主可用，浏览器源全平台；宿主数据源仅 Luker），见 §二·O。

#### 0.3 插件功能来源：哪些直接用原生

| 插件功能 | ST | Luker | TT | PT | 来源 |
| --- | --- | --- | --- | --- | --- |
| 从宿主拉取数据包 | 原生端点 | 原生端点 + selection | 原生端点 | 原生端点 + moduleIds | **用原生** |
| 写回 / 恢复宿主 | 无原生恢复端点 | 原生 + 8 MiB 分片 | 原生导入端点 | 原生导入 + 预览 | **用原生** |
| 扩展清单 / 批量安装 | 原生 `discover` + manifest | 同左 + 原生安装器 | 原生 | 原生（当前 501） | **原生 + 增强** |
| 存储面板 / 配额 | 自建（浏览器源） | 原生数据源（`RestProvider`） | 自建（浏览器源） | 自建（浏览器源） | **原生数据优先** |
| 四酒馆格式互转 | 插件 | 插件 | 插件 | 插件 | **自建**（四家都没有） |
| 局域网互传 | 插件 | 插件 | 插件 | 插件 | **自建**（原生接不了，见下） |
| S3 / WebDAV 包仓库 | 插件 | 插件 | 插件 | 插件 | **自建**（Luker↔Luker 用原生） |
| 条目级差量导出 | 插件 | 插件 | 插件 | 插件 | **自建** |
| 暂停 / 续传 / 中止 | 插件 | 插件 | 插件 | 插件 | **自建**（原生无手动暂停） |

#### 0.4 两条边界

1. **原生同步接不了插件包**：Luker 的同步单位是「类目下的文件路径」（`src/sync/categories.js`），
   TT 的是 `DatasetPolicy` + per-file/bundle；协议里**没有「包」这一层**。把包塞进去只能先解压进宿主数据目录，
   那会写宿主数据且跨宿主失效。
2. **S3 / 局域网只在 Luker↔Luker 时该用原生**：插件这两项的价值在跨宿主（ST/PT/TT/云）与跨形态搬运。
   同宿主之间应引导用户走原生 Sync，避免重复配置凭据。

### A. 宿主数据导出（插件态）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 从当前宿主拉取整份用户数据 | 顶部全局动作条 `#btn-fetch` / 宿主原生界面注入按钮 | `index.js` 的 `fetchFromHost()` / `pullFromNativeUi()`；`src/ui/host-bridge.js` 的 `openNativeBackupUi()` / `fetchHostBackup()` |
| 迁移与备份 / 导出扩展清单 | 顶部全局动作条 `#transfer-open-btn` / `#btn-host-assetlist` | `src/ui/workbench-view.js` 的 `renderTopActions()` |
| **Luker 2.9+ 账户窗口**（备份页注入 / 勾选读取；存储页跳转能力保留但**配额行已改走自建面板**） | 账户 → Backup / Storage | `openHostAccountWindow()` / `openHostStoragePage()` / `readNativeBackupSelection()`；契约见 `.trellis/spec/frontend/luker-2.9-account-window.md` |
| **原生界面生命周期**（拉取后自动关闭、宿主原生导出优先） | 原生界面「从宿主拉取」 | `closeNativeBackupUi()` / `isNativeExportBusy()` / `watchNativeExportStart()`；契约见 `.trellis/spec/frontend/host-native-pull-lifecycle.md` |
| 细粒度类目勾选（10 类目 + 3 特殊类目） | `#chart-stack` 的类目卡与选择树 | `src/ui/workbench-view.js` 的 `renderTreeRows()`、`src/core/inspect.js`、`src/core/chart-model.js` |
| 类目内逐文件穿透排除 | 同一棵选择树 | `src/ui/workbench-view.js` 的 `renderTreeRows()`、`src/ui/host-bridge.js` 的 `exclude` 链路 |
| 一步直出目标布局（拉取时即指定目标格式） | `#target-select` | `src/core/plan-preview.js` 的路由/合成分支 |
| 拉取进度 / 半成品续传 | `#workbench-progress` | `src/ui/host-bridge.js` 的 `fetchHostBackup()`（`Range` 续传）、`src/core/worker-client.js` || 转换进度 / 暂停 / 继续 / 中止 | 动作行 `#btn-task-pause` / `#btn-task-resume` / `#btn-task-abort` | `src/app/conversion-runner.js`、`src/core/task-manager.js`、`src/app/task-runtime.js` 的 `persistPartial` |

### B. 包转换（三形态都有）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 四布局互转 `st` / `l` / `tt` / `pt` | `#btn-generate` + `#target-select` | `src/core/transform.js`（`convert()` 主入口） |
| 转换前完全扫描与动作预测 | 计划摘要条 | `src/core/plan-preview.js` |
| 转换报告（计数 + 丢弃/过滤/警告三类清单 + 下载 `.txt`） | 转换完成后模态框 `view.showReport(report)` | `src/core/report.js` 的 `reportToHuman()`、`src/ui/workbench-view.js` 的 `showReport()` |
| 剔除酒馆原生重复资产 | 类目树的 `group:native` 勾选（`chart-model.js:408` 据此算 `pruneBuiltinAssets`） | `src/core/builtin-assets.js` |
| Zstandard（Method 93）/ 7-Zip ZS 透明解压 | 自动 | `src/core/zip-io.js` + `src/vendor/fzstd.js` |

### C. 增量与差量

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 两包差量合并（新版更新、历史独有保留） | `#host-incremental-export` + 基准 ZIP | `src/core/delta.js` |
| 源包增强（惰性直通复制） | 内部 | `src/core/zip-augment.js` |
| 智能分卷（规避云酒馆单包上限） | `#split-input` | `src/core/splitter.js` |

### D. 恢复写回宿主（插件态）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 合并写入（`merge`：覆盖同名、不删独有） | 恢复模态 `name:restore-mode` | `src/ui/host-bridge.js` 的 `restoreToHost()` |
| 覆盖写入（二次警示） | 同上 | 同上 |
| 批量恢复编排 | 恢复模态 | `src/core/restore-batch.js` |
| **跨引擎裸 SQL 转储净化**（`_engine_dump.bin` / `_engine_meta.json`） | 自动 | `src/core/engine-sanitize.js`；`index.js` 的 `restoreSelectedConfirmed()`。PG→文件系统、文件系统→PG、PG→PG 不兼容一律剔除后走标准便携恢复，避免 `settings_pkey` 主键冲突；纯引擎转储包如实提示并跳过 |
| **批量恢复容错与报告**（单包失败不中断、完整报告、保留/丢弃部分成果、进度落盘） | 恢复完成模态 | `index.js` 的 `restoreSelectedConfirmed()`（`stpt.restoreProgress`）；`src/ui/workbench-view.js` 的 `showRestoreReport()` |
| **上传后刷新**（设置默认关；否则报告内提供「刷新页面」） | 设置 → 导出 / 恢复报告 | `src/ui/settings-panel.js` 的 `autoRefreshAfterUpload`；`index.js` 恢复完成分支 |
| **目标写入门禁**（无备份/过期确认/目标变化/权限未知 ⇒ 零写入） | `#restore-backup-confirmed` | `src/ui/migration-controller.js` 的 `guardedRestore()` / `buildTargetEvidence()` |

### E. 迁移计划与安全判定（S1–S4，2026-10-13）

| 功能 | 源码落点 |
| --- | --- |
| 统一不可变计划快照（requested / effective / capabilities 分离） | `src/core/migration-plan.js` 的 `createMigrationPlan()` |
| 目标写入唯一安全门 | `src/core/migration-evidence.js` 的 `evaluateWriteGate()` |
| 重试资格判定（只认证据，不认界面态） | 同文件的 `assessRetry()` |
| 核对结论四态（completed / completed-with-exclusions / needs-verification / failed） | 同文件的 `classifyOutcome()` / `buildVerificationEvidence()` |
| 源端三类交付（源备份 / 目标包 / 独立报告） | `src/ui/migration-controller.js` 的 `buildSourceDeliveries()` |
| 向导与工作台共享状态接缝 | 同文件的 `createMigrationSession()` |

### F. 迁移向导（S5 第二步，2026-10-13 · **默认入口**）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 六步向导（来源→目标→范围→检查→执行→核对） | `#wizard-rail` | `src/ui/migration-wizard.js` 的 `WIZARD_STEPS` / `createWizardMachine()` |
| 视图切换（向导 ⇄ 高级工作台） | `#btn-wb-view-toggle` | 同文件的 `mountMigrationWizard()` |
| 键盘导航（←/→/Home/End） | 步骤条 | 同上（`onRailKeydown`） |
| 检查页（执行前集中说明范围与排除项） | `#wizard-check-panel` | 同上 `setCheckPanel()`；数据来自 `index.js` 的 `syncWizardCheckPanel()` |
| **旧会话不兼容门** | `#wizard-gate` | 同文件的 `buildSessionGateVerdict()` |

### G. 会话与存储

| 功能 | 源码落点 |
| --- | --- |
| 工作区会话（跨重载恢复源包/目标/选择） | `src/storage/db.js` 的 `saveWorkspaceState()` / `loadWorkspaceState()` |
| **强制不兼容**（非 v2 会话一律作废） | `src/core/migration-session.js` 的 `classifySessionCompatibility()` / `SESSION_SCHEMA_VERSION` |
| 断点续传（crc 台账 + OPFS 半成品） | `src/core/task-manager.js`、`src/core/transform.js` 的 `resumeCrcMap` |
| 产物落地（`keepExport` 决定入库；否则进本次待导出队列） | `index.js` 的 `deliverCreated()`；`src/ui/export-queue.js`（`ExportQueue` + `#pending-exports`） |
| 可选 Authority 后端增强（不可用即静默降级） | `src/storage/authority-store.js` |

### H. 聊天库适配（纯库模式）

| 方向 | 源码落点 |
| --- | --- |
| 打包时补齐库里磁盘没有的聊天 | `src/core/pack-inject.js`（纯决策）、`src/ui/chat-store-inject.js` |
| 从聊天库导出成标准数据包 | `#btn-library-export`、`src/ui/chat-store-bridge.js` |
| 还原后把包里聊天录入库 | `src/ui/chat-store-inject.js` |

> 前置：需聊天库插件暴露带版本号的接入接口（契约见 `.trellis/spec/frontend/chat-store-seam.md`）。
> **上游当前未实现** ⇒ 该能力在真实纯库环境尚未跑通（已按"不可用即静默透传"处理）。

### I. 诊断与可观测

| 功能 | 源码落点 |
| --- | --- |
| 结构化实时日志（等级按钮自带条数 / 毫秒时间戳 / 条数上限 / 加载时清空） | `src/ui/workbench-view.js` 的 `renderLog()` / `nowTime()` / `logLimit()`；`test` 外无独立模块 |
| 存储配额两行（浏览器 / 宿主）：两行都打开**同一个存储审查面板**（占满内容区），面板内可切换数据源；初始来源 = 点击的那一行。只读 | `src/ui/workbench-view.js` 的 `renderQuota()` / `renderStorageInspector()` / `openStorageInspector()` / `siRequest()`；`src/core/storage-inspector-model.js`（纯逻辑）；`src/ui/storage-inspector-browser.js`（浏览器 provider）；`index.js` 的 `actions.storageInspector`；`src/ui/host-bridge.js` 的 `fetchHostStorageInspect()` / `hostStorageInspectCapability()`。契约见 [HANDOFF-2026-11-11-storage-inspector.md](./HANDOFF-2026-11-11-storage-inspector.md) |
| 教程演示模式（占位数据可操作；退出整体还原；不写真实数据/宿主） | `#btn-guide` / 教程菜单 / `#tutorial-banner-exit` | `src/ui/workbench-view.js` 的 `enterTutorialMode()` / `exitTutorialMode()` / `demoTutorialActions()` / `buildDemoPackages()`；模板 `#tutorial-banner` |
| 目标任务式教程（选目标 → 逐步高亮；按平台与桌面/手机视图自适应；目标缺失时卡片居中保留） | `#btn-guide` → 目标菜单 | `src/ui/workbench-view.js` 的 `TUTORIAL_GOALS` / `renderTutorial()` / `tutorialPrepareStep()` / `centerTutorialCard()` |
| 宿主配额读数（Luker `RestProvider`，供配额行） | `src/ui/host-bridge.js` 的 `readHostStorageQuota()`；面板内的逐层读取走 `fetchHostStorageInspect()` |
| 导出扩展资产列表（官方扁平 JSON，可导入「下载扩展和资源菜单」） | 每张图表卡 `[data-assetlist]`；空态 `#btn-assetlist-host` | `src/core/asset-list.js`、`src/ui/host-bridge.js` 的 `listHostExtensions()`、`index.js` 的 `exportPackageAssetList()` / `exportHostAssetList()`；契约见 `.trellis/spec/frontend/asset-list-export.md` |
| 设置分组可收起（提示 / 导出 / 日志） | `src/ui/settings-panel.js` 的 `buildSettingsHtml()`（三个 `<details>`） |
| 图表单独最大化 + 逐层下钻（勾选逻辑不变） | `src/ui/workbench-view.js` 的 `chartCardHtml()` / `volScopedNodes()` / `volBreadcrumbHtml()`；**最大化只铺满 `#app.app-container`，不是浏览器视口全屏**（`style.css` 的 `.vol-card.is-max` 用 `position:absolute`） |
| 扩展未勾选时的「保持不选 / 仅清单」 | `src/ui/workbench-view.js` 的 `extensionToolsHtml()` / `extensionManifestOnly()`；仅清单时保留扩展元数据扫描、实体由 manifest 模式丢弃 |
| 私有配置目标宿主兼容标记 | `src/ui/workbench-view.js` 的 `privateHostCode()` / `nodePrivateIncompatible()`；跨宿主仍打包到 `_compat/`，树内显示「不兼容」 |

### J. file:// 单文件离线产物（S7，2026-10-13）

| 功能 | 源码落点 |
| --- | --- |
| IIFE 单包 + CSS/字体内联 + 零外部请求 | `scripts/build-offline.mjs`、`scripts/offline/entry.js` |
| Worker 构建期换空实现（IIFE 不接受 `new Worker(new URL(...))`） | `src/core/worker-factory.js` + `scripts/offline/worker-factory.stub.js` |
| 运行期离线标记（确定走主线程降级） | `src/core/worker-client.js` 的 `isOfflineBuild()` |
| 验证 | `e2e/standalone/specs/offline-single-file.e2e.cjs`（28 断言） |

### K. 局域网互传（整面板视图，2026-11-05）
| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 用「迁移与备份」面板**完整替换**左侧图表面板 | `#chart-card` 动作行的 `#transfer-open-btn` | `src/ui/workbench-template.js`（`#transfer-view` + `#transfer-tabs`）、`src/ui/workbench-view.js` 的 `renderTransfer()` / `renderLan()` |
| 关闭面板、回到图表 | `#transfer-close-btn` | 同上 |
| 一级 tab：局域网 / 公网 | `#transfer-tabs` | `src/ui/workbench-view.js` 的 `renderTransfer()` |
| WebRTC 分块传输 / 二维码信令 / 续传 | 局域网 pane 内发送与接收区 | `src/core/lan-transfer.js`、`src/ui/lan-transfer-panel.js` |

> 新的承载面契约见 `.trellis/spec/frontend/workbench-single-view.md` §7.3；
> 旧「执行卡内折叠块」模型（`.lan-block` / `#lan-toggle` / `.col-side.lan-open`）已废弃。

### K2. 内联扩展管理（2026-11-11）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 视图切换（桌面 2 / 手机 3；桌面数据包列常显） | 顶栏下 `#view-switch` | `src/ui/workbench-view.js` 的 `renderViewSwitch()` / `syncMainView()` |
| 扩展管理整面板（安装 / 已装 / 报告） | `#extension-view` | 同文件的 `renderExtensionView()` / `renderExtInstall()` / `renderExtInstalled()` / `renderExtReport()` |
| 批量安装（多行链接 / `.txt` / `.json`；`url \| 分支`、`url#分支`） | 安装页文本框与文件上传 | 同文件的 `parseExtEntries()`；执行端 `src/ui/host-bridge.js` 的 `installExtensionBatch()` |
| 导出日志 / 失败链接 txt / 安装报告 JSON | 安装页与报告页底部按钮 | 同文件的 `downloadTextFile()` |
| 宿主扩展清单导出收束 | 已装页「导出扩展清单」 | `index.js` 的 `exportAssetList()`（`source:'host'`） |
| 包清单入口收束 | 图表卡 `[data-extmanifest]` → 扩展管理并预填 | `index.js` 的 `openExtensionManifest` → `view.openExtensionManager()` |
| **打包页：按数据包选择扩展** | 扩展管理 → 打包 | `src/ui/workbench-view.js` 的 `renderExtPack()`；扩展折叠为单元的纯逻辑在 `src/core/ext-pack.js`（`extensionUnitsOf` / `extensionUnitName`） |
| **每包独立 Git 模式** | 打包页组头 / 图表卡 `[data-gitmode]` | `state.gitModeByPkg` + `packageGitMode(pkg)`；`getExportOptions(pkg)` 与合并计划按包取值 |
| **Git 账号（多站点多账号）** | 扩展管理 → 安装页「Git 账号」 | `src/core/git-accounts.js`（归一/增删/默认/匹配/脱敏）；`src/ui/git-remote.js`（测试账号）；持久化在 `settings-store.js` 与 `extension_settings` |
| **凭据存储位置（服务端 / 仅浏览器）** | 账号区单选项 | `settings-panel.js` 的 `gitCredentialStorage`；`settings-store.js` 的 `saveSettings()` 在 browser 模式写回空的 `gitAccounts` 覆盖服务端副本 |
| **URL 归一（含 `/tree/<ref>`）** | 安装条目行 | `src/core/git-url.js` 的 `parseRepoUrl()` / `refineRefWithBranches()`；仓库页地址必须解析成「根 + ref」——宿主用 URL 最后一段做目录名 |
| **分支列举 / 仓库摘要 / 私有预检** | 条目行「列分支」与解析后自动预检 | `src/core/git-site.js`（端点/鉴权/归一）+ `src/ui/git-remote.js`（有界超时 fetch） |
| **私有仓安装（凭据注入）** | 安装执行 | `host-bridge.js` 的 `installExtensionBatch()` 用 `buildAuthedUrl()` 拼进交给宿主的 URL；日志/报告用 `scrubUrlCredentials()` 脱敏 |
| **更新检查（只读）** | 已装页「检查更新」 | `workbench-view.js` 的 `checkExtUpdates()`；本地版本读宿主静态 `manifest.json`，远端读 raw manifest，`compareVersions()` 比较 |

> 宿主「从宿主拉取」注入只允许落在**备份**动作区：ST/TT 的 `.userBackupButton`、
> Luker 的 `.backupActionRow`（必须含 `.backupDownloadButton`）或 2.9+ `.dw-foot`（含
> `[data-act="backup-go"]`）、TT 的 `#data_migration_export_button`、PT 的 `#ptdm-export`。
> **禁止**回退到「首个 `.backupActionRow`」——日志查看器同用该类名，会注错（2026-11-11 实测）。
>
> **凭据隐私是产品事实，不是可选文案**：插件没有自有远端；凭据默认随宿主
> `extension_settings` 写入服务端 `settings.json`（有服务器/管理员权限者可见），
> 可在账号区改成「仅浏览器」；任何展示位置必须脱敏。私有仓库安装时凭据会被拼进
> 交给宿主克隆的 URL，宿主可能写入该扩展的 `.git/config`。

### L. 工作台布局：执行卡取消 · 进度条常驻 · 图表网格（2026-11-05）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 顶层面板只剩图表面板与数据包面板 | — | `src/ui/workbench-template.js`：`.col-chart`（`#chart-card` / `#lan-view`）+ `.col-side`（`#zone-card`） |
| 动作按钮并入数据包面板底部 | `#zone-card > #zone-actions-bottom` | `workbench-view.js` 的 `renderActions()`（仅在勾选后出现） |
| 顶部全局动作条 | `.app-body > #top-actions` | `renderTopActions()`：从宿主拉取 / 导出扩展清单 / 迁移与备份 |
| 导出区多选「上传」 | `#btn-upload` | `index.js` 的 `restoreSelectedConfirmed()` 逐包顺序恢复；任一失败即停止并报错 |
| 进度条为常驻底栏，所有视图共用 | `#workbench-progress`（`.app-body` 末位子项） | `workbench-template.js` 模板末尾；`setProgress()` 写 `#progress-fill` / `#progress-label` / `#progress-pct` |
| 点击进度条打开日志 | `#workbench-progress` 的 click | `workbench-view.js` 的 `bind()`（`renderLog()` + `showPane('log')`） |
| 顶栏日志按钮已删除 | — | `#btn-log` 不再存在；`#log-dot` 迁入底栏 |
| 图表动态宫格（1 张占满 / 2 张平分 / 3–4 张 2×2 / >4 张纵向滚动） | `.chart-canvas` | `src/ui/workbench-view.js` 的 `chartCanvasHtml()`；`style.css` 的 `.chart-canvas` |
| 图表之间拖拽调整行列比例 | `.chart-split-v` / `.chart-split-h` | `initChartSplitters()` + `localStorage['stpt.chartLayout']` |
| 图表格式切换（单条多色 / 圆环） | 每张卡的 `[data-chartfmt-toggle]` 图标按钮 | `chartFmtOf()` / `volChartHtml()`；状态 `state.chartFmt[key]` |
| 图表占比动态跟随勾选 | 自动 | `selectedMbMap()` / `volChartData()`；取消勾选后色块与 `tree-occ` 同步重算 |
| 最大化逐层下钻 | 图表卡 `⤢` + 分类行 | `renderTreeRows()` 在 `drill` 态只渲染下钻按钮，面包屑 `data-volcrumb` 返回 |
| 数据包偏好（占位勾选 + 顶部控件并入） | `#chart-pref-btn` | `src/ui/chart-prefs.js`、`openChartPrefs()` / `saveChartPrefsDraft()`；保存后只影响以后导入的包。**覆盖/增量已移出偏好**，改到数据包列表顶部 `#delta-toggle`。再次点击按钮退出；有未保存改动先弹确认（设置项 `confirmDiscardChartPrefs`，默认开） |
| 包名模板（默认折叠；按钮带 ✎ +「包名」+ 展开箭头；展开后预览独占下一行） | `#filename-toggle` / `#filename-row` | `src/ui/workbench-view.js` 的 `renderFilenamePreview()`；`style.css` 的 `.filename-toggle` / `.filename-edit` / `.filename-preview` |
| 每行占用条与色标 | `.tree-row > .tree-dot` / `.tree-occ` | `renderTreeRows()` 用同一套调色板 |
| 拖拽卡片改尺寸 | **已删除**（2026-11-09 用户裁定：图表大小由宫格动态决定，不允许自由拉伸） | — |

> 完整契约与验收判据见 `.trellis/spec/frontend/workbench-single-view.md` §11。
> 注意：`@container` 与基础 `grid-template-columns` **同特异度**，靠源码顺序决胜负——
> 列数规则必须写在基础规则之后，否则恒为单列（2026-11-05 实测踩到）。

### M. 公网传输：S3 / WebDAV（2026-11-09）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 公网内二级切换 S3 / WebDAV | `#cloud-provider-tabs` | `src/ui/workbench-view.js` 的 `renderCloud()` / `cloudClient()` |
| 分片上传 / 断点续传 / 清单 | 云端面板的上传与备份按钮 | `src/core/transfer-plan.js`、`src/app/transfer-runner.js`、`src/core/transfer-target.js` |
| 选包来源 | **只读左侧数据包列表的选中项**，面板内无独立文件选择器 | `state.selectedPkgs`；`#cloud-upload`（原包名上传）/ `#cloud-backup-selected`（建备份版本） |
| S3 HEAD / Range / multipart | 自动 | `src/core/s3-client.js` |
| WebDAV 全方法降级（OPTIONS/PROPFIND/MKCOL） | 自动 | `src/core/webdav-client.js` |
| 逐片加密（可选） | S3/WebDAV 表单的「加密短语」；**留空即不加密** | `src/core/s3-crypto.js`；`transfer-runner` 每片独立 IV，续传沿用清单里的原 salt |
| 一键备份：全量时间戳快照 | `#cloud-backup-selected` + `#cloud-mode-select=full` | `index.js` 的 `backupSelectedToCloud()`；每次独立对象，保留最近 `#cloud-retention` 份 |
| 一键备份：增量备份集 | `#cloud-mode-select=set` + `#cloud-set-name` | `src/app/backup-set-runner.js`、`src/core/backup-set.js`；对象按 sha256 去重，每版一张完整快照 |
| 备份集恢复 | 列表里的「恢复」按钮 | `restoreBackupSet()` → `actions.importCloudPack()` 落入工作区，再走既有迁移流程 |

> 契约见 `.trellis/spec/frontend/transfer-s3-webdav.md`。
> **无服务端直传、无 cron**：本插件禁止后台插件；`serverTransfer` 能力表全 false。

### N. 恢复上传：Luker 8 MiB 分片（2026-11-10）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 云酒馆大包恢复穿过 CF 100 MB 单请求上限 | 导出区「上传」 | `src/ui/host-bridge.js` 的 `tryLukerChunkedRestore()` |
| 分片协议纯逻辑（8 MiB / 413 减半 / 3 次重试） | — | `src/core/chunked-restore.js` |
| 旧版/无分片端点宿主的整包回退 | 自动 | `postRestoreWithFallback()` |
| 仅清单包在插件内查看并安装 | 图表卡头 `[data-extmanifest]` | `index.js` 的 `readPackageExtensionManifest()` / `openExtensionManifest`；`host-bridge.js` 的 `renderExtensionInstallerModal()` |

> 契约见 `.trellis/spec/frontend/large-pack-upload.md`。
> 分片端点：`POST /api/users/restore-backup/uploads` → `PUT …/{uploadId}/chunks/{offset}` →
> `POST …/finalize` → `POST /api/users/restore-backup`（`{uploadId, handle, mode, selection}`）。

### O. 存储审查面板（2026-11-11）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 浏览器 / 宿主同一面板，初始来源跟随点击行，面板内可切换 | `#quota-head` 两行 → `#storage-inspector-view` | `src/ui/workbench-view.js` 的 `renderQuota()` / `renderStorageInspector()` / `openStorageInspector()` / `siSwitchSource()` / `siRequest()` |
| 浏览器 L0 五类与下钻（localStorage / sessionStorage / IndexedDB / Cache Storage / 配额），只读 | 面板内列表与面包屑 | `src/ui/storage-inspector-browser.js`、`src/core/storage-inspector-model.js`（纯逻辑） |
| 宿主数据源（Luker `RestProvider`；失败回落 `POST /api/users/storage/inspect`） | 面板「宿主」页签 | `src/ui/host-bridge.js` 的 `fetchHostStorageInspect()` / `hostStorageInspectCapability()`；`index.js` 的 `actions.storageInspector` |
| 占满内容区（隐藏数据包列与分隔条，网格改单列） | — | `syncMainView()` + `style.css` 的 `[data-si="1"]` / `.si-*` |

> 契约与验收：`.trellis/spec/frontend/storage-inspector.md`；
> 取证脚本 `scripts/ui-verify-storage-inspector.cjs`（本地专属，前置 `npm run build` + 4173）。
> 非 Luker 宿主显示「当前宿主未提供存储审查」，不伪造数字；浏览器测不到的大小显示 `?`。

---

## 三、分层与硬性边界

```
src/core/     纯逻辑，**禁止 DOM / window / fetch**（可在 Node/Vitest 直接跑）
              新增：asset-list.js（官方资产列表）、transfer-plan.js（分片台账）、
              webdav-client.js、transfer-target.js、host-capabilities.js、
              ext-pack.js（扩展折叠为打包单元）、git-url.js（仓库地址归一）、
              git-accounts.js（账号库）、git-site.js（站点 API 端点/归一）、
              storage-inspector-model.js（存储审查的纯逻辑：尺寸/配色/点阵/归一）
src/app/      转换/传输编排（task-runtime / conversion-runner / transfer-runner / pull-entry）
src/ui/       可 DOM；host-bridge.js 是宿主差异的唯一落点；git-remote.js 是 Git 站点网络的唯一落点
src/storage/  IndexedDB + 可选 Authority 适配器
src/vendor/   zip.js / fzstd / fontawesome 本地副本 —— **勿升级改动**
public/       仅 file-protocol-notice.js
index.js      根控制器：detectHost → applyPluginUi → ExportQueue + TaskManager
```

不可越过的线（违反即返工）：

1. **CSS 作用域**：所有规则必须挂在 `#app.app-container`（独立/模态统一根）或自有覆盖层 id
   （`#st-converter-modal-overlay` / `#wb-detail-overlay`）之下；`.st-converter-drawer-app` 已删除（2026-10-15）。
   配色走 `var(--SmartTheme*, 回退值)`。裸选择器会污染宿主全站 UI（2026-09 实际发生）。
2. **单一模板源**：业务节点只允许出现在 `workbench-template.js`。
3. **Worker terminate 后必须置空引用**（否则此后每次任务静默挂死）。
4. **有界等待**：所有 `await`（媒体事件 / fetch / 渲染 promise）必须能 settle。
5. **高频进度回调必须 rAF 合帧**。
6. **宿主差异只进 `host-bridge.js`**；平台码 `st|luker|standalone` 与布局码 `st|l|tt|pt` 必须经
   `hostLayoutCode()` 归一（`luker→l`）。
7. **控件必须有消费点声明**（`scripts/control-consumer-guard.js`）——防"死控件"。

---

## 四、质量门槛与命令

```bash
npm test                      # Vitest 全量（2026-10-13 基线：718 passed / 2 skipped / 71 文件）
npx vitest run test/xxx.test.js
npm run check:css-scope       # CSS 双前缀
npm run check:dom-injection   # innerHTML 未转义插值
npm run check:template-source # 单一模板源 + 必需节点 id
npm run check:dom-scope       # 宿主 DOM 写入作用域
npm run check:control-consumer# 控件消费点
npm run build                 # GitHub Pages 静态站点（base=./）
npm run preview               # 本地静态服务器托管 dist（4173）——**UI 验收唯一入口**
npm run build:offline         # file:// 单文件离线产物
npm run e2e                   # 实例侧 E2E（需 Dev 实例；只连 Dev 白名单端口）
npm run e2e:web               # 独立 Web / 云子路径 / file:// 离线（不需要实例）
npm run e2e:web -- --rebuild  # 删/换过源码文件时必须加（mtime 判据看不见"删了文件"）
```

无独立 lint/typecheck —— 类型契约靠 JSDoc + 运行时守卫，**质量门槛就是 `npm test` 全绿**。

**UI 验收唯一路径（2026-11-09 用户裁定）**：

```bash
npm run build        # 产物必须是最新源码
npm run preview      # 本地静态服务器托管 dist，默认 4173
```

浏览器打开 `http://localhost:4173/` 操作取证。**禁止**用 `file://`、`npm run dev`
或直接双击 `dist/index.html` 作为界面验收入口；`npm run dev` 只用于开发热重载。
本机小规模取证脚本（不纳版本控制）：`scripts/ui-verify-static.cjs`。

**E2E 视图约定（2026-10-13 起）**：默认入口是向导，向导只披露当前步 ⇒ 测高级工作台的 spec
必须显式调用 `common.useAdvancedView(page)`。测向导本身的用 `wizard.e2e.cjs`。

---

## 五、破坏性变更登记（Breaking changes）

| 日期 | 变更 | 影响 | 依据 |
| --- | --- | --- | --- |
| 2026-10-13 | **会话 schema v1 一律作废**：`SESSION_SCHEMA_VERSION = 2`，`classifySessionCompatibility()` 对任何非 v2 记录返回 `reject-incompatible`；**结构未变的 v1 也拒** | 旧工作区会话不再自动恢复；向导显示"旧会话已作废 + 从源重开"。**磁盘上的包与半成品文件不删** | 用户裁定 U-1：「禁止兼容旧数据，任何即使没改也要强制不兼容」 |
| 2026-10-13 | 删除 `normalizeLegacySession()`（静默补齐语义）→ 改为只读的 `readSessionRecord()` | 任何依赖"旧记录会被补默认值"的代码都失效 | 同上 |
| 2026-10-13 | **默认入口改为迁移向导** | 非当前步的控件在向导视图下 `display:none`；E2E spec 需显式切高级视图 | `10-01` R-08「向导为默认入口」 |
| 2026-10-13 | `new Worker(...)` 移入 `worker-factory.js` | 直接 `new Worker(new URL('./converter-worker.js', import.meta.url))` 的写法不再出现；离线构建靠 alias 换实现 | IIFE 单包构建要求 |

---

## 六、已知限制（诚实登记，不当作已实现）

| 项 | 状态 |
| --- | --- |
| 纯库聊天接口 | 上游未实现，三条聊天库路径均未在真实纯库环境跑通 |
| 目标侧自动读回核对 | **判定就绪**（`buildRestoreVerification` / `summarizeVerification`）；**写入后**的宿主侧读回**仍未接入**（`coverage` 只到「宿主确认写入」）。⚠ 注意：读取宿主清单的**能力**已具备（见下两条），缺的是「写入之后再取一次并比对」的编排 |
| 自动目标备份 | **已接入（2026-10-14）**：恢复对话框「自动备份并预检目标」→ `fetchHostInventory()` 触发 `/api/users/backup` → 只读中央目录 → 入待导出区 **且** 落工作区（IndexedDB）⇒ `readback-verified`。三条件（可读 / 范围覆盖 / 已留存）缺一即降级 `none`，**不**回落 `user-attested` |
| 目标冲突预检 | **已接入（2026-10-14）**：`src/core/target-inventory.js` 的 `alignInventories` 对齐守卫 + `assessInventoryConflicts`。只有对齐成立才报真实冲突数；**伪报「0 冲突」比报 unknown 更危险**，故截断 / 清单为空 / 缺标准根标记 / 顶层段不可比 一律降级 `unknown` |
| 自动重发重试 | **判定就绪**（`assessRetry` + `selectRetryCandidates` 双重门）；**执行未接入**（无部分重试 UI） |
| 各异步阶段超时数值与测量 | **边界已逐条取证 + 测量装置已就位 + 首批实测读数已取（2026-10-14）**：`.trellis/spec/frontend/async-bounds.md`（10 阶段边界表，逐条 `file:line`；Dev ST 实测：凭证 53ms / TTFB 141ms / 685MB 传输 60.1s / 块间最大间隔 651ms）。**传输停滞守卫**已补（`readStreamChunkBounded`，只守间隔不守总时长——实测同一路径的正常传输就耗时 60.1s，总时限口径会误杀）。⚠ **Luker / 慢速网络 / 上传方向仍未测**，对应常量仍标「待实测校准」 |
| 四个宿主的完整有向迁移路径证据 | 格式转换面 4 源 × 4 目标 = 16 条逐条走通（含 PT 原生源）；**目标侧写入**仍靠实例/人工证据 |
| 外部用户试用 | 未做（公开发布关口未通过） |
| TT 自动化 | 无浏览器端口 ⇒ 人工交付 |
| PT 原生归档源的有损点 | 角色卡用自带卡的 `avatars` blob（运行期 PT 角色头像可能已被 PT 重编码）；聊天 jsonl 重序列化丢原始空白；预设 metadata 不重建 |
| PT 原生源断点续传 | 不支持（重建条目无源 crc32 ⇒ 暂停后作废半成品并完整重做，安全降级） |
| 资产列表 URL 来源 | 宿主 `/api/extensions/discover` 只给目录名/类型；URL 只能取各扩展 `manifest.json` 的 `homePage`。没有 `homePage` 的扩展无法导出可导入地址（如实提示，不伪造） |
| 自动备份 | 两条路：① **全量时间戳快照**（每次独立新包，保留最近 N 份）；② **内容寻址增量备份集**（只传新增/修改条目，每版一张完整清单，任一张可独立恢复）。**加密可选**：填口令即逐片加密，留空即不加密。**无 cron、无服务端直传**（用户禁止后台插件）。**不做差量链**（用户 2026-11-09 裁定 D-8） |
| WebDAV 真机 | 协议与降级分支已单测覆盖；**尚未在真实 WebDAV 服务器上跑过**（含 405/401/CORS 实测） |
| 静态 UI 验收 | `npm run build && npm run preview` 只覆盖独立 Web / 插件模板本身；宿主注入（账户面板、原生按钮）仍需 Dev 实例 |
| Git 账号与安装 | 站点 API 只在用户主动操作时请求；GitHub/GitLab/Gitee 支持 CORS，**自建 Gitea 视实例配置**，失败一律显示「未提供」/原因码 |
| commit 安装 | 宿主 `git clone --branch` **不接受 commit SHA**；插件仍可传，失败信息原样回显并建议改用分支/标签 |
| 私有仓库凭据 | 只能拼进交给宿主克隆的 URL；宿主可能写入扩展 `.git/config`，插件无法回收（安装前弹窗告知） |
| 更新检查 | 只比对本地/远端 `manifest.json` 版本；任一缺失即 `unknown`，不自动更新 |
| 宿主存储审查实机 | 面板与宿主数据源按 Luker 契约实现；**真实 Luker 实例下钻未取证**（8003 运行时可补）。能力判定与端点回落有单测；ST/TT/PT 如实显示「未提供」 |
| 宿主存储审查删除能力 | 首版**只读**（用户 2026-11-11 裁定）；Luker 原生 inspector 支持删除，本插件不复刻 |

---

## 七、相关文档

- `.trellis/spec/frontend/` —— 分层规范（目录结构 / 组件 / 状态管理 / 宿主能力 / 质量 / DOM 写入作用域 / 迁移三篇）
  - `workbench-single-view.md` §7.3 —— 局域网互传整面板替换
  - `storage-inspector.md` —— 存储审查面板（浏览器 / 宿主同面板、provider 契约、验收脚本）
  - `host-native-pull-lifecycle.md` —— 宿主原生导出界面的打开 / 拉取 / 关闭 / 让路
- `.trellis/spec/backend/` —— 核心层规范
- `.trellis/workflow.md` —— 任务流
- [README.md](../README.md) —— 用户向说明
- [AGENTS.md](../AGENTS.md) —— 项目规则与统一开发规则
