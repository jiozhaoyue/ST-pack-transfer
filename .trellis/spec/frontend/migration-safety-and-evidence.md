# 迁移写入安全、核对与重试证据契约

> 状态：2026-10-01 用户已裁定的目标契约。**纯判定层已于 S1（2026-10-13）实现**（`src/core/migration-plan.js`、`src/core/migration-evidence.js`）；源端、目标写入、核对与向导仍待实现。本页定义何时可写、何时能说完成、何时可重试，不扩大任何宿主的真实权限或能力。

## 1. 范围与触发

适用于目标预检、自动/原生手动备份、合并写入、取消/超时、结果核对和部分失败重试。
现有入口是 src/ui/host-bridge.js:907 的 restoreToHost；能力三态见同文件:85-97，备选通道处理见:155-181。
旧一次性同步接受的 ST 不备份特例不适用于面向普通用户的新默认流程。

默认模式是 merge：更新同名、保留目标独有内容；本契约不授权覆盖重置、删除目标数据、宿主源码写入或穿透工作区链接。

## 2. 入口与拟定签名

现有接口（保留兼容，参数缺省值以实际代码为准）：

```text
restoreToHost(zipBlob, { mode, platform, signal, timeoutMs }) -> Promise
getRestoreCapability() -> 'unknown' | 'available' | 'unsupported'
```

已实现的纯判定边界（S1，2026-10-13）：

```text
createMigrationPlan(input) -> MigrationPlan                    // src/core/migration-plan.js
evaluateWriteGate(plan, evidence) -> { allowed: boolean, reasons: string[] }   // src/core/migration-evidence.js
assessRetry(itemEvidence) -> { allowed: boolean, reason: string }             // src/core/migration-evidence.js
guardedRestore({ plan, evidence, restoreFn }) -> { wrote, reasons, result? }  // src/ui/migration-controller.js
buildTargetEvidence({ platform, handle, planTargetRef, backupConfirmed, planRevision, inFlight, permission?, backup?, conflicts?, conflictAcknowledged? }) -> evidence  // src/ui/migration-controller.js
assessTargetConflicts({ targetManifest, incomingPaths }) -> { state, conflictCount, newCount, conflicts }   // src/core/migration-target.js
buildTargetBackupEvidence({ mode, targetRef, artifact?, userConfirmed? }) -> backup                            // src/core/migration-target.js
describeBackupEvidence(backup) -> { level, label, machineVerified, userAttested }                              // src/core/migration-target.js
describeConflictState(conflicts) -> { state, label, showsNoConflict, showsUnknown }                            // src/core/migration-target.js
describeTargetWriteCapability(cell) -> { status, autoWriteConfirmed, guidance }                                // src/core/migration-target.js
buildRestoreVerification(scopeRef, restoreResult) -> VerificationEvidence[]                                   // src/core/migration-verification.js
summarizeVerification(verification) -> { total, machineVerified, userAttested, byStatus, coverage }           // src/core/migration-verification.js
selectRetryCandidates({ items, plan, evidence }) -> { candidates, rejected, gateAllowed, gateReasons }        // src/core/migration-verification.js
```

**S3 目标预检与备份契约（2026-10-13）**：目标预检/备份证据落在**独立纯模块** `src/core/migration-target.js`
（不耦合 `migration-evidence.js` 的门禁与 `host-bridge.js` 的宿主调用）。
`assessTargetConflicts` **读不到目标清单时返回 `state:'unknown'` 且 `conflictCount:null`**——
调用方**不得**把 `null` 当 0；`describeConflictState` 对 `unknown` **不显示「无冲突」**。
`buildTargetBackupEvidence` 走**自动优先 / 手动保底**：`auto` 仅在「可读 + 范围 `matches-write` +
已留存」三者齐备才 `readback-verified`；`manual` 仅在用户确认时 `user-attested`，**绝不**升级为
`readback-verified`。写入门禁新增 `conflict-unknown-unacknowledged`：**提供 `evidence.conflicts`
且为 `unknown` 时**要求 `confirmation.acknowledged.conflictUnknown===true`（未提供 `conflicts` 则该门不生效，
既有调用零变化）。宿主侧自动备份**执行**（调用 `/api/users/backup` 并落工作区）仍属 `host-bridge` 职责，
本片只交付纯判定与呈现。

