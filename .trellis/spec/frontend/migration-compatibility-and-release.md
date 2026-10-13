# 迁移兼容、渐进交付与验收契约

> 状态：2026-10-01 用户已裁定的目标契约；**2026-10-13 按用户裁定 U-1 改写「旧数据兼容」一节（硬拒绝，破坏性变更）**。
> S5 第二步（向导默认入口）与 S7（file:// 单文件离线）已于 2026-10-13 实现。用户授权的是规划文档，不是发版。
> 本页仅规定该产品化功能的验收，不把新的实例验证前提强加给全仓所有日常测试。

## 1. 范围与触发

适用于旧工作区/断点兼容、迁移向导接入、高级工作台保留、无后端降级、四宿主能力声明、真人验收及后续双击离线交付。
用户选择保留核心渐进重构，而不是整体重写；**旧会话状态按 U-1 一律作废（见 §3.1），旧文件资产不删**。

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

### 3.1 旧状态处置（**2026-10-13 按 U-1 改写：硬拒绝**）

**用户裁定（U-1，原话）**：「禁止兼容旧数据，任何即使没改也要强制不兼容，强制做坏」。

据此，**会话状态**与**磁盘文件资产**被明确分成两类，处置相反：

| 类别 | 处置 | 判据 |
| --- | --- | --- |
| **会话状态**（`active_session` 记录、断点资格、旧授权） | **一律作废**，显式拒绝 + 从源安全重开 | `record.schemaVersion !== 2` |
| **文件资产**（源包、半成品 zip、OPFS 半成品） | **不删、不动、可继续导出** | 与版本签名无关 |

- **`SESSION_SCHEMA_VERSION = 2`**；`classifySessionCompatibility(record)` 对
  `schemaVersion` 缺失 / `1` / 其他数字 / 非数字 **一律** 返回
  `{compatible:false, action:'reject-incompatible', reason}`。
- **结构完全相同的 v1 记录也被拒** —— "字段恰好没变" 是**推断**不是**证据**，
  不做"看起来一样就放行"的隐式兼容。这是本次破坏性变更的**核心判据**。
- `readSessionRecord(record)` **只读解释**：原字段原样带出（同一对象引用），
  **不写回、不补默认值**。旧实现 `normalizeLegacySession`（缺字段补 `schemaVersion:1` 并标 `legacy`）
  **已删除**。
- `isResumableSession(record)` **先过兼容门**：不兼容即返回
  `{resumable:false, reason}`，**连断点都不看**（避免"断点齐全 ⇒ 隐式沿用旧授权"）。
- `src/storage/db.js` 的 `saveWorkspaceState` 经 `buildWorkspaceRecord()` 落盘时
  **强制**写入 `schemaVersion: 2`（且位于展开之后，调用方传入同名字段无法覆盖）；
  `loadWorkspaceState` **原样返回**，不迁移、不清除 —— 判定权在上层。
- 覆盖前仍把现有 `active_session` 备份为 `active_session_prev`：那是**不丢用户数据**，
  与「兼容旧格式」是两件事（备份保留，格式照样作废）。
- 界面消费点：`src/ui/migration-wizard.js` 的 `buildSessionGateVerdict()` →
  `index.js` 在恢复工作区前先 `wizard.showGate(savedState)`；命中即**不恢复**，
  显示「旧会话已作废（不兼容当前版本）」+ 原因 + 「从源重开」。
- `src/ui/migration-controller.js` 的 `createMigrationSession` 提供向导与工作台**共享**的
  选择/任务接缝（`10-01/design.md` §3.1：单一用户意图）。

**与旧契约的差异（回退须知）**：`git revert` 相关文件可恢复旧归一语义，
但**已按新契约作废的旧会话不会"复活"** —— 回退代码 ≠ 回滚数据。

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

### 3.5 向导默认入口与 file:// 单文件离线（2026-10-13 实现）

**向导默认入口（S5 第二步）**：

- 默认视图 = 向导（`#app.app-container[data-wb-view="wizard"]`）；高级工作台经
  `#btn-wb-view-toggle` 切换，**同一份 DOM、同一份模板**，不复制第二套 UI。
- 六步：`source → target → scope → check → run → verify`（`src/ui/migration-wizard.js` 的 `WIZARD_STEPS`）。
- 披露机制：模板给区块打 `data-wb-step="<id>"`，CSS 用
  `.wb-block [data-wb-step]:not([data-wb-step="<当前>"])` 隐藏非当前步。
  **⚠ 必须限定在 `.wb-block` 内** —— 步骤条自己的按钮也带 `data-wb-step`，
  用裸后代选择器会让它们被自己的规则隐藏（2026-10-13 实测：6 个按钮全 `display:none`，向导无法导航）。
  该回归由 `test/migration-wizard.test.js` 的「向导外壳必须落在 `.wb-block` 之外」锁住。
- 视图切换**不重置**步骤与共享选择（`createMigrationSession` 单一用户意图）。
- 可访问性：步骤条为 `role="tablist"` + `aria-current="step"`；键盘 `←/→/Home/End` 移动；
  `#wizard-step-counter` 带 `aria-live="polite"`。
- **E2E 约定**：默认入口变了 ⇒ 测高级工作台的 spec 必须显式
  `common.useAdvancedView(page)`（否则点隐藏控件必然超时）；
  向导本身由 `e2e/standalone/specs/wizard.e2e.cjs` 覆盖。

**file:// 单文件离线（S7）**：

