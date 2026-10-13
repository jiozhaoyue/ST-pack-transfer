# 迁移向导默认入口 · 强制不兼容 · 离线单文件 · 开发者文档

> 父任务：`10-01-safe-migration-productization`（安全迁移产品化）。本文件是**工作副本**，规范条文最终落 `.trellis/spec/`。
> 承接 `10-01/implement.md` 的 **S5 第二步 / S6 / S7** 与用户 2026-10-13 新增的两条产品裁定。

## Goal

把 10-01 已实现的「迁移计划 / 写入门禁 / 三类交付 / 核对四态 / 共享状态接缝」**接上默认入口**，
产出一个普通用户可用的迁移向导；同时按用户 2026-10-13 裁定：

1. **强制不兼容旧数据**（破坏性变更）——旧会话/旧工作区记录**一律作废**，不得静默归一或"尽力兼容"；
2. **交付开发者功能文档**——列清本仓现有全部功能与落点；
3. 兑现 S7：**真正的 file:// 单文件离线产物**（不是提示页）。

## 用户裁定记录（2026-10-13）

| 编号 | 决策点 | 用户选定 | 与既有规范的关系 |
| --- | --- | --- | --- |
| **U-1** | 旧数据兼容策略 | **禁止兼容旧数据**：任何旧格式（含结构未变的 v1）**强制判为不兼容**，显式拒绝并给安全重开路径，**不得**静默补齐字段后当新版用 | **推翻** `migration-compatibility-and-release.md` §3.1「旧状态保留可读」的**归一**部分与 §4「旧记录缺少新字段 ⇒ 只读解释或安全补齐显示模型」——现改为**硬拒绝**。**保留**"不删除旧包/半成品文件"（那是磁盘上的用户资产，不是会话状态） |
| **U-2** | 开发者文档 | 需要一份**展示已有全部功能**的开发者文档 | 新增 `docs/DEVELOPER-GUIDE.md` |
| **U-3** | 执行方式 | 不问下一个做什么、不问具体技术问题，一次做完 | 本任务不设"等用户裁决"的门，做完统一汇报 |

## Requirements

### B1 强制不兼容（U-1 · 破坏性变更）

1. `src/core/migration-session.js` 导出 `SESSION_SCHEMA_VERSION = 2`。
2. 新增 `classifySessionCompatibility(record)`，返回
   `{ compatible: boolean, action: 'continue-supported' | 'reject-incompatible', reason: string }`：
   - `record.schemaVersion !== 2`（含缺失、含 1、含 99）⇒ `compatible:false` + `reject-incompatible` + **明确中文原因**；
   - **结构未变的 v1 也必须被拒**（这是本次的核心：不做"看起来一样就放行"的推断）。
3. `isResumableSession(record)` **先过兼容判定**：不兼容即 `{resumable:false, reason}`，不进入断点/半成品判据。
4. **删除** `normalizeLegacySession` 的静默补齐语义；改为 `readSessionRecord(record)`——只做**只读解释**
   （原字段原样带出 + 兼容结论），**不写回、不补默认值**。
5. 拒绝文案必须**可执行**：说清"旧记录已作废 + 需从源重开"，不得出现"已续跑"。
6. `src/storage/db.js` 的 `saveWorkspaceState` 写入 `schemaVersion: 2`；
   `loadWorkspaceState` 读到不兼容记录时**照常返回原文**（不删、不覆盖），由上层按 `classifySessionCompatibility` 拒绝。
7. 旧记录的 `active_session_prev` 备份行为**保留**（那是"不丢用户数据"，不是"兼容旧格式"）。

### B2 迁移向导与默认入口（S5 第二步）

1. 新增 `src/ui/migration-wizard.js`：向导视图模块，步骤为
   **① 来源 → ② 目标 → ③ 范围 → ④ 检查 → ⑤ 执行 → ⑥ 核对**。
2. **默认入口 = 向导**；高级工作台保留，经同一页面上的「高级」开关切换，**不新开页面、不第二份模板**。
3. 向导与高级工作台**共享** `createMigrationSession()` 的选择/任务/计划；切换视图**不重置**对方状态。
4. 关键输入（源/目标/范围）变更 ⇒ `createMigrationPlan` 产出新 `revision`，旧确认失效。
5. 复杂 UI 走**官方支持位置**（本仓既有工作台容器内），设置抽屉只留入口；
   **不得**自造全站浮层（`L1-MR-4`）。
