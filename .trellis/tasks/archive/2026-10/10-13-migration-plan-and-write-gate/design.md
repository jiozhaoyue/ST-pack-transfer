# S1 技术设计：统一迁移计划与纯安全判定

> 对应 `prd.md`（R1–R8 / AC1–AC8）。设计依据：`10-01/design.md` §3、S0 三份取证。
> 本设计**只新增** `src/core/` 纯逻辑模块，不触碰现有入口。

## 1. 边界与不变量

- **纯逻辑**：`migration-plan.js` / `migration-evidence.js` 不得 import DOM、`window`、`fetch`、`src/ui/**`（`L1-MR-6`）。
- **不可变快照**：`createMigrationPlan` 返回的对象 `Object.freeze` 深度冻结；`revision` 随任一关键输入变化而**单调递增**。
- **同一快照**：计划 / 预览 / 执行 / 报告只消费同一个 `MigrationPlan`（`design.md` §3.1），不得从 DOM 临时重建。
- **不重算**：计划**不**重新扫描 zip；`effective` 由既有 `generatePlan` 的输出（`src/core/plan-preview.js:413-434`）**映射**而来。

## 2. `createMigrationPlan(input) -> MigrationPlan`

### 2.1 输入

```js
{
  source:   { layout: 'st'|'l'|'tt', handle: string },   // 布局码；PT_NATIVE/UNKNOWN 不进入
  target:   { layout: 'st'|'l'|'tt'|'pt' },
  requestedSelection: Record<string, boolean>,   // 10 标准类目；**显式传入**，不读模块级 currentSelection
  excludedPaths: string[],                        // 单项穿透排除
  specials: { backups: boolean, cache: boolean, appPrivate: boolean },  // 独立标志
  capabilities: Record<string, CapabilityCell>,   // 见 §4；缺省则整体 unknown
  basePlan: object|null,                          // 既有 generatePlan 输出；提供时用于映射 effective
  revisionSeed: number|string,                    // 可选；缺省用调用计数/时间
}
```

### 2.2 输出（`MigrationPlan`，冻结）

```js
{
  revision,                       // 不可变标识（number）
  createdAt,
  source, target,                 // 归一后的 source/target
  requested: {
    selection,                    // 10 标准类目布尔快照（拷贝）
    excludedPaths,                // 数组拷贝
    specials,                     // 拷贝
  },
  effective: {
    selectedCount, selectedBytes, // 来自 basePlan.expectedOutputFiles/Bytes（无 basePlan 则为 0 + unknown 标记）
    byCategory,                   // 从 basePlan.categories 映射
    exclusions: [ { path, reason } ],  // 排除项 + 原因（类目未勾选 / 单项排除 / 平台 DROP）
  },
  capabilities,                   // 拷贝
  options,                        // 其余选项透传
  basePlanProvided: boolean,      // 诚实标记：effective 是否有真实来源
}
```

### 2.3 关键行为

- **污染隔离（AC2）**：`requested.selection` 一律来自 `input.requestedSelection`；函数体内**不引用** `src/ui/category-filter.js` 的 `currentSelection`。
- **requested vs effective（R2）**：`requested` 是输入意图；`effective` 从 `basePlan` 映射。二者**不互相推导**。
- **排除原因（R2）**：`effective.exclusions` 逐项给出 `path` + `reason`，来源 = `basePlan` 中 `selected===false` 的条目。
- **默认全选口径（OQ-1）**：调用方传入的 `requestedSelection` 若省略，模块内**不擅自补默认**——默认由调用方（S2/S5）按 `D-07` 生成；本片测试显式构造「10 标准类目全选」输入。

## 3. `evaluateWriteGate(plan, evidence) -> { allowed, reasons }`

### 3.1 证据结构（消费契约；产出归 S3）

字段与 `.trellis/spec/frontend/migration-safety-and-evidence.md` §3.1 **逐字对齐**：