**S3 写入路径契约（2026-10-13）**：`guardedRestore` 是目标写入的**唯一门禁编排**——
先 `evaluateWriteGate`，**门禁不过时 `restoreFn` 一次都不调用**（零写入）。
`index.js` 的恢复路径（单条 `btnConfirmRestore` 与批量 `runBatchRestore`）**都**经它，**不得**保留绕过门禁的第二入口。
备份证据由恢复对话框的「我已备份目标数据」勾选驱动（`#restore-backup-confirmed` → `backup.level` 为 `user-attested` 或 `none`），
对话框每次打开都**重置为未勾选**（避免静默通过）。
**2026-10-13（S3 剩余项）**：`buildTargetBackupEvidence` 已支持 `auto` 路径产出 `readback-verified`（纯判定就绪），
但**宿主侧自动备份执行**（触发 `/api/users/backup`、校验可读、落工作区留存）仍待接入 `host-bridge`；
恢复对话框现同时要求「冲突状态未知」风险确认（`#restore-conflict-ack`，见 §3.2）。

`MigrationPlan` 为**深度冻结**快照，含 `revision` / `requested` / `effective` / `capabilities`。
`requested` **一律**来自显式传入的选择快照，**不读** `src/ui/category-filter.js` 的模块级 `currentSelection`
（该值会被 `renderCategoryStats` 按「类目是否可用」写回改写，是「换包后旧勾选残留」污染源；
见 `.trellis/tasks/10-01-safe-migration-productization/research/selection-semantics.md` §3）。

判定函数不自己写宿主。网络与宿主差异仍封装在 host-bridge；不得给每个业务控制器各加一套宿主判断。
官方 API 无法取得的目标清单或备份证明不能靠伪造字段“补齐”。

## 3. 数据、权限与证据契约

### 3.1 目标写入门

plan 采用 [迁移流程契约](./migration-user-journey.md) 的 MigrationPlan。
evidence 只在本地运行流程中构造，不能直接信任导入 JSON/旧会话保存的授权。

| 字段 | 类型与含义 |
| --- | --- |
| targetRef | 当前宿主与当前用户的操作绑定；目标或登录身份变化必须失效 |
| planRevision | 必须等于当前计划 revision |
| permission | granted / denied / unknown；实际写入还必须受宿主端权限检查 |
| confirmation | 当前操作的明确确认，含敏感性、冲突未知、不兼容项与合并语义的确认情况；不可从源端授权继承 |
| backup.level | none / user-attested / readback-verified |
| backup.targetRef | 必须对应当前将被写入的目标，而非源备份或另一用户备份 |
| backup.scope | matches-write / partial / unknown；人工声明与机器核对的区别由 level 保留 |
| backup.retention | confirmed / unconfirmed；仅在内存生成、仅触发下载都不能自动标 confirmed |
| inFlight | 是否已有同一写操作在途；防止双击或重复入口同时发起 |

放行必须同时满足：当前目标/计划匹配、有明确权限、当前操作确认有效、无重复在途，且备份对本次写入范围适用并已确认留存。

- 自动优先：验证备份可读、范围与本次写入的关系，并确认留存；不能把浏览器内的临时 Blob 当唯一备份。
  **留存判据（2026-10-14 定）**：`retained === true` 当且仅当该备份**已落工作区（IndexedDB `files` store）**。
  仅入待导出区（内存）、仅触发下载、仅写 OPFS `fetch-tmp/` 临时文件**都不算**留存。
  ⇒ 自动证据的构造点是 `index.js` 的 `handleTargetPreflight()`：`fetchHostInventory` 拿到的 `file`
  同时 ① 入待导出区（用户可见可领取）② `saveFile()` 落 IndexedDB；②成功才置 `retained:true`。
