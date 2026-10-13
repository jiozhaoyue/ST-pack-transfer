# 迁移目标预检与备份证据（S3 剩余项）

> 父任务：`10-01-safe-migration-productization`。补 `10-13-migration-target-write-gate` 留下的两个缺口：
> **冲突未知判定**与**自动/手动备份证据**（`migration-safety-and-evidence.md` §3.1/§3.2、`AC-05`）。

## Goal（目标）

目标写入前，用户能看到「目标是否有同名冲突（读不到就说未知，**不是 0**）」与「备份是**机器验证**还是
**人工确认**」；写入门禁在**冲突状态未知**时要求用户**显式确认风险**才放行。

## Requirements（需求）

| 编号 | 要求 |
| --- | --- |
| R1 | 目标预检：读得到目标清单才比较；**读不到一律 `unknown`，`conflictCount:null`**（不得当 0，也不得由源包条目数推新增数）。路径经 NFKC + 分隔符 + 大小写归一。 |
| R2 | 备份证据：**自动优先 / 手动声明保底**。`auto` 仅在「可读 + 范围 `matches-write` + 已留存」三者齐备才 `readback-verified`；`manual` 仅在用户确认时 `user-attested`，**绝不**升级为 `readback-verified`。 |
| R3 | 呈现分离：`machineVerified` 与 `userAttested` **分别呈现**；冲突 `unknown` **不显示成「无冲突」**。 |
| R4 | 门禁：新增 `conflict-unknown-unacknowledged` —— **提供 `evidence.conflicts` 且为 `unknown` 时**要求 `confirmation.acknowledged.conflictUnknown===true`（未提供 `conflicts` 则该门不生效，既有调用零变化）。 |
| R5 | 自动写能力判定 + **原生指引**（`unavailable`/`unknown` 时不得当作可写，也不得以真实破坏性请求探测）。 |
| R6 | **模块化**：目标预检/备份/呈现落在**独立纯模块** `src/core/migration-target.js`，不耦合 `migration-evidence.js` 的门禁与 `host-bridge.js` 的宿主调用。 |

## Acceptance Criteria（验收标准）

- [x] AC-1（R1）：`assessTargetConflicts` 对 `targetManifest:null` 返回 `state:'unknown'` 且 `conflictCount:null`；有清单时按归一化路径比较出冲突/新增数。
- [x] AC-2（R2）：`auto` 缺任一条件降级 `none` 并给出缺项；`manual` 即使误传 artifact 也**不**产出 `readback-verified`（判别力用例）。
- [x] AC-3（R3）：`describeBackupEvidence` 对 `readback-verified`/`user-attested` 分别置 `machineVerified`/`userAttested`；`describeConflictState` 对 `unknown` 的 `showsNoConflict=false`。
- [x] AC-4（R4）：冲突未知未确认 ⇒ 门禁拒绝（含码）；确认后放行；`known` 或不提供 `conflicts` ⇒ 该门不触发。
- [x] AC-5（R5）：`describeTargetWriteCapability` 三态 + 指引。
- [x] AC-6（R6）：纯模块无 DOM/网络/`src/ui` 依赖；`migration-controller.js` 只做薄接线。
- [x] AC-7：`npm test` 零回退（含新增 25 用例）；五守卫 + build + build:offline + 独立形态 E2E 全绿。

## 范围外

- 宿主侧**自动备份执行**（触发 `/api/users/backup`、校验可读、落工作区留存）——仍属 `host-bridge` 职责，本片只交付纯判定与呈现。
- 目标侧**自动读取清单**（宿主若提供列文件端点）——同上。