6. 可访问性：步骤导航可键盘操作、当前步骤有 `aria-current`、按钮有可读名称、进度更新走 `rAF` 合帧（`L1-MR-9`）。
7. 旧记录不兼容时，向导首屏显示**显式拒绝 + 从源重开**指引（B1 的消费点）。

### B3 file:// 单文件离线产物（S7）

1. 新增构建脚本产出**单个自包含 HTML**：JS（IIFE，非 module）与 CSS 全部内联，**零外部请求**。
2. 产物在 `file://` 下可完成「选包 → 转换 → 领取结果」；**不得**只显示提示页（`AC-14`）。
3. Worker 在离线产物中**强制关闭**（走既有主线程降级，`worker-client.js` 已具备）。
4. 同一核心与模板产出，**不手工维护第二份业务 HTML/JS**。
5. 现有 `npm run build`（GitHub Pages 形态）行为不变。

### B4 开发者功能文档（U-2）

1. 新增 `docs/DEVELOPER-GUIDE.md`：**功能清单**（按能力域）、每项的**入口文件与关键 API**、**三形态差异**、
   **质量门槛命令**、**破坏性变更登记**。
2. 文档必须与实现同步——不得出现"文档有、代码无"的功能。

### B5 质量门槛（S6）

1. `npm test` 全绿且相对基线（669 passed / 2 skipped）**零回退**。
2. 五条静态守卫 + `npm run build` 全绿。
3. 新增用例具备**负例判别力**（不是复述 mock）。

## Acceptance Criteria

- [ ] **AC-B1** `classifySessionCompatibility` 对 `schemaVersion` 缺失 / 1 / 99 一律返回 `reject-incompatible`，对 2 返回 `continue-supported`；v1 与 v2 **结构完全相同时仍拒 v1**（专门用例）
- [ ] **AC-B2** `isResumableSession` 对任何非 v2 记录返回 `resumable:false` 且 `reason` 非空；对 v2 完整记录返回 `true`
- [ ] **AC-B3** `normalizeLegacySession` 的"静默补默认值"语义已移除，且无任何生产代码仍依赖它
- [ ] **AC-B4** `db.js` 写入 `schemaVersion:2`；读到旧记录不删不覆盖（单测断言）
- [ ] **AC-B5** 向导为默认入口；「高级」开关可切到既有工作台，切换后选择/计划不丢（单测断言共享接缝）
- [ ] **AC-B6** 向导六步顺序存在，关键输入变更使旧 `revision` 失效（单测断言）
- [ ] **AC-B7** 向导节点全部有 `CONTROL_CONSUMERS` 声明，`check:control-consumer` 通过
- [ ] **AC-B8** `check:template-source`（含 `REQUIRED_TEMPLATE_IDS` 更新）、`check:css-scope`、`check:dom-injection`、`check:dom-scope` 全绿
- [ ] **AC-B9** 离线单文件产物构建成功，`file://` 下无外部请求且能完成一次真实转换（E2E 或等价自动化证据）
- [ ] **AC-B10** `docs/DEVELOPER-GUIDE.md` 就位，功能条目可逐条对应到源码落点
- [ ] **AC-B11** `npm test` ≥ 基线且零回退；`npm run build` 通过
- [ ] **AC-B12** 规范落 `.trellis/spec/`：`migration-compatibility-and-release.md` 按 U-1 改写（硬拒绝），新增离线与向导条文

## Constraints

- **C-1 不引新依赖 / 不加构建步骤**（`L1-MR-11`）；不改 `src/vendor/**`；不新增 npm 包。
- **C-2 三形态同构**：`src/core/**` 不得依赖 DOM；向导逻辑中可测部分留在纯层。
- **C-3 CSS 双前缀铁律**：新增样式一律 `.app-container` / `.st-converter-drawer-app` 前缀，配色走 `--SmartTheme*` + 回退值。
- **C-4 不破坏既有高级工作台功能**；不删除既有控件。
- **C-5 不删用户磁盘资产**：U-1 作废的是**会话状态**，不是用户的包/半成品文件。

## Out of Scope

- 不实现 S0 的「各异步阶段超时数值与测量」。
- 不做 S4 的「目标侧自动读回核对」与自动重发。
- 不清理实例历史数据；不连 Real 实例。

## Open Questions

无（用户 U-3 裁定：不问下一个做什么、不问具体技术问题）。