```js
{
  planRevision,                      // 必须等于 plan.revision
  targetRef,                         // 当前目标身份（宿主+用户）
  planTargetRef,                     // 计划生成时的目标身份
  permission: 'granted'|'denied'|'unknown',
  confirmation: { valid: boolean },  // 当前操作的明确确认（不可从源端授权继承）
  backup: { level: 'none'|'user-attested'|'readback-verified',
            targetRef, scope: 'matches-write'|'partial'|'unknown',
            retention: 'confirmed'|'unconfirmed' },
  inFlight: boolean,                 // 是否已有同一写操作在途
}
```

### 3.2 判定矩阵（**任一命中即 `allowed=false`**，不短路）

| 条件 | `reason` 码 |
| --- | --- |
| `plan` 缺失 / 非冻结计划 | `no-plan` |
| `planRevision !== plan.revision` | `confirmation-stale` |
| `confirmation.valid !== true` | `confirmation-invalid` |
| `targetRef !== planTargetRef` | `target-changed` |
| `inFlight === true` | `restore-in-flight` |
| `capabilities[target].targetWrite === 'unavailable'` | `target-write-unsupported` |
| `permission === 'unknown'`（含未提供） | `permission-unknown` |
| `permission === 'denied'` | `permission-denied` |
| `backup.level` 缺失或 `'none'` | `no-target-backup` |
| `backup.targetRef !== targetRef` | `backup-wrong-target` |
| `backup.scope !== 'matches-write'` | `backup-scope-mismatch` |
| `backup.retention !== 'confirmed'` | `backup-retention-unconfirmed` |

`allowed === reasons.length === 0`。**核心调用前门禁**：本函数是唯一判定点，UI 不得以「禁用按钮」代替调用它（`design.md` §3.4）。

## 4. `CapabilityCell`（能力格）

```js
{ sourceRead, formatConvert, targetWrite, targetVerify,   // 各 'available'|'unavailable'|'unknown'
  permission: 'granted'|'denied'|'unknown', reason: string, evidence: string }
```

`unknown` **不等于** `available`（`R-05`：未知不是零）。`evaluateWriteGate` 对 `targetWrite==='unknown'` 的处理：
**不拒绝**（未知不等于不支持），但**也不放行无备份写入**——备份门仍独立生效。

## 5. `assessRetry(itemEvidence) -> { allowed, reason }`

### 5.1 输入

字段对齐 spec §3.4：

```js
{ observedState: 'not-applied'|'applied'|'unknown',  // 观测写入状态（证据，非界面态）
  repeatSafe: boolean,                                // 幂等或可拆分（按 retry-boundaries §1）
  currentTargetMatches, currentPlanMatches }          // 均须为 true 才具备候选资格
```

### 5.2 判定（顺序即优先级）

1. `currentTargetMatches !== true || currentPlanMatches !== true` → `{allowed:false, reason:'invalidated'}`
2. `observedState === 'unknown'`（含未提供）→ `{allowed:false, reason:'unknown-write-state'}`
3. `observedState === 'applied'` → `{allowed:false, reason:'already-applied'}`
4. `observedState === 'not-applied' && repeatSafe` → `{allowed:true, reason:'safe-to-retry'}`
5. 其余 → `{allowed:false, reason:'not-repeat-safe'}`

## 6. 与既有模块的关系

| 既有 | 关系 |
| --- | --- |
| `src/core/plan-preview.js` `generatePlan` | 计划的 `effective` **映射自**其输出；本片**不改**它 |
| `src/ui/category-filter.js` `currentSelection` | **不读**（污染源，见 `selection-semantics.md` §3）；调用方负责提供干净快照 |
| `src/core/task-manager.js` | 无关；本片不碰运行状态机（`MigrationOutcome` 是核对结论，非第二套状态机） |
| `src/ui/host-bridge.js` 能力探测 | 本片只消费 `capabilities`；`hostSelectionCapability` 等**不改** |

## 7. 回退点

本片**未接任何入口** ⇒ 撤回两个新模块与两个新测试文件即可完全回退，**不影响任何用户数据与现有行为**。
