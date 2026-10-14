# 开发者指南 · 功能清单与源码落点

> 面向**改这个仓的人**。用户向说明见 [README.md](../README.md)；跨会话的架构规范见 `.trellis/spec/`。
> 本文登记**已经实现的功能**与它们的源码落点。**未实现的不写进来**——"文档有、代码无"是本仓明确禁止的形态。
>
> 最后核对：2026-10-13（对照 `src/` 全量模块头部说明 + 五守卫 + `npm test` 718 passed）。

---

## 一、三种运行形态（同一份核心）

同一份 `src/core/` 跑在三种入口下，入口分别装配、核心零分叉：

| 形态 | 入口 | 装配点 | 差异 |
| --- | --- | --- | --- |
| **独立 Web** | `index.html`（仅空骨架 `#app.app-container`） | `index.js` → `bootstrap()` → `main()` | 无宿主；`file-protocol-notice.js` 只在 `file://` 下给提示 |
| **酒馆扩展插件** | `index.js` 检测到宿主 | `index.js` → `mountSettingsDrawer()` | 抽屉态；额外注入宿主原生备份 UI 入口 |
| **模态态** | `openConverterModal()` 导出 | `index.js:2662` 附近 | 自绘覆盖层 `#st-converter-modal-overlay` |
| **file:// 单文件离线**（新） | `dist-offline/st-zip-converter-offline.html` | `scripts/build-offline.mjs` | 单文件、IIFE、Worker 强制主线程降级 |

**单一模板源**：`src/ui/workbench-template.js` 的 `getWorkbenchHtml()` 是 HTML 的**唯一**来源；
`index.html` 只允许有空骨架容器（`scripts/single-template-source.js` 守卫强制）。

---

## 二、功能清单

### A. 宿主数据导出（插件态）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 从当前宿主拉取整份用户数据 | `#btn-host-fetch` | `src/ui/host-bridge.js` 的 `fetchHostBackup()` |
| 细粒度类目勾选（10 类目 + 3 特殊类目） | `#category-checkboxes` | `src/ui/category-filter.js`、`src/core/inspect.js` |
| 类目内逐文件穿透排除 | 统一文件树 | `src/ui/file-tree-picker.js`、`src/ui/host-bridge.js` 的 `exclude` 链路 |
| 一步直出目标布局（拉取时即指定目标格式） | `#target-select` | `src/core/plan-preview.js` 的路由/合成分支 |
| 拉取进度 / 断点续传 / 暂停收尾 | `#progress-container` + `#task-controls` | `src/core/task-manager.js`、`src/core/worker-client.js` |

### B. 包转换（三形态都有）

| 功能 | UI 入口 | 源码落点 |
| --- | --- | --- |
| 四布局互转 `st` / `l` / `tt` / `pt` | `#btn-convert` + `#target-select` | `src/core/transform.js`（`convert()` 主入口） |
| 转换前完全扫描与动作预测 | 计划摘要条 | `src/core/plan-preview.js` |
| 转换报告（复制/丢弃/合成计数 + 丢弃清单） | `#report-panel` | `src/core/report.js` |
| 剔除酒馆原生重复资产 | `#prune-builtin-check` | `src/core/builtin-assets.js` |
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
| 产物统一出口（不自动下载） | `src/ui/export-queue.js` |
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
| 结构化实时日志（级别过滤/复制/下载 `.log`） | `src/core/logger.js`、`src/ui/log-console.js` |
| 存储配额条 | `src/ui/usage-dashboard.js` |
| 宿主原生存储面板入口 | `#btn-storage-inspector`（`isStorageInspectorAvailable()`） |

### J. file:// 单文件离线产物（S7，2026-10-13）

| 功能 | 源码落点 |
| --- | --- |
| IIFE 单包 + CSS/字体内联 + 零外部请求 | `scripts/build-offline.mjs`、`scripts/offline/entry.js` |
| Worker 构建期换空实现（IIFE 不接受 `new Worker(new URL(...))`） | `src/core/worker-factory.js` + `scripts/offline/worker-factory.stub.js` |
| 运行期离线标记（确定走主线程降级） | `src/core/worker-client.js` 的 `isOfflineBuild()` |
| 验证 | `e2e/standalone/specs/offline-single-file.e2e.cjs`（28 断言） |

---

## 三、分层与硬性边界

```
src/core/     纯逻辑，**禁止 DOM / window / fetch**（可在 Node/Vitest 直接跑）
src/ui/       可 DOM；host-bridge.js 是宿主差异的唯一落点
src/storage/  IndexedDB + 可选 Authority 适配器
src/vendor/   zip.js / fzstd / fontawesome 本地副本 —— **勿升级改动**
public/       仅 file-protocol-notice.js
index.js      根控制器：detectHost → applyPluginUi → ExportQueue + TaskManager
```

不可越过的线（违反即返工）：

1. **CSS 双前缀**：所有规则必须带 `#app.app-container` / `.st-converter-drawer-app` 前缀，
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
npm run build:offline         # file:// 单文件离线产物
npm run e2e                   # 实例侧 E2E（需 Dev 实例；只连 Dev 白名单端口）
npm run e2e:web               # 独立 Web / 云子路径 / file:// 离线（不需要实例）
npm run e2e:web -- --rebuild  # 删/换过源码文件时必须加（mtime 判据看不见"删了文件"）
```

无独立 lint/typecheck —— 类型契约靠 JSDoc + 运行时守卫，**质量门槛就是 `npm test` 全绿**。

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

---

## 七、相关文档

- `.trellis/spec/frontend/` —— 分层规范（目录结构 / 组件 / 状态管理 / 宿主能力 / 质量 / DOM 写入作用域 / 迁移三篇）
- `.trellis/spec/backend/` —— 核心层规范
- `.trellis/workflow.md` —— 任务流
- [README.md](../README.md) —— 用户向说明
- [AGENTS.md](../AGENTS.md) —— 项目规则与统一开发规则
