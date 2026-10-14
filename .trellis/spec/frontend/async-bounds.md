# 异步阶段超时 / 取消边界（`async-bounds`）

> 来源：`10-01-safe-migration-productization` 的 S0 收尾（子任务 `10-14-migration-async-bounds`，2026-10-14）。
> 本页**自包含**：每个阶段的边界值、取消路径、取值理由与测量方法都写在这里，不引用任务目录。
>
> 适用：任何新增或改动**异步等待**（fetch / 流读取 / 宿主调用 / Worker 任务）的场合。
> 相关但不在此文件：断点续传不变量 → [`resume-checkpoint-invariant.md`](./resume-checkpoint-invariant.md)；
> 宿主对接与原生弹窗 → [`host-capabilities.md`](./host-capabilities.md)。

---

## 1. 规则

1. **每个 `await` 都必须能 settle**（`L1-MR-7`）。「等一个可能永不返回的东西」等于把故障形态
   从「报错」变成「静默卡死」，而用户看不出区别。
2. **超时与取消必须是两种错误**。用户主动取消 → `AbortError`；宿主/网络挂死 → `TimeoutError`。
   混为一谈会让 UI 把「你点了取消」说成「宿主挂了」（或反之）。
3. **超时口径要选对**：**总时长**（整个请求最多多久）与**间隔**（两次数据之间最多多久）
   解决的是不同问题。对**大小未知**的传输只能用**间隔**——固定总时限会误杀正常的大包慢传。
4. **给不出理由的数字就是没测过**。新阈值必须在第 4 节登记「依据」；凭经验填的数一律标
   **待实测校准**，不得写成已定论。

## 2. 阶段边界表（2026-10-14 取证）

| # | 阶段 | 边界 | 口径 | 取消路径 | 证据（`file:line`） |
| --- | --- | --- | --- | --- | --- |
| 1 | 取凭证 / 当前用户 | **10 s** | 总时长 | `signal` | `src/ui/fetch-bounds.js:31`（`SHORT_FETCH_TIMEOUT_MS`）；用点 `src/ui/host-bridge.js:620,639` |
| 2 | 宿主打包数据（TTFB） | **无上限**（刻意） | — | `signal` | `src/ui/host-bridge.js` 的 `fetchHostBackup` 中 `await fetch(...)`；`host-generate` 段只 `begin/end` 计时 |
| 3 | **包体传输** | **60 s 停滞** | **间隔** | `signal` | `src/ui/fetch-bounds.js:197`（`DOWNLOAD_STALL_TIMEOUT_MS`）、`:214`（`readStreamChunkBounded`）；用点 `src/ui/host-bridge.js:838` |
| 4 | 转换（Worker） | 无总超时；暂停收尾 **30 s** | 总时长（收尾） | `PAUSE` 消息 → Worker 自持 `AbortController` | `src/core/worker-client.js:16`（`PAUSE_FINALIZE_TIMEOUT_MS`）、`:234` |
| 5 | 转换（主线程降级，Node/无 Worker） | **不可中断** | — | 无（同步执行） | `src/core/worker-client.js` 的 Node 分支 |
| 6 | 目标写入（上传） | **无上限**（刻意） | — | `cancelRestoreInFlight()` / `signal` | `src/ui/fetch-bounds.js:45`（`UPLOAD_TIMEOUT_MS = 0`）；用点 `src/ui/host-bridge.js` 的 `restoreToHost` |
| 7 | 恢复响应体读取 | **10 s** | 总时长 | `signal` | `src/ui/host-bridge.js:1041,1056`（`readJsonBounded`） |
| 8 | 聊天库 list / export / import | **8 s / 20 s / 30 s** | 总时长 | `signal` | `src/ui/chat-store-bridge.js:50-52` |
| 9 | 一般 fetch 默认 | **120 s** | 总时长 | `signal` | `src/ui/fetch-bounds.js:34`（`DEFAULT_FETCH_TIMEOUT_MS`） |
| 10 | 本地 IO（`readZipEntryManifest` / OPFS 读写） | 无上限 | — | 无 | 本地同步/流式 IO，无远端参与 |

## 3. 三个「无上限」为什么是刻意的

