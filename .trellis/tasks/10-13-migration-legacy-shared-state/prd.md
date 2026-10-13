# 旧资料兼容与向导共享状态（S5 第一步）

> 父任务：`10-01-safe-migration-productization`（S5 分片·第一步）。工作副本；规范条文最终落 `.trellis/spec/`。
> **本步不切默认入口**（默认入口切换是 S5 第二步，单独授权）；只做旧资料兼容与共享状态**接缝**。

## Goal

兑现 `R-10`（旧资料无损可读）：升级后旧工作区夹具仍可读；新保存不覆盖旧 `active_session`；不升 `DB_VERSION`、不清库；
无法续跑的旧任务有**明确安全重开路径**。同时为后续向导建立**唯一共享状态接缝**，避免向导与高级工作台各持一份配置。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R1 | 新增 `normalizeLegacySession(record)`（`src/core/migration-session.js`）：**纯函数**，把旧/缺字段的工作区会话归一（补 `schemaVersion`、标记 `legacy`），**不丢任何原字段** |
| R2 | 新增 `isResumableSession(record)`：判别旧会话能否安全续跑；**不能则返回 `{resumable:false, reason}`**（未知版本不「猜着续跑」，`spec §4`） |
| R3 | `saveWorkspaceState`（`src/storage/db.js`）**保存前把现有 `active_session` 备份为 `active_session_prev`**，使旧记录可回读；**不升 `DB_VERSION`** |
| R4 | 新增 `createMigrationSession()`（`src/ui/migration-controller.js`）：向导与工作台共享的**唯一**选择/任务状态接缝（`design.md` §3.1：单一用户意图） |
| R5 | 新增 `test/migration-legacy.test.js`：旧会话夹具（缺字段 / 旧 schemaVersion / 空）的归一与可续跑判别 |
| R6 | **不改默认入口**、不改 `workbench-template.js` 的 DOM 结构、不改 `index.html`；不新增依赖 |

## Acceptance Criteria

- [ ] **AC1** `normalizeLegacySession` 对缺字段旧记录补默认且**原字段不丢**（快照比对）；
- [ ] **AC2** `isResumableSession` 对「旧版本 / 缺断点 / 缺产物」返回不可续跑 + 原因；对完整记录返回可续跑；
- [ ] **AC3** `saveWorkspaceState` 后，`active_session_prev` 保存着**上一次**的记录（可回读）；
- [ ] **AC4** `DB_VERSION` 仍为 `2`（未升）；
- [ ] **AC5** `createMigrationSession` 提供单一读/写选择与任务的接缝（向导与工作台共享同一实例）；
- [ ] **AC6** 现有 `db-origin` / `convert-resume*` / `single-template-source` 测试不回归；`npm test` 全绿；五守卫 + `build` 零回归。

## Constraints

- **C1** `normalizeLegacySession` / `isResumableSession` / `createMigrationSession` 纯（无 DOM / `fetch`），Node 可测（`L1-MR-6`）。
- **C2** **不升 `DB_VERSION`、不清库、不删旧记录**（`R-10` / `design.md` §4）。
- **C3** 不改默认入口；不改模板 DOM；不新增依赖、不改 vendor。

## Out of Scope

- **默认入口切换**（S5 第二步）。
- 向导 UI 完整化（S5 后续）。
- 自动目标备份（S3 遗留）；目标侧读回核对（S4 遗留）。

## Open Questions

| 编号 | 问题 | 处置 |
| --- | --- | --- |
| OQ-1 | 旧会话「可续跑」的判据？ | 需同时有：断点清单、对应半成品存在标记、版本可识别；缺一即不可续跑（给重开路径） |
| OQ-2 | `active_session_prev` 只留一份还是多份？ | 本步**只留一份**（最小改动）；多版本历史留后续 |
