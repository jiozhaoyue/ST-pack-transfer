# 安全迁移产品化分期执行计划（总任务）

> 当前只规划。后续执行应使用逐任务计划执行流程；若用户另行要求子代理，才按其模型与并发授权派发。本文件不是自动开工命令。
> 总任务先划分独立交付；各子任务在 S0 证据收敛后补齐自己的测试/修改步骤并单独评审，禁止将整份路线一次性实施。

**目标**：普通用户完成完整自用跨宿主迁移，并能理解风险、保存保底、核对结果。
**架构**：保留转换/存储核心，纯计划与证据判定从入口编排分离；向导和高级工作台共享控制器与 TaskManager。
**技术栈**：现有 JavaScript ESM、zip.js/fzstd 本地副本、IndexedDB/OPFS、Vite/Vitest；不新增依赖。

## 0. 本轮规划进度

- [x] 完成 18 项产品裁定与新任务/文档范围授权。
- [x] 新建独立 planning 总任务；不启动任务、不切换旧同步指针。
- [x] 回填 PRD 的需求与可观察验收。
- [x] 写出渐进式设计与三份目标规范。
- [x] 同步工作流正文、planning / planning-inline 的批量问答约定和规范索引。
- [x] 配置 implement.jsonl/check.jsonl 的真实规范上下文并验证。
- [x] 复核文档链接、状态标记、需求覆盖、大小、Git diff 和修改范围。
- [x] 向用户提交本轮规划评审；本轮不进入产品实现。

## 1. 依赖与独立交付

顺序：S0 → S1 → S2/S3 → S4 → S5 → S6；S7 为 S6 之后的独立离线交付。
S2/S3 在契约稳定后可独立推进，但本轮没有并发代理或实施授权。
每个 S 编号是拟建子任务的责任，不是已创建任务或已完成工作。

| 分片 | 独立交付 | 前置 | 需求/验收 |
| --- | --- | --- | --- |
| S0 | 真实能力矩阵、范围语义与操作风险证据 | 本规划评审 | R-01/03/05/06/07；AC-02/07/12 |
| S1 | 统一计划和纯判定安全门 | S0 | R-03/05/06/07/08；AC-02/04/05/08/09 |
| S2 | 源端引导与三类独立交付 | S1 | R-02/04/05/08；AC-01/03/04/11 |
| S3 | 目标预检、备份与确认合并 | S1 | R-01/05/06；AC-04/05/06/07 |
| S4 | 核对报告与安全重试 | S2、S3 | R-01/05/07；AC-07/08 |
| S5 | 默认向导整合、旧资料兼容和渐进切换 | S4 | R-08/09/10；AC-01/09/10/11 |
| S6 | 用户内部验收、公开发布前外部试用与说明同步 | S5 | R-12；AC-12/13 |
| S7 | 真正的同源 file:// 离线产物 | S6；独立技术验证 | R-11；AC-14 |

R-13/AC-15 属本轮工作流文档交付，不重复拆成产品代码任务。

## 2. S0：事实与风险证据（下一步应先细化这一片）

**资料落点**：本任务 research/ 下的 host-capability-matrix.md、selection-semantics.md、retry-boundaries.md（后续新增）。
**读范围**：src/ui/host-bridge.js、src/ui/category-filter.js、src/core/plan-preview.js、既有 restore/plan/resume 测试及相关官方文档；禁止从宿主内部源码“发现”未承诺 API。

- [x] 按宿主/版本/入口列出转换、源读、目标写、备份、核对，给证据日期和自动/人工/未知状态。
      —— *2026-10-13：`research/host-capability-matrix.md`（15 条 `file:line` 证据 E-1…E-15）*
- [x] 对照 currentSelection、计划计数和有效请求，说明普通类目及 backups/cache/appPrivate 的迁移语义；不让旧脚本排除策略变成全选默认。
      —— *2026-10-13：`research/selection-semantics.md`（暴露 `currentSelection` 13 键 vs `FULL_SELECTION` 10 键不一致、`renderCategoryStats` 写回污染、backups 双轨）*
