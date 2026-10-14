# 设计：异步阶段超时/取消边界与测量装置

## 1. 边界与分层

| 组件 | 落点 | 理由 |
| --- | --- | --- |
| 分段计时记录器 | `src/core/stage-timings.js`（**新**） | 纯逻辑（注入时钟），`src/core/` 禁 DOM；Node 可直测 |
| 停滞守卫 `readStreamChunkBounded` | `src/ui/fetch-bounds.js`（**改**） | 与既有有界等待同址；「超时 vs 取消」的既有取舍在此已定型 |
| 导出链路接线 | `src/ui/host-bridge.js`（**改**） | 宿主差异只许进桥接层（`L0-9`） |
| 读数出口 | `index.js`（**改**，仅 1 处） | 只在宿主导出完成时写一条日志（避免高频输出，`L1-MR-9`） |

## 2. `src/core/stage-timings.js`

```js
export const STAGE_LABELS = Object.freeze({
  CREDENTIALS: 'credentials',   // 取凭证 / 用户信息
  HOST_GENERATE: 'host-generate', // 宿主打包（TTFB 之前）
  TRANSFER: 'transfer',         // 包体传输
  CONVERT: 'convert',           // 转换
});

export function createStageRecorder({ now = () => Date.now() } = {}) {
  // 返回 { begin(label), end(label), snapshot(), summary(), reset() }
}
```

**语义（AC-4 的判据）**：

- `begin(label)` 打开一段；**重复 begin 不重入**（保留首次起点），否则嵌套会静默覆盖外层的起点。
- `end(label)` 累加 `ms` 与 `count` 后关闭；**未 `begin` 就 `end` 是 no-op**（不产生负值 / 不污染读数）。
- `snapshot()` → `{ [label]: { ms, count } }`（仅含**已闭合**的段；进行中的段不出现在读数里）。
- `summary()` → 人类可读一行，按 `STAGE_LABELS` 声明顺序输出，未出现的段省略。
- 时钟**注入**（`now`），故测试可精确断言，不依赖真实时间。

## 3. 停滞守卫 `readStreamChunkBounded`

```js
export const DOWNLOAD_STALL_TIMEOUT_MS = 60_000;

export function readStreamChunkBounded(reader, { timeoutMs = DOWNLOAD_STALL_TIMEOUT_MS, label = '接收数据' } = {})
  // → Promise<{done, value}>；停滞 ⇒ 先 reader.cancel() 再 reject(TimeoutError)
```

- **只守「两次字节到达之间的间隔」**，不守总时长（AC-2）：只要字节持续到达，守卫永不触发，
  哪怕总时长远超阈值。
- `timeoutMs <= 0` ⇒ 直接透传 `reader.read()`（不设守卫）——给「确实不需要」的调用方留出口，
  与 `fetchWithTimeout` 的 `timeoutMs <= 0` 同义。
- 停滞时**必须** `reader.cancel()`：否则底层流仍被锁住，`fetch` 的 body 不会释放，
  等于把「无界等待」从 promise 挪到流上。
- 抛 `TimeoutError`（既有类型），**不是** `AbortError` —— 与用户主动取消可区分（PRD Constraints）。

## 4. `host-bridge.js` 接线

`fetchHostBackup(platform, selection, { onPhase, taskId, signal, resumeCheckpoint, timings, stallTimeoutMs })`：

```
timings?.begin('credentials')  →  await Promise.all([getCsrfToken(), getHandle()])  →  timings?.end('credentials')
timings?.begin('host-generate') →  await fetch(...)                                  （TTFB 前，不设停滞守卫）
   首个 transferring 相位      →  timings?.end('host-generate'); timings?.begin('transfer')
循环内                        →  readStreamChunkBounded(reader, { timeoutMs: stallTimeoutMs })
循环结束                      →  timings?.end('transfer')
```

- `timings` 可选：不传即零行为变化（既有调用点 `fetchHostInventory` / 聊天库路径不受影响）。
- `stallTimeoutMs` 默认 `DOWNLOAD_STALL_TIMEOUT_MS`；`0` 关闭守卫。
- 停滞抛出的 `TimeoutError` 落进既有 `catch` 的**真实错误**分支（清理 OPFS 半成品后上抛），
  **不**改该分支的条件——避免把「停滞」混进「用户暂停」的语义里。

## 5. `index.js` 接线（仅 1 处）

宿主导出流程创建 `const timings = createStageRecorder()`，传给 `fetchHostBackup`，
并在导出结束时 `logger.info(\`宿主导出分段耗时：${timings.summary()}\`)`。
转换段由调用方在同一 recorder 上 `begin('convert')` / `end('convert')` 标记（本片只在
宿主导出路径接线，其余路径按需）。

## 6. 错误矩阵

| 条件 | 行为 |
| --- | --- |
| 传输停滞 ≥ 阈值 | `TimeoutError` 上抛；流已 cancel；半成品按既有「真实错误」分支清理 |
| 传输慢但持续有字节 | 守卫不触发（AC-2） |
| TTFB 长（宿主打包中） | 不设守卫（AC-3）—— 只受用户取消影响 |
| `stallTimeoutMs <= 0` | 关闭守卫，回到既有行为 |
| 用户取消 | 仍是 `AbortError`，既有暂停语义不变 |

## 7. 取值理由（`DOWNLOAD_STALL_TIMEOUT_MS = 60_000`）

**这是本片唯一凭判断给出的数字，故必须写明依据与替代路径**：

- 依据：`DEFAULT_FETCH_TIMEOUT_MS` 已是 **120 s**（一般请求的**总**时限）。停滞守卫只要求
  「两次字节之间」不超 60 s —— 比总时限**更宽松**（持续慢速传输不受影响），
  比「永不超时」**更严**（真挂死能收敛）。
- **它不是实测值**。实测需要获授权的实例（本片未获授权），故 `async-bounds.md` 把它标注为
  **「待实测校准」**并写明测量方法；本片交付的是**可测量的能力**，不是「已测准的数字」。
- 调参只有一个点：`fetch-bounds.js` 的常量（或调用方传 `stallTimeoutMs`）。

## 8. 回退点

撤回 = 不传 `timings` 且 `stallTimeoutMs = 0` ⇒ 行为与改动前逐字节一致（默认路径零变化）。
