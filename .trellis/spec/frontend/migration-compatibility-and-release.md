# 迁移兼容、渐进交付与验收契约

> 状态：2026-10-01 用户已裁定的目标契约，**尚未实现**。用户授权的是规划文档，不是实现或发版。
> 本页仅规定该产品化功能的验收，不把新的实例验证前提强加给全仓所有日常测试。

## 1. 范围与触发

适用于旧工作区/断点兼容、迁移向导接入、高级工作台保留、无后端降级、四宿主能力声明、真人验收及后续双击离线交付。
用户选择保留核心渐进重构，而不是整体重写；旧资料无损可读，旧任务必要时安全重开。

现有证据（167796d）：
- src/storage/db.js:10-17：DB_VERSION=2，files/workspace/preferences 三个 store。
- 同文件:338-354：saveWorkspaceState/loadWorkspaceState 使用 active_session。
- src/core/task-manager.js:26-32：running/paused/aborted/done/failed 五种执行状态。
- index.html:18-37：唯一模板骨架，file:// 提示脚本和 module 入口；并不具备真正双击运行能力。
- package.json 的 scripts 提供单测、五条静态守卫、构建、实例 E2E 和独立 Web E2E。

## 2. 入口与版本签名

保留既有存储与执行接口，不新增第二套长任务引擎：

```text
saveWorkspaceState(state) -> Promise
loadWorkspaceState() -> Promise
TaskManager.start(id, label, { resumable, totalBytes }) -> control
```

拟定兼容判别结果 LegacyDisposition：

```text
{ readable: boolean,
  action: 'continue-supported' | 'reopen-safely' | 'read-only-recovery',
  reason: string }
```

以上结果是新 UI/适配逻辑要遵守的契约，不是当前已实现导出。
没有批准无条件增加 DB_VERSION、清库迁移、引入服务端或替换打包工具。

## 3. 兼容、交付与验收数据契约

### 3.1 旧状态保留

- 旧包与半成品保留可读、可取回，新增向导不调用 clearAll/deleteFile 来“初始化干净环境”。
- 开启新迁移不等于恢复旧迁移；两者在入口与有效选择上明确区分。
- 覆盖 active_session 前必须保存可回读的旧会话记录，保留对旧文件/半成品的引用；保存失败则不覆盖旧状态。
- 不为了保留会话而重复拷贝 GB 级包；复用现有 files/OPFS 的引用，并保护其生命周期。
- 旧断点支持当前契约时才继续；不兼容则说明原因、保留旧产物并从源安全重开，禁止假装续传成功。
- 不能将“已读取条目”当成“已写入产物”；继续遵守 [断点不变量](./resume-checkpoint-invariant.md)。
- 浏览器存储不可用或空间不足时，明确暂存风险和保存/重新选源路径；不静默删除旧数据腾空间。

### 3.2 单一核心与回退

保留 zip-io、transform、plan-preview、Report、TaskManager、ExportQueue 的既有职责。
迁移计划表达用户意图与操作门禁，不成为另一个压缩引擎或长任务运行状态机。
向导与高级工作台共用同一状态、模板真源和底层操作；不得留下新旧两个并行写者。
每一片切换前用相同夹具比较计划和产物语义；若回退新 UI，旧包/旧状态仍可读取。
回退代码不等于回滚目标数据；真实数据恢复仍需要备份与独立授权。

### 3.3 能力矩阵与验收记录

每个受支持宿主路径的记录至少包含：host、version、pluginRevision、entry、capability、method、scope、result、observedAt。

- entry 区分插件 / 独立 Web / 后续 file://，capability 区分转换 / 源读取 / 目标写入 / 备份 / 目标核对。
- method 区分自动测试 / 原生流程人工核对 / 用户试用；未验证不能填 passed。
- 四种目标布局 st/l/tt/pt 的格式测试不自动证明四个宿主都能安装插件或直接恢复。
- TT 无浏览器自动化通道等情形，显式记录人工验证，不把不能运行的测试算通过。
- 纯库聊天接口缺席时按真实情况列依赖未满足或覆盖不足；不能借“可选增强静默降级”掩盖缺失聊天。
- 无 Authority 时基础流程必须完整可用；增强失败不能阻断主路径。增强是否可用与用户数据覆盖是否完整是不同维度。

