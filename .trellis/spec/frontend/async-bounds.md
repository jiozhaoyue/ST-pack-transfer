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

## 4. 取值依据与实测状态

### 4.1 实测读数（2026-10-14，Dev ST 8001，**只读**）

方法：在 Playwright 持久化档案的页面上下文里同源 `fetch`（裸 curl 会 403 —— 备份端点需要**会话 cookie**），
`POST /api/users/backup`，`selection` 为 10 个标准键全 true。**只连 Dev**，端点只读。
脚本 `test-results/measure-backup-browser.cjs`（`test-results/` 不入库）。

| 阶段 | 实测 | 对应常量 | 余量 |
| --- | --- | --- | --- |
| credentials（`/csrf-token`） | **53 ms** | `SHORT_FETCH_TIMEOUT_MS = 10 s` | **≈189×** |
| host-generate（TTFB） | **141 ms** | **无上限** | — |
| transfer | **60 085 ms** / **685.4 MB** / 48 737 块 | `DOWNLOAD_STALL_TIMEOUT_MS = 60 s` | 见下 |
| 块间最大间隔 | **651 ms** | `DOWNLOAD_STALL_TIMEOUT_MS = 60 s` | **≈92×** |
| 吞吐 | 11.4 MB/s | — | — |

**三条由此得到的事实（都不再是推测）**：

1. **`DOWNLOAD_STALL_TIMEOUT_MS = 60 s` 现在有实测下限支撑**：观测到的块间最大间隔只有 **651 ms**，
   60 s 是它的 **≈92 倍**。⇒ 该阈值**不会**误杀正常传输；同时任何 ≥ ~5 s 的取值在本样本上同样安全。
   **保留 60 s**：单样本不足以把阈值收紧到 15–30 s（服务器 GC / 冷启动的尖峰未取到），
   收紧需要更多样本——**但「60 s 会不会误杀正常传输」这个问题已经有答案：不会**。
2. **⚠ 总时长超时在这条路径上是错的**：同一次**正常**传输耗时 **60 085 ms**。
   任何「总时限 60 s」的实现都会在这次**合法**导出上触发——这是第 1 节规则 3
   （「大小未知的传输只能用间隔口径」）的**实测证据**，不再是论证。
3. **TTFB 只有 141 ms**：宿主是**边打包边流**（响应无 `Content-Length`，chunked，48 737 块），
   不是「先打包完再发」。故 `host-generate` **不是长杆**，§3 那条「打包可能数分钟」的担忧
   在本样本上不成立 —— 但**不设上限仍然正确**（冷启动/大目录可能显著更长，而这里没有证据
   说明它一定短）。**该阶段的真实上界仍属未知**。

### 4.2 取值表

| 常量 | 现值 | 依据 | 状态 |
| --- | --- | --- | --- |
| `SHORT_FETCH_TIMEOUT_MS` | 10 s | 凭证/用户信息是小 JSON；实测 53 ms | **已实测**（余量 ≈189×） |
| `DEFAULT_FETCH_TIMEOUT_MS` | 120 s | 一般请求总时限 | **待实测校准**（本样本未覆盖此类请求） |
| `PAUSE_FINALIZE_TIMEOUT_MS` | 30 s | 协作式收尾（worker 关 zip + 落 OPFS）的兜底 | **待实测校准** |
| `DOWNLOAD_STALL_TIMEOUT_MS` | **60 s** | 实测块间最大间隔 651 ms ⇒ ≈92× 余量；**刻意保守**（单样本，尖峰未取到） | **已实测**（安全余量已证） |
| `UPLOAD_TIMEOUT_MS` | 0（关） | `design.md §2.2` 的裁定：慢速上行大包会被任何固定阈值误杀。**上表 2 号事实支持该裁定** | 沿用既有裁定 |
| 聊天库 8/20/30 s | — | 外部插件实现质量不可控，宁可判「不可用」也不挂死主路径 | **待实测校准**（需装聊天库） |

**仍未覆盖**：Dev **Luker（8003）** 未测（用户授权的是「采一次读数」，本次取 ST 一例）；
未在**慢速/受限网络**下测；未测**上传**方向（`restoreToHost`）；未测**冷启动**（实例已预热）。
这些都属于「待实测校准」的剩余项，不是「已知安全」。

### 4.3 怎么再测

`src/core/stage-timings.js` 的 `createStageRecorder()`（纯逻辑、时钟可注入）是插件内的唯一手段：

```js
const timings = createStageRecorder();
await fetchHostBackup(platform, selection, { timings });   // 自动记 credentials / host-generate / transfer
timings.begin('convert'); /* …转换… */ timings.end('convert');
logger.info(`宿主导出分段耗时：${timings.summary()}`);
```

- 语义：`begin` 重复调用**不重入**（保留首次起点）；未 `begin` 就 `end` 是 **no-op**；
  `snapshot()` **只含已闭合的段**（进行中的段不出现，否则「耗时」会随查询时刻漂移）。
- **接线现状**：`fetchHostBackup` 已接三段（凭证 / 宿主打包 / 传输）；`index.js` 的**宿主导出路径**
  已接转换段并在完成时写一条日志。
- **插件外的一次性测量**：`test-results/measure-backup-browser.cjs`（只读、只连 Dev、端口守卫内建）。
- 校准流程：跑一次 → 读读数 → 调第 4.2 节的常量 → 在本节登记新值、日期与样本条件。

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
