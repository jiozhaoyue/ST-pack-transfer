# S4 技术设计：核对结论与重试

> 对应 `prd.md`（R1–R8 / AC1–AC6）。

## 1. 现状缺口

恢复完成后只有「成功 / 失败」两态（`index.js` 的 `runBatchRestore` 收尾与单条三态分支）。
无 `MigrationOutcome` 四态、无 `VerificationEvidence`、不区分核对程度（`R-05` / `AC-07`）。

## 2. `buildVerificationEvidence(input) -> VerificationEvidence`（纯）

```js
{
  scopeRef: string,          // 该证据覆盖的范围引用（包名 / 类目 / 项 id）
  unit: 'archive-entry'|'character'|'chat',
  method: 'automatic'|'user-attested',
  coverage: 'full'|'sampled'|'unknown',
  status: 'confirmed'|'accepted-exclusion'|'failed'|'unknown',
  reason: string,
}
```

- 非法枚举值**回落 `unknown`**（不抛错、不猜，`AC3`）。
- `unit` 缺失 ⇒ `'archive-entry'`（保守默认，最常见的包条目口径）。

## 3. `classifyOutcome({ verification }) -> MigrationOutcome`（纯）

优先级（`R2`）：

| 条件 | outcome |
| --- | --- |
| `verification` 为空/缺失 | `needs-verification` |
| 任一 `status==='failed'` | `failed` |
| 任一 `status==='unknown'` | `needs-verification` |
| 任一 `status==='accepted-exclusion'` | `completed-with-exclusions` |
| 全部 `status==='confirmed'` | `completed` |
| 其余 | `needs-verification` |

`MigrationOutcome` 是**核对结论**，**不替换** `TaskManager.state`（`design.md` §3.1）。

## 4. 从写入返回构造证据（`index.js` 侧，保守）

```js
function buildRestoreVerification(fileName, restoreResult) {
  // 宿主返回体三态（host-bridge）：unconfirmed / nothingRestored / restoredCount
  if (restoreResult && restoreResult.unconfirmed) {
    return [buildVerificationEvidence({ scopeRef: fileName, unit: 'archive-entry',
      method: 'automatic', coverage: 'unknown', status: 'unknown',
      reason: '响应体不可解析，写入状态未知' })];
  }
  if (restoreResult && restoreResult.nothingRestored) {
    return [buildVerificationEvidence({ scopeRef: fileName, unit: 'archive-entry',
      method: 'automatic', coverage: 'full', status: 'failed',
      reason: '宿主返回成功但未写入任何条目' })];
  }
  return [buildVerificationEvidence({ scopeRef: fileName, unit: 'archive-entry',
    method: 'automatic', coverage: 'full', status: 'confirmed',
    reason: '宿主确认写入' })];
}
```

> 现状**无目标侧读回核对**，故 `automatic` 证据的 `coverage` 只到「宿主确认写入」这一层，
> **不等于**「目标数据已逐条核对」——文案不得夸大（`spec §3.3`）。

## 5. 文案（`R5`）

| outcome | 文案要求 |
| --- | --- |
| `completed` | 「已写入并由宿主确认」，附核对方式（automatic），**不暗示逐条自动证明** |
| `completed-with-exclusions` | 「已完成，含已接受缺项」并**列出遗漏** |
| `needs-verification` | 「已写入但状态未确认」+ 给**目标内检查步骤** |
| `failed` | 「未能完成」但**保留已成功项与可取回产物**，不笼统说「什么都没做」 |

## 6. 重试接入（`R6`）

复用 S1 的 `assessRetry`：重试候选 = `observedState==='not-applied' && repeatSafe && currentTargetMatches && currentPlanMatches`。
**未知写入态一律不自动重试**（`AC2`）。本轮**只做判定**，不自动重发（自动重试留后续）。

## 7. 测试落点

`test/migration-verification.test.js`：
- `classifyOutcome` 四态 + 优先级 + 空证据；
- `buildVerificationEvidence` 归一非法值；
- 「写一半后断开」夹具：`unconfirmed` 证据 ⇒ `needs-verification`，且 `assessRetry({observedState:'unknown'})` ⇒ 不可重试。