- **阶段 2（TTFB）**：宿主打包 GB 级数据可能耗时数分钟且与数据量成正比。对它设固定阈值
  ⇒ 大包用户每次都被误杀。**替代兜底 = 用户取消**（进度条显示「宿主打包中」）。
  ⚠ 已知残留：若宿主在此阶段**挂死**，用户只能取消 —— 这是**刻意接受的代价**，
  因为「打包慢」与「打包挂死」在本端**不可区分**。
- **阶段 6（上传）**：同理由 `design.md §2.2` 裁定 —— 120 MB 包在慢速上行下超过任何固定阈值都属正常。
- **阶段 5（主线程降级）**：同步执行，本端没有任何抢占点。仅存在于 Node/无 Worker 环境。

## 4. 取值依据与**待实测校准**

| 常量 | 现值 | 依据 | 状态 |
| --- | --- | --- | --- |
| `SHORT_FETCH_TIMEOUT_MS` | 10 s | 凭证/用户信息是**小 JSON**，10 s 足够覆盖慢网络 | 沿用既有，**待实测校准** |
| `DEFAULT_FETCH_TIMEOUT_MS` | 120 s | 一般请求的总时限；比短请求宽一个量级 | 沿用既有，**待实测校准** |
| `PAUSE_FINALIZE_TIMEOUT_MS` | 30 s | 协作式收尾（worker 关 zip + 落 OPFS）的兜底；超时即回落「硬终止 + 无半成品」 | 沿用既有，**待实测校准** |
| `DOWNLOAD_STALL_TIMEOUT_MS` | **60 s** | **本片新增**。取 `DEFAULT_FETCH_TIMEOUT_MS` 的一半：比「总时限」宽松（不误杀持续慢速传输），比「永不超时」严（真挂死能收敛） | **判断值，待实测校准** |
| `UPLOAD_TIMEOUT_MS` | 0（关） | `design.md §2.2` 的裁定：慢速上行大包会被任何固定阈值误杀 | 沿用既有裁定 |
| 聊天库 8/20/30 s | — | 外部插件的实现质量不可控，宁可判「不可用」也不挂死主路径 | 沿用既有，**待实测校准** |

**「待实测校准」的含义**：这些数字**不是**实测结果，本仓目前**没有任何真实耗时读数**。
校准需要获授权的实例（本仓 E2E 只许连 Dev，且本片未获实例写入授权）。

### 4.1 怎么测（测量装置已就位）

`src/core/stage-timings.js` 的 `createStageRecorder()`（纯逻辑、时钟可注入）是**唯一**落地手段：

```js
const timings = createStageRecorder();
await fetchHostBackup(platform, selection, { timings });   // 自动记 credentials / host-generate / transfer
timings.begin('convert'); /* …转换… */ timings.end('convert');
logger.info(`宿主导出分段耗时：${timings.summary()}`);
```

- 语义：`begin` 重复调用**不重入**（保留首次起点）；未 `begin` 就 `end` 是 **no-op**；
  `snapshot()` **只含已闭合的段**（进行中的段不出现，否则「耗时」会随查询时刻漂移）。
- **接线现状**：`fetchHostBackup` 已接三段（凭证 / 宿主打包 / 传输）；`index.js` 的**宿主导出路径**
  已接转换段并在完成时写一条日志。其余调用点按需传同一个 recorder 即可。
- 校准流程：在**获授权的 Dev 实例**上跑一次宿主导出 → 从日志读 `宿主导出分段耗时：…` →
  按读数调整第 4 节常量 → 在本节登记新值与日期。

## 5. 停滞守卫的契约（`readStreamChunkBounded`）

```js
export const DOWNLOAD_STALL_TIMEOUT_MS = 60_000;   // src/ui/fetch-bounds.js:197
readStreamChunkBounded(reader, { timeoutMs, label })  // :214
```

- **只守间隔，不守总时长**：字节持续到达时守卫**永不**触发，哪怕总时长远超阈值（有测试钉住）。
- `timeoutMs <= 0` ⇒ 直接透传 `reader.read()`（与 `fetchWithTimeout` 的 `timeoutMs <= 0` 同义）。
- 停滞时**必须先 `reader.cancel()` 再抛错**：不 cancel 的话底层流仍被锁住、`fetch` 的 body 不释放，
  等于把「无界等待」从 promise 挪到流上。
- 抛 `TimeoutError`，**不是** `AbortError`（规则 2）。
- 停滞的清理走 `fetchHostBackup` 既有的**真实错误**分支（清 OPFS 半成品后上抛），
  **不**并入「用户暂停」分支 —— 语义不同，不得混用。
