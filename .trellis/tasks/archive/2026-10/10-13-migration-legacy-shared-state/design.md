# S5 第一步技术设计：旧资料兼容与共享状态

> 对应 `prd.md`（R1–R6 / AC1–AC6）。

## 1. 现状

- `src/storage/db.js:340` `saveWorkspaceState` 直接 `put` `{key:'active_session', ...state}` —— **整体覆盖**，旧记录随即消失。
- `loadWorkspaceState`（`:354`）读 `'active_session'`。
- `DB_VERSION = 2`（`:11`）；`WORKSPACE` store `keyPath:'key'`（`:93`）。
- 无旧会话归一、无可续跑判别、无共享状态接缝。

## 2. `normalizeLegacySession(record)`（`src/core/migration-session.js`，纯）

```js
// 非对象 ⇒ null；否则：
{ ...record, schemaVersion: record.schemaVersion ?? 1, legacy: record.schemaVersion === undefined }
```

**不丢原字段**（先展开 `record`），只补 `schemaVersion` 与 `legacy` 标记。

## 3. `isResumableSession(record)`（纯）

判据（`OQ-1`）：**同时**满足才可续跑 ——
1. 有 `checkpoint`（断点清单，对象且非空）；
2. 有半成品线索：`checkpoint.opfsName` 或 `checkpoint.receivedBytes > 0`；
3. 版本可识别（`schemaVersion` 是已知值）。

否则 `{ resumable: false, reason }`，`reason` 说明缺哪一条（未知版本**不猜着续跑**，`spec §4`）。

## 4. `saveWorkspaceState` 备份旧记录（`src/storage/db.js`）

```js
export async function saveWorkspaceState(state) {
  if (!isStorageSupported()) return;
  // 保存前把现有 active_session 备份为 active_session_prev（旧记录可回读，R-10）
  const existing = await loadWorkspaceState();
  if (existing) {
    await runTransaction(STORES.WORKSPACE, 'readwrite',
      (store) => store.put({ ...existing, key: 'active_session_prev' }));
  }
  const record = { key: 'active_session', ...state, updatedAt: Date.now() };
  return runTransaction(STORES.WORKSPACE, 'readwrite', (store) => store.put(record));
}
```

- **不升 `DB_VERSION`**、不删旧记录（`AC4`）。
- `active_session_prev` 与 `active_session` 同 store、同 `keyPath`，无需 schema 变更。

## 5. `createMigrationSession()`（`src/ui/migration-controller.js`，纯）

```js
export function createMigrationSession() {
  let state = { selection: {}, taskId: null, plan: null };
  return {
    getState: () => ({ ...state }),
    setSelection: (selection) => { state = { ...state, selection: { ...selection } }; },
    setTask: (taskId) => { state = { ...state, taskId }; },
    setPlan: (plan) => { state = { ...state, plan }; },
  };
}
```

向导与高级工作台**共享同一实例**（`design.md` §3.1：单一用户意图，不各持一份配置）。

## 6. 回退点

撤回 `normalizeLegacySession` / `isResumableSession` / `createMigrationSession` 与 `saveWorkspaceState` 的备份行即回现状；
**不改默认入口**，故对用户行为零影响。

## 7. 测试落点

`test/migration-legacy.test.js`：
- `normalizeLegacySession` 原字段不丢（快照比对）+ 缺字段补默认 + 非对象 ⇒ null；
- `isResumableSession` 四分支（可续跑 / 缺断点 / 缺半成品 / 版本不可识别）；
- `createMigrationSession` 读写隔离（`getState` 返回拷贝，外部改动不影响内部）。