### 3.4 两个交付关口

第一关口：插件向导的内部验收。

- 既有基础测试零回归；本功能新增负例真正具有判别力。
- 支持路径在 Dev 实例/隔离测试夹具上有证据；E2E 不连 Real。
- 用户本人在无 AI 代操作或逐步指导下完成主迁移，记录中断、误解与未完成项，处理阻塞点。

第二关口：公开发布。

- 在内部验收之上，补未参与开发者的外部试用；未完成前不宣称已通过外部可用性验证。
- 安装方式、能力表、限制和实际实现一致；Git URL 安装后的最终用户不需要 npm install/build。
- 独立双击包是后续独立交付，不阻塞第一关口；它尚未通过前不得宣传已支持 file://。

后续离线交付：同一核心与模板构建成可双击运行的自包含产物，本地依赖与 Worker 都须适配 file://；
离线断网下完成选包、转换和保存结果。仅提示启动服务器不算通过。

## 4. 校验与错误矩阵

| 场景 | 必须行为 |
| --- | --- |
| 旧记录缺少新字段 | 只读解释或安全补齐显示模型；不删除原记录 |
| 旧断点不兼容 | 保留半成品与来源引用，显示安全重开；不显示已续跑 |
| 新会话保存失败 | 不覆盖旧 active_session；提示暂存不可用 |
| 无后端 / 增强超时 | 基础主路径继续，数据覆盖风险另行说明 |
| 某宿主未实测 | 能力表写未验证，不以格式单测冒充宿主测试 |
| 外部用户尚未试用 | 可记录内部验收，公开发布关口未通过 |
| file:// 只显示说明页 | 离线交付未通过 |

## 5. 正常、基本与反例

- 正常：旧工作区包仍可导出，新增向导完成 Dev 迁移并核对，用户本人独立验收。
- 基本：旧断点不能续跑，但旧产物保留、来源可重选；用户清楚知道需重新执行哪些步骤。
- 反例：为了让向导看起来干净，启动时清掉 active_session 和缓存，再以单测全绿宣称升级无损。

## 6. 必须测试的断言点

拟新增 test/migration-legacy.test.js 与 e2e/specs/migration.e2e.cjs：

- 旧工作区、无新字段记录、旧半成品夹具读取后原数据不变；不能恢复时仍可导出。
- 保存失败不覆盖旧会话；新旧入口不会重复启动同一写入。
- 无后端、无网络外链与低配额分支都有可理解的降级。
- 源与目标相同夹具下，重构前后有效选择和规范化产物条目一致；ZIP 容器时间戳不能单独用来判内容变化。
- Dev 端口守卫拒绝 Real；实例插件版本与验证版本一致。
- 后续离线测试必须关闭外部网络，在 file:// 真正执行转换，不只测提示文案。

现有验证命令（实现阶段执行；本次文档规划没有运行产品测试）：

    npm test
    npm run check:css-scope
    npm run check:dom-injection
    npm run check:template-source
    npm run check:dom-scope
    npm run check:control-consumer
    npm run build
    npm run e2e
    npm run e2e:web

运行 e2e 前先核实运行器参数和 Dev 身份，不因列表写了命令就直接连接实例。
本仓 package.json 未定义 lint/typecheck 命令，不虚构 npm run lint 或 typecheck 的通过结果。

## 7. 错误与正确做法

错误：把旧资料清掉后跑通新向导，或在一次自动化跑通后声称普通用户一定会用。
正确：保留旧数据夹具做升级/回退对照，分别记录自动化证据、用户内部验收、外部试用和离线交付状态。

与 [迁移用户流程](./migration-user-journey.md)、[写入安全与证据](./migration-safety-and-evidence.md) 一起评审；
不以任何一页单独通过代替整条迁移旅程完成。