- 自动不可用：引导原生备份，用户确认留存及适用范围，记录 user-attested；**不是**伪装成 readback-verified。
- 无备份/已知缺少将被改写的数据/留存未确认：不执行写入，只能交付包与下一步说明。
- 修改计划后确认必须重做；旧备份可在重新核对目标与覆盖范围后复用，不要求无意义地重复备份，但不得盲目沿用。
- 自动写入能力未知时不得用真实破坏性请求充当探测；可继续非写入预检或原生手动引导，明确能力状态。

### 3.2 冲突与预检

读得到目标清单时按真实语义比较；读不到时显示 unknown，并让用户明确了解同名可能更新。
不能将“源包有 100 条”推导成“新增 100 条”；也不能把不可访问目标列为 0 冲突。
任何无法保证源码/链接边界的写入路径都不得作为支持的自动通道；不以强制覆盖绕过 .git/objects 等保护。

**已实现（S3，2026-10-13）**：`src/core/migration-target.js` 的 `assessTargetConflicts` 按上条比较
（路径经 NFKC + 分隔符 + 大小写归一）；读不到清单 ⇒ `state:'unknown'`、`conflictCount:null`。
`describeConflictState` 保证 `unknown` **不显示成「无冲突」**。写入门禁对 `conflicts.state==='unknown'`
要求显式风险确认（`conflict-unknown-unacknowledged`）。

**已接入（2026-10-14，子任务 `10-14-migration-target-inventory`）**：**目标侧自动读取清单**已落地，
不再是「宿主无端点所以只能 unknown」。机制是复用**既有只读通道**，不新增端点、不新增依赖：

```
fetchHostBackup(platform, /* selection */ null)   # 全量导出，只读宿主
  → opfsHandleToFile / Blob                       # 既有归一
  → readZipEntryManifest()                        # 只读中央目录，不解压
  → buildTargetManifest() → alignInventories() → assessTargetConflicts()
```

- **宿主接缝**：`src/ui/host-bridge.js` 的 `fetchHostInventory({platform, signal, onPhase, taskId})`。
  宿主不支持 / 请求失败 / 用户取消 ⇒ 返回 `{manifest:null, file:null, reason}`，**不抛**
  （`L0-11` 静默降级），对话框退回上一条的 `unknown` 路径。
- **纯判定**：`src/core/target-inventory.js` 的 `buildTargetManifest` / `alignInventories` /
  `assessInventoryConflicts`（`ALIGNMENT` 六态：`aligned` / `partial` / `mismatch` / `truncated` /
  `empty` / `not-run`）。
- **⚠ 对齐守卫是本条的关键不变量**：**伪报「0 冲突」比报 `unknown` 更危险**（前者会让用户跳过风险确认）。
  故只有 `ALIGNMENT.ALIGNED` 才把清单交给 `assessTargetConflicts`；其余一律降级 `unknown`。判据按序：
  ① 清单被上限截断 ⇒ `truncated`；② 目标清单为空 ⇒ `empty`；③ 待写入为空 ⇒ `aligned`（零写入即零冲突）；
  ④ 目标清单缺**全部**标准根标记（`characters`/`chats`/`settings.json`/`secrets.json`）⇒ `partial`
  （多半是被选择过滤过的备份）；⑤ 待写入的顶层段不在目标清单顶层段集合里 ⇒ `mismatch`；
  ⑥ 其余 ⇒ `aligned`。**判据 ⑤ 对新类目也保守降级**——无法区分「目标确实没有」与「清单不全」时
  宁可 `unknown`（用户仍可显式确认），不可伪报无冲突。
