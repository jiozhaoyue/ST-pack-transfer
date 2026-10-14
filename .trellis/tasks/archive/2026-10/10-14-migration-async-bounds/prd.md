# 异步阶段超时/取消边界与测量装置（S0 收尾）

## Goal

把 `10-01` S0 最后两项（「标注各异步阶段的超时/取消边界和测量任务」）做完：
**逐阶段取证**边界与取消路径，给**测量装置**让阈值来自实测而非经验，并补上唯一**完全没有兜底**的
那一段（宿主备份**传输停滞**）。

## 背景（现场取证，2026-10-14）

现状是「有的阶段管得很紧、有的阶段完全不管」，且**没有任何一处记录真实耗时**，故阈值无从校准：

| # | 异步阶段 | 现状 | 证据 |
| --- | --- | --- | --- |
| 1 | 凭证 / 用户信息 | **10 s** 硬超时 + signal | `host-bridge.js:615,617` / `:634,636` |
| 2 | 宿主备份**生成**（TTFB） | **无超时**，仅 signal | `host-bridge.js:~752`（`await fetch`） |
| 3 | 宿主备份**传输**（body 逐块） | **无超时、无停滞检测**，仅 signal | `host-bridge.js:~811`（`reader.read()` 循环） |
| 4 | 转换（Worker） | 无总超时；暂停走协作式收尾，**30 s** 兜底 | `worker-client.js:16,234` |
| 5 | 转换（主线程降级） | 同步执行，**不可中断** | `worker-client.js`（Node 分支） |
| 6 | 目标写入（上传） | **`UPLOAD_TIMEOUT_MS = 0`**（刻意不设硬超时）+ 取消入口 | `fetch-bounds.js:45`、`host-bridge.js:956` |
| 7 | 恢复响应体读取 | **10 s**（`readJsonBounded`） | `host-bridge.js:1014,1029` |
| 8 | 聊天库 list/export/import | **8 s / 20 s / 30 s** | `chat-store-bridge.js:50-52` |
| 9 | 一般 fetch 默认 | **120 s** | `fetch-bounds.js:34` |

**阶段 3 是本片要修的真缺口**：宿主接受请求后若在传输中途静默（连接不死、也不再来字节），
`reader.read()` **永久 pending** —— 这正是 `L1-MR-7`（有界等待）禁止的形态；
用户唯一能做的是点取消（而 UI 上「卡住不动」与「正在慢速传输」**看起来一样**）。

**测量缺口**：上述数字没有一个来自实测。慢速上行的大包到底要多久、宿主生成 GB 级备份的 TTFB 是多少，
**本仓无任何读数**。

## Requirements

- **R1 停滞兜底（唯一的行为改动）**：宿主备份**传输阶段**加「无新字节」上限
  `DOWNLOAD_STALL_TIMEOUT_MS`。超时 ⇒ 以 `TimeoutError` settle 并**释放流**（不得永久 pending）。
  **只作用于传输阶段**：TTFB（宿主生成）**不设**该上限——GB 级备份的生成耗时本就可能很长，
  对它设固定阈值只会误杀正常导出。
- **R2 测量装置**：新增纯模块 `src/core/stage-timings.js`，提供分段计时记录器
  （`createStageRecorder()`：`begin` / `end` / `snapshot` / `summary`）。
  **纯逻辑、无 DOM、无 IO**，Node 可直接测。它是「阈值来自实测」的**唯一**落地手段。
- **R3 接线**：把记录器接到宿主导出链路的四段（凭证 / 宿主生成 / 传输 / 转换），
  导出结束时**一次性**把分段读数写进日志（不逐段刷日志，避免 `L1-MR-9` 类高频输出）。
- **R4 取证文档**：`.trellis/spec/frontend/async-bounds.md` 承载**自包含**的阶段表
  （阶段 / 边界值 / 取消路径 / `file:line` 证据 / 为什么是这个值 / 如何测量），
  并把「仍未定值」的项**明确登记为待测**，不用经验数字充数。
- **R5 不新增依赖**；不改 `UPLOAD_TIMEOUT_MS = 0` 的既有裁定（上传方向仍是「取消兜底」）。

## Constraints

- `src/core/` 禁 DOM（`L1-MR-6`）；计时器属纯逻辑，放 core。
- 分层：`fetch-bounds.js` / `host-bridge.js` 属 `src/ui/`；停滞守卫放在 `fetch-bounds.js`（与其它有界等待同址）。
- 不写本地实例目录、不连 Real 实例（`CLAUDE.md` 坑 #2 / `P-11`）。
- **不得**把 `TimeoutError` 与用户取消（`AbortError`）混为一谈——UI 文案必须能区分（沿用 `fetch-bounds.js` 既有取舍）。

