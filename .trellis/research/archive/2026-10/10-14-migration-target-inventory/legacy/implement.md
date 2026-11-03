# 执行计划：目标清单读取与自动保底备份

> 每步顺序：先补失败测试 → 确认失败原因正确 → 最小实现 → 定向测试 → 相关全量回归 → diff → 规范同步。
> 提交用**显式 pathspec**，提交前校验暂存区恰等于本片集合（`L0-7(2)`）；推 `origin`，不推 `upstream`。

## 0. 前置

- [x] 现场取证：`index.js:2135` 写死 `targetManifest:null`；`host-bridge.js:725` `fetchHostBackup` 可用；
      `zip-io.js:104` `readZipEntryManifest` 只读中央目录；`transform.js:847` `routeSource` 可用。
- [x] 建立子任务并回填 `prd.md` / `design.md`。
- [x] `task.py start`（进入 in_progress）。

## 1. 纯模块 `src/core/target-inventory.js`

- [x] 先写 `test/target-inventory.test.js` 的失败用例：
  - [x] `buildTargetManifest`：归一（`\\`→`/`、NFKC、去前导 `./`）、去目录条目、去重、计数。
  - [x] `buildTargetManifest`：超 `maxPaths` ⇒ `truncated:true` 且 `paths.length === maxPaths`。
  - [x] `alignInventories`：`truncated` / `empty` / `partial`（缺全部标准根标记）/ `mismatch`（顶层段缺失）/ `aligned`。
  - [x] **判别力负例**：构造「目标清单只有 chats/，待写入含 characters/」⇒ 必须 `mismatch`（unknown），
        而**不是**「0 冲突 / 全新增」。
  - [x] `assessInventoryConflicts`：非 aligned ⇒ 与 `assessTargetConflicts({targetManifest:null})` **逐字段相等**。
  - [x] `assessInventoryConflicts`：aligned ⇒ `newCount` 随路径集变化，**不**等于 `incomingPaths.length` 的固定推导。
- [x] 实现 `ALIGNMENT` / `buildTargetManifest` / `alignInventories` / `assessInventoryConflicts`。
- [x] 定向跑 `npx vitest run test/target-inventory.test.js`。

## 2. 宿主接缝 `src/ui/host-bridge.js`

- [x] 新增 `fetchHostInventory({ platform, signal, onPhase, taskId })`：
  - [x] 复用 `fetchHostBackup(platform, null, …)`；`kind:'opfs'` ⇒ `opfsHandleToFile`。
  - [x] `readZipEntryManifest` 取条目名 → `buildTargetManifest`。
  - [x] 失败/取消/不支持 ⇒ `{manifest:null, file:null, reason}`，**不抛**。
- [x] 定向跑既有 `test/host-bridge*.test.js` 确认零回归。

## 3. 存储与呈现

- [x] `src/storage/db.js`：`ORIGINS.TARGET_BACKUP = 'target-backup'`。
- [x] `src/ui/export-queue.js`：`ORIGIN_LABELS` 加「目标保底备份」。
- [x] 跑 `npx vitest run test/db-origin.test.js`。

## 4. 编排接线 `index.js` + 模板

- [x] `src/ui/workbench-template.js`：恢复对话框加 `#btn-target-preflight` 与 `#restore-preflight-status`。
- [x] `scripts/single-template-source.js`：`REQUIRED_TEMPLATE_IDS` 加两个 id。
- [x] `scripts/control-consumer-guard.js`：`CONTROL_CONSUMERS` 加 `btn-target-preflight`。
- [x] `index.js`：
  - [x] `pendingTargetPreflight` 模块级状态 + 在 `resetRestoreBackupCheck()` 清空。
  - [x] `handleTargetPreflight()`：读包条目 → `routeSource` 归一 → `fetchHostInventory` →
        `assessInventoryConflicts` → 入队 + 落 IndexedDB → `buildTargetBackupEvidence({mode:'auto'})`。
  - [x] `buildRestoreGateContext()`：优先用 `pendingTargetPreflight`，带 targetRef / revision 失效判定。
  - [x] 目标身份或 revision 变化 ⇒ 弃用预检结果。
- [x] 跑 `npm run check:template-source` / `check:control-consumer` / `check:css-scope` / `check:dom-injection` / `check:dom-scope`。

## 5. 文档同步

- [x] `.trellis/spec/frontend/migration-safety-and-evidence.md` §3.2：把「目标侧自动读取清单仍待接入」
      改写为已接入 + 边界（对齐守卫四态、失败降级、留存判据）。
- [x] §3.1 补「自动备份留存判据 = 落工作区（IndexedDB）」。
- [x] `docs/DEVELOPER-GUIDE.md` 的已知限制清单同步（去掉「无目标侧读取清单」，保留「无写入后读回核对」）。

## 6. 全量验证

- [x] `npm test`（基线 768 passed / 2 skipped ⇒ 只增不减、0 failed）。
- [x] 五守卫 + `npm run build` + `npm run build:offline`。
- [x] `npm run e2e:web -- --rebuild`。
- [x] `git diff` 复核（范围门：`git status --short` 非空即逐条核对）。

## 7. 收口

- [x] 回填本任务 `prd.md` 的 AC 勾选（现场取证，不凭记忆）。
- [x] 回填 `10-01/implement.md` 的 S3/S4 注记（「目标侧读取清单」由待接入改为已接入）。
- [x] 追加 `journal-1.md` 一条 Session 记录（做了什么 / 读数 / 残留）。
- [x] `task.py archive`；提交 + 推送 origin。
