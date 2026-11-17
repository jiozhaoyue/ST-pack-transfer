# 功能 / 可用性审计报告（2026-11-17）

> 审计员角色：只读审计。**未修改任何产品代码、样式、测试或配置**；唯一写入文件为本报告。
> 用例定义：不是「能开起来」，而是「绝对好用」；重点找「看似正常但不正常」的问题。

## 结论摘要

**P0：0 条 ｜ P1：5 条 ｜ P2：3 条**（共 8 条，均为不同根因，未重复罗列）。

最严重的 5 条：

1. **P1-1 分卷阈值按「未压缩源字节」判断，与真实产物体积不同源**（`src/core/splitter.js:184,191,214` vs `:168`）——用户要求核查的「预估体积与真实产物体积是否同源」在此处不成立。
2. **P1-2 分卷进度分母是假的**：`onProgress` 的「总卷数」恒等于当前卷号（`src/core/splitter.js:187`），UI 显示「第 1/1 卷 → 第 2/2 卷」，分母自己跟着分子涨。
3. **P1-3 备份集名未净化，可拼出 `../` 路径段**（`src/ui/workbench-view.js:5617` → `src/core/s3-client.js:19-31` / `src/core/webdav-client.js:33-43`）——WebDAV 可越出用户填写的前缀目录。
4. **P1-4 LAN 接收端串行 64KB 写 + digest 整块入内存**（`src/ui/lan-transfer-panel.js:550,661`）——即使 UI 已做 120ms 节流，写链本身仍是吞吐瓶颈；当前真实吞吐**未测到**（浏览器未连接，见实测记录）。
5. **P1-5 导出区「清空 / 移除」删除工作区文件失败被静默吞掉**（`src/ui/export-queue.js:177,184`）——列表空了，IndexedDB 里的文件可能还在。

正面结论（已核实，不列为缺陷）：断点续传不变量已修并有实测读数（`.trellis/spec/frontend/resume-checkpoint-invariant.md`）；`worker.terminate()` 后置 `workerInstance = null`（`src/core/worker-client.js:212-215`）；体积模型确实被消费（`src/core/size-model.js` → `src/ui/workbench-view.js:42,1540`）；教程退出用整份 state 快照恢复并补载真实数据（`src/ui/workbench-view.js:6667-6684`）；宿主平台→布局代码归一单点（`src/ui/host-bridge.js:245`，`index.js:1353,1361`）。

## 问题表

