# 核对报告与安全重试（S4）

> 父任务：`10-01-safe-migration-productization`（S4 分片）。工作副本；规范条文最终落 `.trellis/spec/`。
> 前置：S1 已实现 `evaluateWriteGate` / `assessRetry`；S3 已把写入门禁接入恢复路径。

## Goal

修一个**现状语义缺口**：恢复完成后，界面**只报「成功/失败」两态**（`index.js` 的 `runBatchRestore` 收尾与单条恢复三态），
没有 `MigrationOutcome` 四态，也不区分「已核对 / 人工确认 / 已接受缺项 / 待核对」。
⇒ 用户看到「恢复完成」却无法知道**到底核对到什么程度**（`R-05` / `AC-07`）。

本片落地**核对结论分类**与**核对证据**，并接 `assessRetry`（S1 已实现）到重试候选判定。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R1 | 新增 `classifyOutcome({ verification })`（`src/core/migration-evidence.js`）：**纯函数**，按 `VerificationEvidence[]` 判出 `MigrationOutcome` 四态 |
| R2 | 四态优先级：`failed` > `needs-verification` > `completed-with-exclusions` > `completed`；**无证据 ⇒ `needs-verification`**（未知不是完成） |
| R3 | 新增 `buildVerificationEvidence({ scopeRef, unit, method, coverage, status, reason })`：归一字段，非法值回落 `unknown` |
| R4 | `unit` ∈ `archive-entry` / `character` / `chat`（**不同口径不得相加当覆盖率**，`spec §3.3`）；`method` ∈ `automatic` / `user-attested`；`coverage` ∈ `full` / `sampled` / `unknown`；`status` ∈ `confirmed` / `accepted-exclusion` / `failed` / `unknown` |
| R5 | 恢复后（`index.js`）按 outcome 显示**不同文案**：`completed` 附核对方式、`completed-with-exclusions` 明确列遗漏、`needs-verification` 给检查步骤、`failed` 保留已成功项 |
| R6 | 重试候选只收 `assessRetry` 放行的项（`not-applied` + `repeatSafe` + 目标/计划未变）；**未知写入态不自动重试** |
| R7 | 新增 `test/migration-verification.test.js`：含「服务器写一半后客户端断开」夹具（未知写入态 ⇒ `needs-verification` 且不可自动重试） |
| R8 | 不新增依赖；不改 `restoreToHost` 语义；不改 `Report`（`src/core/report.js`）的既有转换计数 |

## Acceptance Criteria

- [ ] **AC1** `classifyOutcome` 四态判定与优先级正确；空证据 ⇒ `needs-verification`；
- [ ] **AC2** 「写一半后断开」夹具 ⇒ `needs-verification`，且 `assessRetry` 对未知写入态返回 `allowed=false`；
- [ ] **AC3** `buildVerificationEvidence` 归一非法值到 `unknown`（不抛错、不猜）；
- [ ] **AC4** 恢复路径按 outcome 显示对应文案（不把「已写入未核对」显示成「完成」）；
- [ ] **AC5** 现有 `restore-*` / `report` 测试不回归；
- [ ] **AC6** `npm test` 全绿；五守卫 + `build` 零回归。

## Constraints

- **C1** `classifyOutcome` / `buildVerificationEvidence` 纯（无 DOM / `fetch`），Node 可测（`L1-MR-6`）。
- **C2** 不改 `restoreToHost` / `createRestoreBatch` 内部；不改 `Report` 类。
- **C3** 不新增依赖、不改 vendor；不碰实例、不跑 E2E。

## Out of Scope

- **目标侧自动全量核对**（读回目标比对）留后续——本轮核对证据主要来自**写入返回**（`automatic`）与**人工确认**（`user-attested`）。
- 向导 UI（S5）；file:// 离线（S7）。

## Open Questions

| 编号 | 问题 | 处置 |
| --- | --- | --- |
| OQ-1 | 现状 `restoreResult` 能提供什么核对依据？ | `restoredCount` / `unconfirmed` / `nothingRestored`（`host-bridge` 返回体）；据此构造 `automatic` 证据；无法自动核对的类别标 `user-attested` 或 `unknown` |
| OQ-2 | `MigrationOutcome` 是否替换 `TaskManager` 状态？ | **不替换**（`design.md` §3.1）：它是核对**结论**，`TaskManager.state` 仍是运行真源 |