- **归一口径**：两侧条目**都用原始条目名比较**，只经 `target-inventory.js` 的同一套字符串归一
  （NFKC + 分隔符 + 小写 + 去目录条目）。**刻意不**再经 `routeSource` 布局归一：目标清单来自
  当前宿主自己的备份，待写入条目会被宿主按**字面路径**落盘 —— 两者本就在同一套词汇里；
  经 `routeSource` 反而会把 `extensions/third-party/X` 与 `extensions/X` 抹成同一条 hub 路径，
  **藏掉真实的路径差异**。
- **失效判据**（`R-05`）：预检结果在**目标身份**（`platform@handle`）或**待写入载荷指纹**变化时弃用；
  每次打开对话框由 `resetRestoreBackupCheck()` 清空。**不得**用 plan `revision` 当判据 ——
  `createMigrationPlan` 每次调用都递增 revision，而门禁上下文每次现造计划 ⇒ 恒不相等、永远失效。
- **仍未接入**：**写入后**的读回核对（同机制、不同时机）——见 §3.3。

### 3.3 核对证据与完成语义

每项 VerificationEvidence 至少记录：scopeRef、unit、method、coverage、status、reason。

- unit 明确 archive-entry / character / chat 等口径；不同口径不得直接相加当覆盖率。
- method 为 automatic / user-attested；coverage 为 full / sampled / unknown。
- status 为 confirmed / accepted-exclusion / failed / unknown。
- 自动全量比对、自动抽样、用户人工确认分别呈现；抽样通过不等于已证明每个条目都正确。
- 不可达项从可验证分母中剔除时，仍必须在总范围与缺项清单中显示；不能靠改分母展示“无损全部迁移”。

MigrationOutcome 使用以下显示分类，不替换 TaskManager 的运行状态：

| outcome | 条件与文案约束 |
| --- | --- |
| completed | 本次范围均已有相应核对/明确人工确认，无失败或未决项；必须附核对方式，不暗示全部自动证明 |
| completed-with-exclusions | 可迁移部分完成且缺项已知并被接受，仍明确列出遗漏，不写“全部无损” |
| needs-verification | 已写入但存在未核对/未知状态；给出目标内具体检查步骤 |
| failed | 当前流程无法完成；保留已成功项与可取回产物，不笼统显示“什么都没做” |

**已实现（S4，2026-10-13）**：`src/core/migration-evidence.js` 的 `classifyOutcome({ verification })` 按上表优先级
（`failed` > `needs-verification` > `completed-with-exclusions` > `completed`；**空证据 ⇒ `needs-verification`**）判出四态；
`buildVerificationEvidence(input)` 归一 `scopeRef` / `unit`（archive-entry / character / chat）/ `method`（automatic / user-attested）/
`coverage`（full / sampled / unknown）/ `status`（confirmed / accepted-exclusion / failed / unknown）。
`index.js` 恢复后按 outcome 显示文案；现状**无目标侧读回核对**，`automatic` 证据只到「宿主确认写入」，
**不得**表述为「目标数据已逐条核对」。重试候选只收 `assessRetry` 放行的项（未知写入态不自动重试）。

**2026-10-13（S4 剩余项）**：核对证据构造抽到**纯模块** `src/core/migration-verification.js`
（`buildRestoreVerification` 原为 `index.js` 内联、不可单测）；`summarizeVerification` 按
`method`/`status` 汇总，供界面**分别呈现**机器核对与人工确认；`selectRetryCandidates` 实现
**双重门**（逐项 `assessRetry` + 整体重新过写入门，重试不绕门）。**自动重发执行**仍受宿主能力阻断
（无部分重试 UI）——判定层就绪，执行待接。

