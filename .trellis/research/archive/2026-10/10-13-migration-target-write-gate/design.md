# S3 技术设计：目标写入门禁

> 对应 `prd.md`（R1–R8 / AC1–AC6）。

## 1. 现状缺口

恢复路径无前置门禁：`runBatchRestore`（`index.js:2026-2087`）与单条恢复（`index.js:2096-2140`）
在用户点「确认恢复」后**直接** `restoreToHost`。⇒ 无备份也写（`R-06` / `AC-05`）。

## 2. `guardedRestore({ plan, evidence, restoreFn })`（纯编排）

```js
export async function guardedRestore({ plan, evidence, restoreFn }) {
  const gate = evaluateWriteGate(plan, evidence);
  if (!gate.allowed) {
    return { wrote: false, reasons: gate.reasons };
  }
  const result = await restoreFn();
  return { wrote: true, result, reasons: [] };
}
```

- **关键不变量**：`gate.allowed === false` 时 `restoreFn` **一次都不调用**（`AC1`）。
- `restoreFn` 由调用方注入（`() => restoreToHost(...)`），故可测。
- 不吞异常：`restoreFn` 抛错原样上抛（门禁只管「是否该写」，不管「写的结果」）。

## 3. `buildTargetEvidence({ platform, handle, planTargetRef, backupConfirmed, planRevision, permission })`

```js
{
  planRevision,                        // 必传（= plan.revision）
  targetRef: `${platform}@${handle}`,  // 当前目标身份
  planTargetRef,                       // 计划生成时的目标身份
  permission: permission || 'granted', // OQ-1：本轮默认 granted
  confirmation: { valid: true },       // 用户在恢复对话框点「确认恢复」即视为有效
  backup: backupConfirmed
    ? { level: 'user-attested', targetRef: `${platform}@${handle}`, scope: 'matches-write', retention: 'confirmed' }
    : { level: 'none' },
  inFlight: isRestoreInFlight(),       // 由调用方传入布尔，保持纯函数
}
```

`inFlight` 由调用方求值后传入（`guardedRestore` / `buildTargetEvidence` 自身不 import `host-bridge`，保持纯）。

## 4. UI：恢复对话框加备份勾选

`workbench-template.js`（322-343）的 `.restore-modal-card` 在模式选择与按钮之间加：

```html
<label class="checkbox_label flex-container" id="restore-backup-label">
  <input type="checkbox" id="restore-backup-confirmed">
  <div class="radio-text">我已备份目标数据（写入前保底）</div>
</label>
```

- 勾选 ⇒ `backupConfirmed=true`；不勾 ⇒ `false`（门禁 `no-target-backup` 拒绝）。
- 对话框打开时**重置为未勾选**（不复用上次勾选，避免静默通过）。
- 不新增 CSS 类（复用 `checkbox_label` / `radio-text` —— 但**注意 `L1-MR-3`**：模板里的类名由宿主原生样式提供，
  本插件不在 `style.css` 里给裸类加规则，故复用安全）。

## 5. `index.js` 接入点（两处，保守）

| 路径 | 现状 | 接入后 |
| --- | --- | --- |
| 单条（`btnConfirmRestore`） | 直接 `restoreToHost` | 构造 plan/evidence → `guardedRestore`；拒绝则提示 + 零写入 |
| 批量（`runBatchRestore`） | 每项 `restoreToHost` | 开批前**一次**门禁；拒绝则整批零写入 |

计划构造：`createMigrationPlan({ source: { layout: <目标包布局> }, target: { layout: hostLayoutCode(host.platform) }, requestedSelection: {}, capabilities: {} })`——
S3 只关心**目标端写入**，`requestedSelection`/`capabilities` 在此场景留空（写入门只看 `targetWrite` 与 evidence）。

> ⚠️ `capabilities` 留空 ⇒ `targetWrite='unknown'`（不拦），故 **ST 的无恢复能力仍由既有 `RESTORE_UNSUPPORTED` 兜底**（`host-bridge`）。
> S3 不重复实现该判定（避免两处判定分叉）。

## 6. 不变量与回退

- **`restoreToHost` 语义不变**：门禁在其**之前**，拒绝时它根本不被调用。
- **无第二入口**（`R5`）：单条与批量都经 `guardedRestore`；`createRestoreBatch` 的 `restoreOne` 内部不再各自判门。
- **回退点**：撤回 `guardedRestore` 调用与 UI 勾选即回到现状；不影响已写数据。

## 7. 测试落点

`test/migration-target-gate.test.js`：
- 端口替身 `let calls = 0; const restoreFn = async () => { calls++; ... }`；
- 门禁不过（无备份 / 确认过期 / 目标变化 / 有在途）⇒ `calls === 0`；
- 门禁通过 ⇒ `calls === 1` 且返回值透传；
- `buildTargetEvidence` 六字段与 `backupConfirmed` 分支。