| ID | 严重度 | 功能面 | 位置(文件:行) | 看似正常之处 | 实际问题的证据 | 用户影响 | 建议修法 | 关联规则 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | P1 | 转换主链路 / 分卷 | `src/core/splitter.js:184,191,214`；产物 `sizeBytes` 在 `:168` | 设置了 `SAFETY_MARGIN=0.95`（`:23`）与 `thresholdBytes`（`:115`），看起来能防超限 | `entrySize = data?.byteLength \|\| data?.length \|\| data?.size \|\| entry.size`（`:184`）取的是**未压缩源字节**；`wouldExceed` 用 `currentPartEstimatedBytes + entrySize` 判断（`:191`），累加也在 `:214`；而真实产物体积是压缩后的 `blob.size`（`:168`）。二者不同源 | JSON / 聊天文本等可压缩内容被过度切卷（每卷远小于阈值）；不可压缩媒体因未计 ZIP 开销反而可能超阈值 | 分卷判断改用「写入后 writer 的实际字节」或在 UI 明确标注「按未压缩体积估算」，不要把它当产物体积 | R-05 数值必须真实；MR-19 数据正确性 |
| F-02 | P1 | 转换主链路 / 分卷 | `src/core/splitter.js:187` | `onProgress` 有 `currentPartIndex, totalPartsEstimated` 两个参数，调用方以为拿到的是总卷数 | 实际传的是 `Math.max(currentPartIndex, 1)`，即**分母恒等于当前卷号**：第 1 卷报「1/1」，第 2 卷报「2/2」 | 用户从头到尾不知道一共几卷，进度条分母随进度自增长，是「假进度」 | 先做一次轻量扫描给出总卷数上界，或只报「已在第 N 卷」不要伪造分母 | R-05 数值必须真实 |
| F-03 | P1 | S3 / WebDAV 安全 | `src/ui/workbench-view.js:5617`；`src/core/s3-client.js:19-31`；`src/core/webdav-client.js:33-43` | `encodeSegment()` 用了 `encodeURIComponent`，看起来对路径做了编码 | `encodeURIComponent('..') === '..'`，`encodePath()` 按 `/` 分段后 `..` 段原样保留（`s3-client.js:19-20`）；`normalizePrefix()` 只去首尾斜杠（`:24-25`）；`objectKey()` 直接拼 `${p}/${name}`（`:29-31`）；WebDAV `encodeDavPath()` 同理（`webdav-client.js:33-34`）。而 `cloud-set-name` 原样取值 `val('cloud-set-name') \|\| 'default'`（`workbench-view.js:5617`），`backup-set.js` 无名称校验 | 用户输入含 `../` 的备份集名时，WebDAV 可写到填写目录之外；S3 会污染其他前缀的对象命名空间 | 对 `setName` / 前缀段做段级净化（拒绝或替换 `.`/`..`/空段），复用 `sanitizeFilename()` 的段级版本；拼接后断言无 `..` 段 | R-08 零泄露 / 路径安全；R-07 交付落点 |
| F-04 | P1 | 局域网传输（重点） | `src/ui/lan-transfer-panel.js:550,661-665,679-684`；历史基线 `:36-38,670-672` | 代码注释宣称「每块全量 renderLan() 是 300KB/s 瓶颈，已用 120ms 节流修复」（`:36-39`） | UI 确实节流了（`:674-677`），但写链仍是**逐块串行**：`writeChain = writeChain.then(async () => { ... await sink.write(chunk); })`（`:661-665`），每块 64KB（`CHUNK_SIZE` 定义于 `src/core/lan-transfer.js:29`）；1GB 包 = 16384 次串行 OPFS write。digest 在接收端用 `new Uint8Array(await blob.arrayBuffer())` 整块入内存（`:550`），≤512MB 文件峰值约 2× 文件体积。**当前真实吞吐未测到**（浏览器工具未连接、无 Playwright，见实测记录），不能声称已修复 | 大包接收吞吐仍可能远低于阈值；慢速下 1GB 级接收有内存压力 | 写链按窗口批量合并（如 4–8 块一次 OPFS write），digest 改流式 `crypto.subtle.digest` 分块喂入；并在 Dev 实例复测吞吐后再宣称达标 | R-25 性能预算；R-21 有界等待与生命周期 |
| F-05 | P1 | 导出区 / 待导出 | `src/ui/export-queue.js:177,184` | 「移除」「清空」按钮存在，清空前有 `askConfirm`（`:330`），看起来删干净了 | `deleteFile(item.storedId).catch(() => {})` —— IndexedDB 删除失败被空 catch 静默吞掉；UI 立即把 `this.items = []` 并 notify（`:186-187`），不等待删除结果 | 用户确认清空后，工作区文件可能仍占用配额；再次导入时出现「已删除却还在」的错觉 | catch 里 `pushLog('ERROR', ...)` + toast，或返回删除结果给调用方；删除失败时保留条目并提示重试 | R-30 失败不静默；R-19 数据正确性 |
| F-06 | P2 | 局域网传输 | `src/ui/lan-transfer-panel.js:210,326,679-682` | 有完整 ACK 协议：`ACK_THRESHOLD_BYTES` / `ACK_INTERVAL_MS`（`:34-35`），接收端每 1MB 或 250ms 回 `ack`（`:679-682`），发送端也有 `onmessage` 分支（`:326`） | 发送端 `ackBytes = Number(msg.bytes)`（`:326`）写入后**全文件再无读取点**（grep 仅 5 处：`:210` 声明、`:326` 写入、`:610` 接收端重置、`:679/:680` 接收端使用）。发送端背压只看本地 `dc.bufferedAmount`（`:412`），ACK 对发送端零作用 | 「有 ACK=有端到端流控」是错觉；排障时看 ACK 日志会误判接收端进度已生效。WebRTC SCTP 本身有拥塞控制，故不列 P1 | 要么让发送端用 `ackBytes` 做发送窗口并暴露真实接收进度，要么删掉这段死代码并在文档说明流控由 SCTP 承担 | R-30 失败不静默（不得假清单）；R-19 |
| F-07 | P2 | 导出区 / 待导出 | `src/ui/export-queue.js:162-164` | `enqueue()` 生成 `eq_时间戳_序号` 唯一 id，看起来天然防重 | 无「同名 / 同来源」去重；重复点「开始转换」会把同名产物再次 push（`:164`），UI 出现两条同义条目 | 用户误以为导出两次是不同产物，重复下载/入库，配额翻倍 | enqueue 前按 `name + origin + taskId` 查重并提示覆盖/跳过 | R-14 不得重复入口；R-19 |
| F-08 | P2 | 错误处理 / 宿主拉取 | `src/ui/host-bridge.js:1625,1665`；`src/core/lan-transfer-panel.js:44-51` | 有速度采样与排障日志，看起来可诊断 | 速度采样与 `dbg()` 分别依赖注释里写明的条件：`dbg()` 需 `localStorage.setItem('lan-debug','1')` 后刷新（`:44-51`），默认关闭；排障门槛高但不影响功能，故 P2 | 出问题后默认无任何诊断输出，用户报障时无证据可给 | 把关键失败（校验不一致、写盘失败、超时）提升为无条件 `pushLog('ERROR')`，`dbg()` 只保留逐块级别 | R-30 失败不静默 |

## 实测记录（原始数值）

1. **单测基线（只读验证）**
   - 命令：`npm test 2>&1 | Select-Object -Last 25`
   - 结果：`Test Files 142 passed | 1 skipped (143)`；`Tests 1341 passed | 2 skipped (1343)`；`Duration 10.40s`（transform 3.55s / collect 24.53s / tests 67.80s / prepare 23.00s）。全绿，零回归。
   - 说明：`test/real-samples.test.js` 6 例耗时 9350ms（其中 `real-l-to-l.zip` 3591ms、`real-tt-to-l.zip` 904ms、`real-l-to-pt.zip` 2398ms/1413ms/939ms）——这是**测试耗时**，不是产品吞吐。