- [x] 列管理员级内容、纯库聊天接口缺席、只能原生手动导入等情况的可达边界。
      —— *2026-10-13：`research/host-capability-matrix.md` §3（ST 无整包恢复、PT 原生归档不可转换、`targetVerify` 四宿主全 `?`）*
- [x] 列具体操作的可拆分性、幂等性和核对方法；不能证明的操作明确不可自动重试。
      —— *2026-10-13：`research/retry-boundaries.md`（四类操作 × 幂等/可拆分/重试资格）*
- [ ] 标注各异步阶段的超时/取消边界和测量任务；不凭经验给统一短超时。
      —— *部分：`retry-boundaries.md` §2 已覆盖「取消是请求级」与「非 404/405 不回退」；**各阶段的超时数值与测量任务未做**，留待后续*
- [ ] 将任何新的范围取舍交回用户，不擅自缩小已定的默认完整迁移。
      —— *部分：已把「默认全选以 13 键还是 10 键为准」作为 OQ-1 交回（见子任务 `10-13` PRD）；**未做新的范围取舍***

**完成判据**：矩阵每格有证据或明确“未知+固定降级”，不存在“格式支持=宿主自动写支持”的混用。
**安全边界**：本片不灌入真实实例；如需要 Dev 实验，先核实授权与端口。旧超长规范拆分另列文件范围确认。

## 3. S1：统一计划与纯安全判定

**拟新增**：src/core/migration-plan.js、src/core/migration-evidence.js。
**拟新增测试**：test/migration-plan.test.js、test/migration-write-gate.test.js。
**既有回归**：test/plan.test.js、test/restore-probe.test.js。

> **2026-10-13：本片由独立子任务 `10-13-migration-plan-and-write-gate` 实施完成**（测试全绿、五守卫 + build 零回归）。

- [x] 在子任务计划中先写出默认全选、权限未知、旧选择污染、revision 变化、无备份、伪造确认与重复在途的失败测试。
- [x] 用既有选择和能力输入生成唯一计划；保留 requested/effective 区别和排除原因。
- [x] 实现 evaluateWriteGate 与 assessRetry 的纯判定，按三份规范的字段和错误矩阵逐项验证，不发网络请求。
- [x] 对移除确认/备份/未知状态保护的变异实现检查负例判别力，避免测试只是复述 mock。
- [x] 对同一夹具比较旧生成计划与新快照映射，解释任何差异而非静默接受。

**完成判据**：安全门负例拒绝率应为全覆盖；不得靠 UI 禁用按钮代替核心调用前门禁。
**回退点**：此时尚未切换默认入口，撤回纯判定接入不会改用户数据。

## 4. S2：源端引导与交付

**拟新增**：src/ui/migration-controller.js、src/ui/migration-wizard.js（只接源端职责）。
**拟修改**：index.js:1493 附近的宿主导出编排、src/ui/workbench-template.js、src/ui/export-queue.js；必要时 src/ui/category-filter.js。
**拟新增测试**：test/migration-journey.test.js 的源端部分。

> **2026-10-13：本片由子任务 `10-13-migration-source-delivery` 实施「源端三类交付」核心**（见其 prd/implement）。
> 已完成第 3、4 项与第 1 项的只读锁定；**第 2 项（控制器委托冻结计划）与第 5 项（确认失效）留待 S5 入口切换**——
> 本轮刻意不引入第二个执行者（`10-13` PRD `R7`），以免与既有 `handleHostExport` 并存两个执行者。

- [x] 先锁定原 handleHostExport 的计划、暂停、产物队列行为。（只读锁定；未改转换/暂停逻辑）
- [ ] 由控制器冻结计划、绑定确认，调用现有宿主导出与转换，而非复制引擎。（留 S5）
- [x] 交付源备份、目标包、独立报告；保留三者不同覆盖范围与用途。
- [x] 验证目标 ZIP 没有新外层包裹，报告无秘密，下载触发不等于已保存。（无外层套装已验证；「下载≠已保存」由既有 export-queue 语义保留）
- [ ] 验证改源/目标/选择后旧确认失效，旧回调不污染当前步骤。（留 S5）

