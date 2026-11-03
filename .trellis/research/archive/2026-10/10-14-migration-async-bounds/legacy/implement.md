# 执行计划：异步阶段超时/取消边界与测量装置

> 顺序：先补失败测试 → 确认失败原因正确 → 最小实现 → 定向测试 → 全量回归 → diff → 规范同步。
> 提交用**显式 pathspec**，提交前校验暂存区恰等于本片集合（`L0-7(2)`）；推 `origin`，不推 `upstream`。

## 0. 前置

- [x] 现场取证：逐阶段列出现值（见 `prd.md` 背景表，全部带 `file:line`）。
- [x] 建立子任务并回填 `prd.md` / `design.md`。
- [x] `task.py start`（进入 in_progress）。

## 1. 纯模块 `src/core/stage-timings.js`

- [x] 先写 `test/stage-timings.test.js` 的失败用例：
  - [x] `begin/end` 累加 `ms` 与 `count`（注入时钟，读数精确可断言）。
  - [x] **未 `begin` 就 `end` ⇒ no-op**（读数里不出现该段）。
  - [x] **重复 `begin` 不重入**（保留首次起点，不静默覆盖）。
  - [x] `snapshot()` 只含已闭合段（进行中的段不出现）。
  - [x] `summary()` 按声明顺序、省略未出现的段。
- [x] 实现 `STAGE_LABELS` / `createStageRecorder`。
- [x] 定向跑 `npx vitest run test/stage-timings.test.js`。

## 2. 停滞守卫 `src/ui/fetch-bounds.js`

- [x] 先写失败用例（`test/fetch-bounds-stall.test.js` 或并入既有测试文件）：
  - [x] **AC-1 停滞必 settle**：替身 reader 先给一块、随后静默 ⇒ 在阈值内以 `TimeoutError` settle。
  - [x] **AC-1 判别力负例**：去掉守卫（`timeoutMs: 0`）⇒ 同一夹具**永不 settle**（用 `Promise.race` 断言超时窗口内无结果）。
  - [x] **AC-2 正常传输不受影响**：多块、每块间隔 < 阈值、**总时长远超**阈值 ⇒ 正常读完。
  - [x] 停滞时 `reader.cancel()` **被调用**（流被释放）。
- [x] 实现 `DOWNLOAD_STALL_TIMEOUT_MS` / `readStreamChunkBounded`。

## 3. 接线 `src/ui/host-bridge.js`

- [x] `fetchHostBackup` 增可选 `timings` 与 `stallTimeoutMs`：
  - [x] `credentials` 段包住 `getCsrfToken`/`getHandle`。
  - [x] `host-generate` 段包住 `await fetch(...)`（**不加**停滞守卫）。
  - [x] 首个 `transferring` 相位切到 `transfer` 段。
  - [x] 读循环改用 `readStreamChunkBounded`；循环结束 `end('transfer')`。
- [x] 不传 `timings` / `stallTimeoutMs` 时行为与改动前一致（默认路径零变化）。
- [x] 定向跑既有 `test/restore-chain.test.js` / `test/host-inventory.test.js` 确认零回归。

## 4. `index.js` 接线（1 处）

- [x] 宿主导出流程创建 recorder → 传 `fetchHostBackup` → 结束时一条 `logger.info` 分段读数。
- [x] 转换段在宿主导出路径上 `begin/end('convert')`。

## 5. 取证文档

- [x] 新建 `.trellis/spec/frontend/async-bounds.md`（**自包含**：阶段 / 边界 / 取消路径 /
      `file:line` / 取值理由 / 测量方法），登记「待实测校准」项。
- [x] `10-01/implement.md` 的 S0 两未勾项勾选并注记。
- [x] `docs/DEVELOPER-GUIDE.md` §6「各异步阶段超时数值与测量」行同步。

## 6. 全量验证

- [x] `npm test`（基线 790 passed / 2 skipped ⇒ 只增不减、0 failed）。
- [x] 五守卫 + `npm run build` + `npm run build:offline`。
- [x] `npm run e2e:web -- --rebuild`。

## 7. 收口

- [x] 回填 `prd.md` 的 AC（现场取证）。
- [x] 追加 `journal-1.md` 一条 Session 记录。
- [x] `task.py archive`（`--skip-branch-validation`）；提交 + 推送 origin。