## Acceptance Criteria

- [x] **AC-1 停滞必 settle**：传输中连续 `DOWNLOAD_STALL_TIMEOUT_MS` 无新字节 ⇒ `TimeoutError`
      抛出，且**流被释放**；有**判别力负例**——把停滞守卫去掉后，同一夹具必须**永不 settle**
      （测试用短超时 + 可控替身流，不靠真实等待）。
      —— *`test/stream-stall.test.js`：`【AC-1】停滞 ⇒ 在阈值内以 TimeoutError settle，并释放流`
      （断言 `reader.cancel` 被调用 1 次）+ `【AC-1 判别力】去掉守卫（timeoutMs=0）⇒ 同一夹具永不 settle`
      （`Promise.race` 200ms 窗口内判 `pending` 且 `cancel` **未**被调用）。*
- [x] **AC-2 正常传输不受影响**：只要字节持续到达（即使**总时长远超**停滞阈值），
      守卫**不得**触发。用例：分多块、每块间隔小于阈值、总时长远大于阈值 ⇒ 正常完成。
      —— *同文件 `【AC-2】字节持续到达时守卫不触发`：6 块 × 25ms ≈ 150ms 总时长，阈值仅 40ms。*
- [x] **AC-3 TTFB 不设上限**：宿主生成阶段（首字节之前）**不受**停滞守卫影响。
      —— *`readStreamChunkBounded` 只在**读循环内**被调用（`host-bridge.js:838`），
      `await fetch(...)` 那一段没有守卫（同处注释写明刻意为之）；`async-bounds.md` §3 登记该代价。*
- [x] **AC-4 记录器纯且正确**：`createStageRecorder` 的分段读数可断言（注入时钟替身，
      不依赖真实时间）；未闭合的阶段不得污染已完成阶段的读数。
      —— *`test/stage-timings.test.js` 6 条：注入 `fakeClock`；`未 begin 就 end ⇒ no-op`；
      `重复 begin 不重入`；`snapshot 只含已闭合的段`；`summary 按声明顺序、省略未出现段`；`reset`。*
- [x] **AC-5 零回退**：`npm test` 相对基线（790 passed / 2 skipped）只增不减、0 failed；
      五守卫 + `build` + `build:offline` + 独立形态 E2E 全绿。
      —— *`npm test` 790 → **801 passed / 2 skipped / 0 failed**（净增 11，79 文件）；
      五守卫 + `build` + `build:offline` 全绿；`e2e:web -- --rebuild` **496/496**（exit 0）。*
- [x] **AC-6 文档自包含**：`async-bounds.md` 每个阶段都有 `file:line` 证据与取值理由；
      **未定值项显式标注「待测」**，不写经验数字；`10-01/implement.md` 的 S0 两项勾选并注记。
      —— *新建 `.trellis/spec/frontend/async-bounds.md`（7.4 KB，远低于 32768 上限）：§2 十阶段边界表
      逐条 `file:line`；§3 三个「刻意无上限」阶段及其代价；§4 取值依据表 + **「待实测校准」**登记 +
      校准流程；§5 停滞守卫契约。`10-01/implement.md` 的 S0 第一项已勾选并注记（第二项见下）。*

## 未覆盖边界（如实登记）

- **阈值本身仍未实测**：本片交付的是**边界取证 + 测量能力**，不是「已测准的数字」。
  `async-bounds.md` §4 把所有常量（含新增的 60 s）登记为**待实测校准**，校准需获授权的实例。
- **停滞守卫未在真实宿主上触发过**：行为由替身 reader 验证（含判别力负例），真实宿主的
  「半死连接」形态（TCP 保持但不再来字节）未取过样。
- `10-01` 的 S0 第二项（「将任何新的范围取舍交回用户」）**不是代码问题**，需用户裁决
  （默认全选的键集口径 OQ-1），本片未擅自拍板。


## Out of Scope

- **不**给上传（目标写入）设硬超时——既有 `UPLOAD_TIMEOUT_MS = 0` 的裁定（`design.md §2.2`）不改。
- **不**给转换阶段设总超时（长任务本就没有合理上界；暂停已有 30 s 收尾兜底）。
- **不**把测量读数做成常驻 UI（只进日志 + 供 `summary()` 取用）。
- **不**用真实宿主测量（未授权实例写入）；测量装置交付的是**能力**，
  真实读数须在获授权的实例上另行采集，本片如实登记。
