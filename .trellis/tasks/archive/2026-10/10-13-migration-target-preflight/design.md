# 设计：目标预检与备份证据（S3 剩余项）

## 1. 分层与职责（模块化重点）

| 模块 | 职责 | 边界 |
| --- | --- | --- |
| `src/core/migration-target.js`（新增·纯） | 冲突评估 / 备份证据构造 / 面向界面的呈现 / 写能力指引 | 禁 DOM、禁网络、禁 `src/ui`；无第三方依赖 |
| `src/core/migration-evidence.js` | 写入门禁 + 重试判定 + 核对四态 | 只**读** `conflicts.state` 作一门，不构造冲突 |
| `src/ui/migration-controller.js` | 证据装配（`buildTargetEvidence`）+ 门禁编排（`guardedRestore`） | 纯函数；不 import host-bridge |
| `src/ui/host-bridge.js` | 宿主调用（自动备份执行、目标清单读取） | 本片**未接入**，接口留待后续 |
| `index.js` | 恢复对话框接线（读勾选 → evidence） | 只做取值与展示 |

**不耦合原则**：门禁不知道「冲突从哪来」，只判 `state`；冲突评估不知道「怎么写」，只比路径；
两者不互相 import，经 `evidence` 字段对接（依赖倒置）。

## 2. 契约

### `assessTargetConflicts({ targetManifest, incomingPaths })`
- `targetManifest == null` ⇒ `{ state:'unknown', conflictCount:null, newCount:null, conflicts:[] }`。
- 否则归一化比较 ⇒ `{ state:'known', conflictCount, newCount, conflicts }`。
- 归一：`NFKC` → `\`→`/` → 去前导 `./` → 小写。

### `buildTargetBackupEvidence({ mode, targetRef, artifact, userConfirmed })`
- `auto`：`readable && scope==='matches-write' && retained` ⇒ `readback-verified`（`retention:'confirmed'`）；
  否则 `none` + `reason`（列出缺项）。
- `manual`（缺省）：`userConfirmed` ⇒ `user-attested`；否则 `none`。
- **不变量**：`manual` 路径永不产 `readback-verified`（人工声明 ≠ 机器核对）。

### 门禁新增门
`evaluateWriteGate`：`ev.conflicts?.state==='unknown'` 且 `confirmation.acknowledged.conflictUnknown !== true`
⇒ 追加 `conflict-unknown-unacknowledged`。**仅在提供 `conflicts` 时生效**（向后兼容）。

### `buildTargetEvidence` 扩展
新增可选 `backup`（优先于 `backupConfirmed`）、`conflicts`、`conflictAcknowledged`；
`confirmation` 变为 `{ valid, acknowledged:{ conflictUnknown } }`。

## 3. 取舍

- 冲突评估**只做纯比较**，不猜目标内容；读不到就是 unknown。
- 备份证据**自动路径不部分放行**：任一条件缺失即 `none`（宁可要求用户确认，不冒险）。
- 呈现层与判定层**分离**（`describe*` 纯函数），便于界面按证据级别分别展示且可单测。
- 恢复流程读不到目标清单（宿主无「列用户文件」端点）⇒ 冲突恒 `unknown` ⇒ 对话框强制确认风险。

## 4. 兼容性

- 未提供 `conflicts` 的既有调用**零变化**（门不触发）。
- `buildTargetEvidence` 旧参数 `backupConfirmed` 保留，行为不变。
- 模板新增 `#restore-conflict-ack`（控件消费守卫已声明）。