- 产出：`npm run build:offline` → `dist-offline/st-zip-converter-offline.html`（**单文件**，可双击）。
- 与既有 `npm run build` **并存**：那个仍是 `type="module"` 的 HTTP 形态，本脚本是独立入口，不改它。
- 三条硬要求（都由 `offline-single-file.e2e.cjs` 的 28 条断言锁住）：
  1. **零外部 `http(s)` 请求**（CSS/JS/字体全部内联为 data URI）；
  2. `file://` 下工作台**真的渲染**（不是提示页）；
  3. 完成一次真实「选包 → 转换 → 领取结果」，产物**落盘后读回条目**（不是只看"触发了下载"）。
- Worker：`src/core/worker-factory.js` 是唯一构造点，离线构建用 `resolve.alias` 换成
  `scripts/offline/worker-factory.stub.js`（IIFE 单包不接受 `new Worker(new URL(...))`）；
  运行期再由 `worker-client.js` 的 `isOfflineBuild()` 兜一道。
- 字体回退：`@font-face` 里仓库不存在的 `.ttf` 项由构建脚本剔除，否则单文件里会残留一条
  `url(../webfonts/*.ttf)` 外部引用（`file://` 下必 404）。

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
| 旧会话记录（`schemaVersion !== 2`，**含结构未变的 v1**） | **显式拒绝**：不恢复、不归一、不补默认值；显示原因 + 「从源重开」。磁盘上的包与半成品文件**不删** |
| 旧记录里的包/半成品文件本身 | 保留可读、可取回；新增向导不调用 clearAll/deleteFile 来"初始化干净环境" |
| 旧断点不兼容 | 保留半成品与来源引用，显示安全重开；不显示已续跑 |
| 新会话保存失败 | 不覆盖旧 active_session；提示暂存不可用 |
| 无后端 / 增强超时 | 基础主路径继续，数据覆盖风险另行说明 |
| 某宿主未实测 | 能力表写未验证，不以格式单测冒充宿主测试 |
| 外部用户尚未试用 | 可记录内部验收，公开发布关口未通过 |
| file:// 只显示说明页 | 离线交付未通过；**离线单文件产物**已另行交付并通过（见 §3.5） |

## 5. 正常、基本与反例

- 正常：旧工作区包仍可导出，新增向导完成 Dev 迁移并核对，用户本人独立验收。
- 基本：旧会话被判不兼容，但旧产物保留、来源可重选；用户清楚知道需重新执行哪些步骤。
- 反例 A：为了让向导看起来干净，启动时清掉 active_session 和缓存，再以单测全绿宣称升级无损。
- 反例 B（2026-10-13 新增）：把旧会话"洗"成可读形态（补默认字段、按"结构看起来一样"放行）
  再宣称兼容 —— 用户会以为旧授权/旧断点仍然有效。**禁止**；一律显式拒绝。

## 6. 必须测试的断言点

拟新增 test/migration-legacy.test.js 与 e2e/specs/migration.e2e.cjs（**已实现**：`test/migration-legacy.test.js`、
`test/migration-wizard.test.js`、`e2e/standalone/specs/wizard.e2e.cjs`、`e2e/standalone/specs/offline-single-file.e2e.cjs`）：

- **不兼容门**：`schemaVersion` 缺失 / `1` / `99` / 非数字 ⇒ 一律 `reject-incompatible`；
  **结构完全相同的 v1 仍被拒**（与 v2 对照，两条断言互不冗余）；`isResumableSession` 对 v1
  **断点齐全也拒**。
- **落盘侧**：`buildWorkspaceRecord()` 写入的 `schemaVersion` 恒为 2，调用方传入的 1 无法覆盖；
  落盘记录必被判为 `compatible`（写入侧与读取侧闭环）。
- **向导**：默认视图 = `wizard`、起始步 = `source`、步骤条六步、键盘导航、
  视图切换不重置步骤；**向导外壳必须落在 `.wb-block` 之外**（防披露规则自锁）。
- 旧工作区、无新字段记录、旧半成品夹具读取后原数据不变；不能恢复时仍可导出。
- 保存失败不覆盖旧会话；新旧入口不会重复启动同一写入。
- 无后端、无网络外链与低配额分支都有可理解的降级。
- 源与目标相同夹具下，重构前后有效选择和规范化产物条目一致；ZIP 容器时间戳不能单独用来判内容变化。
- Dev 端口守卫拒绝 Real；实例插件版本与验证版本一致。
- **离线**：`file://` 下**零外部 http(s) 请求**、工作台渲染、完成一次真实转换且产物可读回
  —— 不得用"提示请开服务器"冒充通过。

现有验证命令（实现阶段执行；本次文档规划没有运行产品测试）：

    npm test
    npm run check:css-scope
    npm run check:dom-injection
    npm run check:template-source
    npm run check:dom-scope
    npm run check:control-consumer
    npm run build
    npm run build:offline
    npm run e2e
    npm run e2e:web

运行 e2e 前先核实运行器参数和 Dev 身份，不因列表写了命令就直接连接实例。
本仓 package.json 未定义 lint/typecheck 命令，不虚构 npm run lint 或 typecheck 的通过结果。

**2026-10-13 实测读数**：`npm test` 718 passed / 2 skipped / 71 文件（基线 669，零回退）；
五守卫 + `npm run build` + `npm run build:offline` 全绿；`npm run e2e:web` **400 项断言全绿**
（含新增 `wizard` 与 `offline-single-file` 两个 spec）。

## 7. 错误与正确做法

错误：把旧资料清掉后跑通新向导，或在一次自动化跑通后声称普通用户一定会用。
错误：把"旧会话能读"当成"旧会话能用"——读得到与能续跑是两件事（U-1 后前者也不再成立）。
正确：保留旧数据夹具做升级/回退对照，分别记录自动化证据、用户内部验收、外部试用和离线交付状态。

与 [迁移用户流程](./migration-user-journey.md)、[写入安全与证据](./migration-safety-and-evidence.md) 一起评审；
不以任何一页单独通过代替整条迁移旅程完成。