**完成判据**：用户能分清保底文件和目标导入包，目标包保持原生布局；无后端仍可走完源端。
**回退点**：先让既有按钮委托新控制器，再接向导，避免同时保留两个实际执行者。

## 5. S3：目标备份与确认写入

**拟修改**：src/ui/migration-controller.js 的目标职责、index.js:1989 附近恢复装配、src/ui/host-bridge.js 的必要能力接缝。
**拟测试**：test/migration-write-gate.test.js 的集成断言；现有 restore-chain/batch/manifest/probe 测试。

> **2026-10-13：本片由子任务 `10-13-migration-target-write-gate` 实施「写入门禁」核心**。
> 已完成第 1、4、5 项与第 2、3 项的**部分**（目标身份 + 手动声明保底）；**自动目标备份与冲突预检留后续**。

- [x] 用记录请求次数的端口替身验证无备份/过期确认/目标变化/权限未知时零写入。（`test/migration-target-gate.test.js`，9 用例）
- [ ] 先完成目标身份、有效范围、冲突未知与自动写能力判定；不支持时给原生指引。（目标身份已做；**冲突未知与自动写能力判定留后续**——ST 无恢复能力仍由既有 `RESTORE_UNSUPPORTED` 兜底）
- [ ] 接入自动优先、手动声明保底的备份证据，不把源备份或临时 Blob 当成目标保底。（**手动声明**已做；**自动备份留后续**）
- [x] 确认后只执行受支持的 merge；保留目标独有文件和空目录。（沿用既有 `merge` 语义）
- [x] 双击、切换账户、取消和超时都进入明确状态，不把中断当作回滚。（门禁加 `inFlight` 拦双击；既有取消/超时状态保留）

**完成判据**：真实写入没有任何绕过安全门的第二入口；无法满足门禁时仍能交付包和指引。
**回退点**：停止新写入；已写数据只能依备份与新授权恢复，禁止用 git 回退冒充数据回滚。

## 6. S4：核对与安全重试

**拟修改**：src/core/migration-evidence.js、src/ui/migration-controller.js、src/ui/migration-wizard.js；复用 src/core/report.js 的既有转换计数。
**拟新增测试**：test/migration-verification.test.js。

> **2026-10-13：本片由子任务 `10-13-migration-verification-retry` 实施「核对结论 + 重试判定」核心**。
> 第 1/3/4/5 项已做；**第 2 项的「自动全量核对」未做**——现状无目标侧读回，`coverage` 只到 `full` / `unknown`。

- [x] 定义每类核对的单位、范围、方式和状态，不混用包条目/角色/聊天计数。（`buildVerificationEvidence` 的 `unit` 口径）
- [ ] 写入返回后才进入核对；自动全量、抽样、人工确认和未知分别显示。（**写入后才核对**已做；**自动全量读回核对未做**）
- [x] 落实 completed / completed-with-exclusions / needs-verification / failed 的区别。（`classifyOutcome`）
- [x] 仅将可证明未应用且 repeatSafe 的项送入重试候选，重新经过目标安全门。（`assessRetry` 判定已做；**自动重发未做**）
- [x] 验证未知状态、不可拆分批次、目标/计划变化都不能自动重试。（`test/migration-verification.test.js`）

**完成判据**：对“服务器写一半后客户端断开”的夹具，不重复成功项、不伪造完成、不丢掉可取回产物。

## 7. S5：默认向导切换与旧资料兼容

**拟修改**：index.js 装配、src/ui/workbench-template.js、style.css、src/storage/db.js 的会话兼容边界。
**拟新增测试**：test/migration-legacy.test.js；保留 test/single-template-source.test.js、db-origin.test.js、convert-resume*.test.js。

> **2026-10-13：S5 分步进行，第一步（旧资料兼容 + 共享状态接缝）由子任务 `10-13-migration-legacy-shared-state` 实施完成**。
> 第 4/5/6 项（向导 UI / 可访问性 / 默认入口切换）留 S5 第二步。

