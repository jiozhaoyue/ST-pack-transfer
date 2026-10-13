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
```

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
- 自动不可用：引导原生备份，用户确认留存及适用范围，记录 user-attested；**不是**伪装成 readback-verified。
- 无备份/已知缺少将被改写的数据/留存未确认：不执行写入，只能交付包与下一步说明。
- 修改计划后确认必须重做；旧备份可在重新核对目标与覆盖范围后复用，不要求无意义地重复备份，但不得盲目沿用。
- 自动写入能力未知时不得用真实破坏性请求充当探测；可继续非写入预检或原生手动引导，明确能力状态。

### 3.2 冲突与预检

读得到目标清单时按真实语义比较；读不到时显示 unknown，并让用户明确了解同名可能更新。
不能将“源包有 100 条”推导成“新增 100 条”；也不能把不可访问目标列为 0 冲突。
任何无法保证源码/链接边界的写入路径都不得作为支持的自动通道；不以强制覆盖绕过 .git/objects 等保护。

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