2. **开发服务连通性**
   - 命令：`Invoke-WebRequest -Uri 'http://localhost:3040' -UseBasicParsing -TimeoutSec 5`
   - 结果：`HTTP 200 length=1418`。服务在线，未重启、未改端口、未改配置。

3. **UI / 浏览器实测（未能执行）**
   - 调用 `tools.browser.tabs.open({url:'http://localhost:3040'})` 返回：`[browser.disconnected] No desktop browser is connected to this session.`
   - 替代通道检查：`node_modules/.bin/playwright.cmd` → `NO_PLAYWRIGHT_BIN`；`node_modules/playwright` → `NO_PLAYWRIGHT_MODULE`（未安装，且审计禁止装依赖）。
   - ⇒ 上传小 fixture、切目标平台、生成、打开传输面板、console/network 异常、交互延迟、首屏/教程浮层即时性均**未测到**。

4. **LAN 吞吐（重点项，未测到）**
   - 代码路径已定位：`CHUNK_SIZE = 64*1024`（`src/core/lan-transfer.js:29`）；发送端背压阈值 `HIGH_WATER_MARK = CHUNK_SIZE*64 = 4MiB`、低水位 1MiB（`src/ui/lan-transfer-panel.js:40-41,353`）；UI 节流 120ms（`:39`）；ACK 每 1MiB / 250ms（`:34-35`）。
   - 文档记录的历史基线：`~300 KB/s`，归因「每块全量重绘导致串行瓶颈；已由 rAF 合帧改善」（`.trellis/spec/frontend/perf-budget.md:36`）；代码注释同样写「实测仅 ~300KB/s」（`lan-transfer-panel.js:37,670`）。**这是修复前基线，不是当前值**，不得当作实测结论。
   - 可复现测量方法（留给后续真人/Dev 实例执行）：开两个标签页同域 `http://localhost:3040`；A 页勾选一个已知字节数的包点「局域网互传」生成取件码；B 页粘贴并回传 answer 码；A 页粘贴 answer 开传；在 B 页控制台用 `performance.now()` 记录首块与末块时间，吞吐 = `文件字节数 / (末块时间 − 首块时间)`；同时用 `browser.evaluate` 统计 `dc.bufferedAmount` 峰值与 `sink.write` 次数（预期 = `ceil(size/65536)`）。当前**无真实数值**。

5. **静态取证（grep，均已列出文件:行）**：见问题表「实际问题的证据」列。关键确认：`ackBytes` 全文件仅 5 处出现（F-06）；`splitArchiveEntries` 内 `onProgress` 分母恒为当前卷号（F-02）；`deleteFile(...).catch(() => {})` 两处（F-05）。

## 未覆盖项与原因

| 功能面 | 未覆盖内容 | 原因 |
| --- | --- | --- |
| 转换主链路 | 上传/选包→四目标平台→生成→下载的完整端到端 | 浏览器工具未连接；无真实 fixture 上传通道 |
| 宿主拉取/恢复 | ST 与 Luker 真实端点调用、selection 透传、失败重试 | 无宿主实例连接；仅做了代码路径核查（`host-bridge.js:285-335,1488-1557`）：ST 不支持 selection → 全量请求 + 插件内过滤；Luker 支持 → 透传，二者架构上符合 R-19 |
| 导出区 | 重复下载、大小/时间显示的实时性 | 无浏览器 UI 实测 |
| 局域网传输 | **真实吞吐数值**、心跳/重试、背压峰值 | 需双端 WebRTC + 桌面浏览器；当前不可用 |
| S3 / WebDAV | 真实远端连接、超时、分片上传、断点、URL 编码实测 | 无凭据、无远端端点；仅静态审计（F-03） |
| 扩展管理 / Git | 安装来源唯一、私有仓提示、分支/commit 安装、批量更新、失败回滚 | 无真实仓库与宿主实例；仅确认存在相关模块（`git-url.js` / `git-remote.js`），未做运行时验收 |
| 存储审查 | 配额条真实性、刷新、未提供时的显示 | 无浏览器 UI 实测 |
| 设置 / i18n | 死控件实测、默认值恢复、切换即时生效 | 有 `check:control-consumer` 静态守卫且 `settings-panel.js:424-472` 有消费点，未实测 |
| 教程模式 | 退出后真实数据恢复的运行时验证 | 已做静态确认（`workbench-view.js:6667-6684` 用快照恢复 + `onTutorialExit` 补载），未实测 |
| 状态与并发 | 多标签页竞争、内存增长、长任务卡 UI | 无浏览器 heap / trace 通道 |

> 说明：所有「未测到」均如实标注，未用估算值或 `~` 前缀冒充实测；文档中的 `~300KB/s` 明确标为历史基线而非当前结论。本报告未提出需要装依赖或大重构的方案。
