# 目标预检、备份与确认合并（S3）

> 父任务：`10-01-safe-migration-productization`（S3 分片）。工作副本；规范条文最终落 `.trellis/spec/`。
> 前置：S1 已实现 `evaluateWriteGate` / `assessRetry`；S2 已实现源端三类交付。

## Goal

修一个**现状安全缺口**：目标恢复路径**没有任何前置安全门**——`runBatchRestore`（[index.js:2026](index.js)）
与单条恢复（[index.js:2127](index.js)）都**直接**调 `restoreToHost`，只要用户点了「确认恢复」就写。
⇒ 「无备份 / 确认过期 / 目标变化 / 权限未知」时**照样写入**（`R-06` / `AC-05`）。

本片把 S1 的 `evaluateWriteGate` 接入恢复路径：**门禁不过 ⇒ 零写入**，并给出明确原因与替代路径。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R1 | 新增 `src/ui/migration-controller.js` 的 `guardedRestore({ plan, evidence, restoreFn })`：**先门禁后写入**；门禁不过时 `restoreFn` **一次都不调用** |
| R2 | 门禁不过时返回 `{ wrote: false, reasons }`，调用方据此提示；`reasons` 直传 `evaluateWriteGate` 的拒绝码 |
| R3 | 新增 `buildTargetEvidence({ platform, handle, planTargetRef, backupConfirmed })`：构造 `evaluateWriteGate` 消费的 evidence（`planRevision` / `targetRef` / `permission` / `confirmation` / `backup` / `inFlight`） |
| R4 | `workbench-template.js` 的恢复对话框加「我已备份目标数据」勾选（`#restore-backup-confirmed`）：勾选 ⇒ `backup.level='user-attested'`；不勾 ⇒ `level='none'`（门禁拒绝） |
| R5 | `index.js` 恢复路径接入：单条与批量**都**经 `guardedRestore`；**不得**保留绕过门禁的第二入口 |
| R6 | 门禁拒绝时**不改**现有提示风格，但要**说清原因**并给「原生导入指引」（`R-02`：ST 等无自动写入能力时） |
| R7 | 新增 `test/migration-target-gate.test.js`：用**记录调用次数的端口替身**验证「门禁不过 ⇒ 零写入」 |
| R8 | 不新增依赖、不改 `src/vendor/**`；**不改** `restoreToHost` 自身语义（门禁在其**之前**） |

## Acceptance Criteria

- [ ] **AC1** `guardedRestore` 在门禁不过时 `restoreFn` 调用次数为 **0**（端口替身计数断言）；
- [ ] **AC2** 门禁通过时 `restoreFn` 恰好调用 **1** 次，且返回值透传；
- [ ] **AC3** `buildTargetEvidence` 覆盖六字段，`backupConfirmed=false` ⇒ `backup.level='none'`（门禁拒绝）；
- [ ] **AC4** 恢复对话框勾选状态真实驱动 evidence（勾选 → 允许；不勾 → 拒绝）；
- [ ] **AC5** 现有 `restore-chain` / `restore-batch` / `restore-probe` / `restore-manifest` 测试**不回归**；
- [ ] **AC6** `npm test` 全绿；五守卫 + `build` 零回归。

## Constraints

- **C1** `guardedRestore` / `buildTargetEvidence` 必须纯（无 DOM / `fetch`），可在 Node 直接测（`L1-MR-6`）。
- **C2** 接入保守：门禁插在 `restoreToHost` **调用之前**；不改 `restoreToHost` / `createRestoreBatch` 内部。
- **C3** 不改 `index.html`（空骨架）；模板唯一源是 `workbench-template.js`（`check:template-source` 守卫）。
- **C4** 不新增依赖、不改 vendor；不碰实例、不跑 E2E。

## Out of Scope

- **自动目标备份**（调宿主端点落盘）留后续；本轮只做**手动声明**（`user-attested`）与门禁。
- 目标核对（S4）；控制器委托与向导（S5）。
- `mode='overwrite'` 的额外警告细化（`D-26`）留后续。

## Open Questions

| 编号 | 问题 | 处置 |
| --- | --- | --- |
| OQ-1 | `permission` 从哪来？ | 本轮取 `'granted'`（宿主同源已登录即视为有权限）；**权限探测**留 S3 后续或 S5 |
| OQ-2 | 「目标身份」用什么？ | `${platform}@${handle}`（`handle` 由 `getHandle()` 提供）；跨账户切换即 `target-changed` |