- [x] 旧状态夹具先验证：旧包、旧半成品、旧会话可读；新保存失败不覆盖旧 active_session。（`saveWorkspaceState` 备份旧记录到 `active_session_prev`）
- [x] 实现最小旧会话保留/判别，不先升级 DB_VERSION，不清库。（`normalizeLegacySession` / `isResumableSession`；`DB_VERSION` 仍为 2）
- [ ] 向导与高级工作台切换时共享选择与任务，不重新挂第二套执行监听器。（**共享接缝** `createMigrationSession` 已建；**向导 UI 与监听器验证留第二步**）
- [ ] 按宿主官方支持位置装配复杂 UI，设置只保留入口/偏好；同步模板节点守卫与控制消费守卫。（留第二步）
- [ ] 验证键盘焦点、手机关键按钮可达、空态与禁用原因，进度 rAF 合帧。（留第二步）
- [ ] 最后切默认入口；如果回退，旧入口和新旧用户文件都仍可用。（留第二步）

**完成判据**：升级不会丢资料；无法续跑的旧任务有明确安全重开路径；三形态核心不分叉。

## 8. S6：内部验收与公开发布关口

**拟新增**：e2e/specs/migration.e2e.cjs；必要的隔离合成夹具与验收报告。
**拟修改**：README.md 的能力/限制/使用说明（后续独立授权范围，不在本轮改）。

- [ ] 跑全量单测、五守卫和构建；相对实施前新基线零回退，不能沿用历史测试数字。
- [ ] 核实 Dev 端口、插件版本、夹具隔离，再验证每条拟宣称支持的路径；无法自动化的形态单列人工证据。
- [ ] 用户本人只得到任务目标而非操作脚本，在无 AI 指导下完成迁移，记录卡点并处理阻塞。
- [ ] 将“内部验收通过”与“公开发布就绪”分开；后者必须补未参与开发者的外部试用。
- [ ] README 不把包转换、写入返回、自动核对、人工确认和离线能力混为一谈。

**完成判据**：计划中的每条公开承诺都能定位到相应证据，而不是只看测试总数。

## 9. S7：真正的双击离线交付（后续独立任务）

**拟评估/修改**：vite.config.js、现有构建脚本、独立入口装配；e2e/standalone/ 下的 file:// 专用用例。

- [ ] 用现有依赖验证自包含构建、Worker 和本地字体/样式在 file:// 下的可行路径；需要新依赖则先列版本与理由获准。
- [ ] 从同一核心/模板生成产物，不手工维护第二份业务 HTML/JS。
- [ ] 完全阻断外部网络，实际选择包、转换并领取结果。
- [ ] 对比插件/HTTP 与 file:// 产物语义，禁止只有提示页也标通过。

**完成判据**：真正双击运行；此片没有完成前，第一阶段文案不得声称其已可用。

## 10. 验证命令与执行纪律

已存在的产品质量命令：

    npm test
    npm run check:css-scope
    npm run check:dom-injection
    npm run check:template-source
    npm run check:dom-scope
    npm run check:control-consumer
    npm run build

有实例/独立 Web 条件且授权后再运行 npm run e2e / npm run e2e:web；不要以为只读规划授权包含启动服务或灌入数据。
新测试创建后可用本地 node_modules/vitest/vitest.mjs 定向执行，禁止为了跑测试擅自安装包。

每片共同步骤：先补失败测试 → 确认失败原因正确 → 最小实现 → 定向测试 → 相关全量回归 → diff → 规范/文档同步 → 用户确认提交范围。
若随后获准提交，使用显式 pathspec，校验暂存区恰等于本片集合；按仓库规则推送 origin，不推 upstream。
本轮不生成实际代码补丁，不提交、不推送、不执行上述产品命令。

## 11. 不能越过的下一道门

本总计划不把所有子任务变成“可立即开工”。下一步是细化 S0 证据与 S1 判定契约，
只有对应子任务的 PRD、技术设计、测试步骤和风险范围完成评审后，才能单独获得实施授权。