**2026-10-14（`10-14-migration-target-inventory`）**：「目标侧读不到清单」这一**能力**借口已不成立——
`fetchHostInventory()` 能读到宿主清单（见 §3.2）。但**写入后**的读回核对**仍未接线**：
现状 `automatic` 证据只到「宿主确认写入」，**不得**表述为「目标数据已逐条核对」。
读回核对是同一机制在**写入之后**再取一次清单并与「写入前清单 + 本次写入条目」比对，
归后续独立子任务；本片只做**写入前**预检与保底。

用户取消、上传超时或连接断开后，如果宿主可能已经写入，标 needs-verification；不得自动宣布回滚。
原生手动导入结束后也需要用户按清单确认，不因点击“我已导入”就伪造底层文件一致性证明。

### 3.4 安全重试

itemEvidence 包含 observedState（not-applied / applied / unknown）、repeatSafe、currentTargetMatches、currentPlanMatches。
只有 not-applied、repeatSafe=true 且目标/计划仍匹配的项才具有重试候选资格；执行仍重新经过当前写入门。

- repeatSafe 必须来自具体操作的契约和验证，不能仅因为 HTTP 方法是 POST/PUT 或 merge 就假定幂等。
- 已成功项不重复写；部分执行的不可拆分批次按整个操作边界处理，不能假装已有逐文件恢复能力。
- 无法确认是否已写入时，不提供“重试整包”作为默认动作，转人工核对。
- 若用户改目标/范围、目标内容变化或身份变化，重试候选资格失效，回到新计划与确认。

## 4. 校验与错误矩阵

| 情况 | 结果 |
| --- | --- |
| backup.level=none | 拒绝写入；可下载包或完成备份 |
| 备份是源端/另一用户的 | 拒绝作为目标备份证据 |
| 只有 download-triggered | 不自动标备份留存，等待可靠留存证据或用户确认 |
| 原生备份经用户明确确认 | 可作为 user-attested 证据，界面保留证据级别 |
| 无目标清单 | 冲突为 unknown，不是 0；经明确风险确认与其他门满足才可执行已支持的合并通道 |
| 权限未知/拒绝或确知不支持自动写 | 无自动写请求；解释替代路径 |
| 相同操作双击 | 第二次请求不得发出 |
| 超时且写入状态未知 | needs-verification；不自动重试，不宣称已回滚 |
| 成功项与失败项混合 | 分项报告，只考虑可证明安全的失败项 |

## 5. 正常、基本与反例

- 正常：目标原生备份可核对并留存，当前用户确认 merge，写后自动核对受支持范围。
- 基本：自动备份不可用，用户原生备份并确认；写后人工检查目标角色与聊天，标明人工证据。
- 反例：服务器实际已经写了一半，客户端超时后自动重新发整包，最终只因第二次 HTTP 200 就显示全部完成。

## 6. 必须测试的断言点

拟新增 test/migration-write-gate.test.js 与 test/migration-verification.test.js：

- 无备份、备份目标错误、留存未知、确认过期、身份变更、权限未知时写请求数为零。
- user-attested 不被归一成 readback-verified；导入报告不能注入有效确认。
- 未知冲突不显示成 0；重复点击只有一个在途写入。
- 超时/取消未知状态不能变成“回滚成功”；部分成功记录不会被覆盖成整批失败或成功。
- assessRetry 对 unknown/applied/不安全/目标变化全部拒绝，对满足全部条件的 not-applied 返回候选可重试。
- 保留 test/restore-chain.test.js、restore-batch.test.js、restore-probe.test.js、restore-manifest.test.js 的既有行为断言。

## 7. 错误与正确做法

错误：仅判断 fetch 的 ok 就显示“迁移完成”，失败则直接再次 restoreToHost。
正确：先取得阶段结果和核对证据，再生成 MigrationOutcome；重试前再次检查目标、计划、备份与操作安全性。

判别力要求：把实现中的确认检查、备份检查或未知状态检查各删掉一次，对应负例必须失败；
只断言“函数被调用了”不足以证明安全门有效。
