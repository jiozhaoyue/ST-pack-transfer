# 统一迁移计划与纯安全判定（S1）

> 父任务：`10-01-safe-migration-productization`（S1 分片）。本文件是**工作副本**，规范条文最终落 `.trellis/spec/`。
> 前置：S0 取证已完成（`10-01/research/host-capability-matrix.md`、`selection-semantics.md`、`retry-boundaries.md`）。

## Goal

把「用户意图 → 不可变迁移计划 → 写入前安全判定」抽成**纯数据层**（`src/core/`，无 DOM、无网络），
让向导与高级工作台后续共用同一份判定，且**不能靠 UI 禁用按钮**代替核心门禁。
本片**只新增纯逻辑与测试**，不接任何入口、不碰实例、不改现有行为。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R1 | 新增 `src/core/migration-plan.js` 的 `createMigrationPlan(input) -> MigrationPlan`：纯函数式，输入含 `source` / `target` / `requestedSelection` / `excludedPaths` / `capabilities` / `options`，输出**不可变快照**（含 `revision`），不读 DOM、不发请求 |
| R2 | 计划必须**分开** `requested`（用户请求）与 `effective`（真正进产物），并逐项记录**排除原因**（`selection-semantics.md` §1） |
| R3 | `requested` 必须来自**显式传入的快照**，**不得**读取被 `renderCategoryStats` 改写的 `currentSelection`（`selection-semantics.md` §3 的污染源） |
| R4 | 新增 `src/core/migration-evidence.js` 的 `evaluateWriteGate(plan, evidence) -> {allowed, reasons}`：纯判定，覆盖「无备份 / 确认过期 / 目标变化 / 权限未知 / 无写能力 / 有在途」 |
| R5 | 新增 `assessRetry(itemEvidence) -> {allowed, reason}`：判据按 `retry-boundaries.md` §3，**未知写入状态一律不可自动重试** |
| R6 | 能力矩阵按 **category 分组**、四维 `sourceRead` / `formatConvert` / `targetWrite` / `targetVerify`，各 `available` / `unavailable` / `unknown`（`design.md` §3，`host-capability-matrix.md`） |
| R7 | **不改**现有入口与行为：旧按钮、`generatePlan`、`convert`、`restoreToHost` 全部不动；本片是**新增**模块 + 新增测试 |
| R8 | 不新增依赖、不改 `src/vendor/**`、不新增 npm 包（`L1-MR-11` / `C-4`） |

## Acceptance Criteria

- [ ] **AC1** `createMigrationPlan` 对「10 标准类目默认全选」输入，产出计划的 `requested` 与 `effective` 分列且可核；
- [ ] **AC2** 旧选择污染负例：即使模块级 `currentSelection` 被渲染改写为 `false`，只要**显式快照**传入为 `true`，计划 `requested` 仍为 `true`（证明不读污染源）；
- [ ] **AC3** `evaluateWriteGate` 负例**全覆盖**：无备份证据 / 确认 revision 过期 / 目标身份变化 / 权限未知 / 目标 `targetWrite=unavailable`（如 ST）/ 有在途恢复 ⇒ 均 `allowed=false` 且 `reasons` 指出具体缺项；
- [ ] **AC4** `assessRetry`：非 404/405 的写入失败、未知写入状态、目标或计划已变化 ⇒ `allowed=false`；幂等且已证未应用的源读取/转换项 ⇒ `allowed=true`；
- [ ] **AC5** 对同一夹具，新计划的 `effective` 集合与既有 `generatePlan` 的选中集合**一致**；任何差异必须在测试里显式断言并解释（`implement.md` §3 要求）；
- [ ] **AC6** 变异判别力：把「确认 / 备份 / 未知状态」三类保护各**移除一处**后，对应的负例测试**必须失败**（证明测试不是复述 mock）；
- [ ] **AC7** `npm test` 全绿；五条静态守卫 + `npm run build` 零回归（相对开工基线）；
- [ ] **AC8** 本片新增的判定契约落 `.trellis/spec/frontend/migration-safety-and-evidence.md`（自包含，含 `file:line`）。

## Constraints

- **C1** 纯前端：新模块**禁止** DOM / `fetch` / `window` 依赖，须能在 Node/Vitest 直接跑（`L1-MR-6` 三形态同构）。
- **C2** 不改产品现有行为；不改 `index.js` / `host-bridge.js` / 模板（那是 S2/S3/S5 的范围）。
- **C3** 不新增依赖、不改 vendor。
- **C4** 不碰实例、不发网络请求、不运行 E2E（`ready-decisions.md`：本轮未授权实例写入）。

## Out of Scope

- 不接向导 UI、不改默认入口（S2/S5）。
- 不做目标核对实现（S4）。
- 不做 PT 原生归档转换（独立格式适配分片）。
- 不升级 `DB_VERSION`、不动旧工作区（S5）。

## Open Questions

| 编号 | 问题 | 处置 |
| --- | --- | --- |
| OQ-1 | 「默认全选」以 `currentSelection`（13 键）还是 `FULL_SELECTION`（10 键）为准？ | `selection-semantics.md` §2 暴露的缺口；本片按 `D-07` 取「10 标准类目全选 + backups/cache/appPrivate 走独立 include 标志」，并把该口径写进计划契约与 spec |
| OQ-2 | `evaluateWriteGate` 的 `evidence` 结构由谁产出？ | 本片只定**消费**契约（纯判定）；证据**产出**归 S3。本片测试用合成 evidence |
