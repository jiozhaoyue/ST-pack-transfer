# 迁移用户流程与统一计划契约

> 状态：2026-10-01 用户已裁定的目标契约，**尚未实现**。本文定义后续验收要求，不声称当前 UI 已具备这些行为。
> 当前能力证据与拟新增边界分开列示。只有完成相应测试和验收后，才可将条目改为“已实现”。

## 1. 范围与触发

适用于默认迁移向导、高级工作台切换、源包/宿主取数、范围选择、交付列表与结果解释。
目标是普通用户完成跨宿主搬家；插件主路径不要求命令行、后端、跨实例直连或 AI 代操作。

用户已确定：完整自用默认全选；两端引导、手动中转；源备份/目标包/报告分别交付；默认向导保留高级工作台。

现有证据（167796d）：
- src/ui/workbench-template.js:257-314 已有动作、任务控制和报告区；并非从零实现这些能力。
- src/ui/category-filter.js:22-36 是既有选择模型，包含普通类目及 backups/cache/appPrivate。
- src/core/task-manager.js:26-32 定义执行状态；此状态机不因新增向导而再造一份。
- index.js:1493、1989、2230 是后续可分片抽离的编排接缝。

## 2. 入口与拟定签名

现有 getWorkbenchHtml、TaskManager、ExportQueue 及存储模块继续承担模板、执行控制、交付与缓存职责。
后续拟新增纯计划边界（名称为设计契约，不是当前已存在的导出）：


```text
createMigrationPlan(input) -> MigrationPlan
input: { operation, revision, sourceRef, targetRef, targetLayout,
         requestedSelection, excludedPaths, capabilities }
operation: 'export' | 'restore'
```

不增加宿主 API。capabilities 必须由唯一 host-bridge 边界及本地包扫描提供；计划函数不自行探测宿主、访问 DOM 或发网络请求。
本仓继续 JavaScript + JSDoc；上述签名不是采用 TypeScript 或引入框架的决定。

## 3. 数据与交互契约

### 3.1 计划数据

| 字段 | 类型与约束 |
| --- | --- |
| schemaVersion | 固定整数 1；未来不认识的版本只读解释，不直接授权操作 |
| operation | export / restore，决定本次动作所需的能力，不能把“插件不能写”误当“格式不能转换” |
| revision | 当前会话递增整数；关键输入变动必须递增 |
| sourceRef / targetRef | 当前操作中绑定的来源/目标引用；不包含 token、密码；不得以跨会话导入的字符串充当授权 |
| targetLayout | st / l / tt / pt；宿主标识与布局标识经既有归一化边界转换 |
| requestedSelection | 采用现有类目键的布尔映射，表示用户意图 |
| effectiveSelection | 同一份规范化执行选择；预览、执行、报告共同消费，不从 DOM 重新拼装 |
| exclusions | 数组，含 category、reason、status；status 为 unavailable / unsupported / permission-denied / unknown / user-excluded |
| risks | 敏感内容、权限、目标冲突未知、兼容性等可读提示；不包含秘密值 |
| capabilities | 按 category 键组织；每项含 sourceRead / formatConvert / targetWrite / targetVerify 四维（available / unavailable / unknown），以及 permission（granted / denied / unknown）、reason 和证据来源 |

导入文件/报告一律按不可信输入校验；不能从导入的计划恢复执行确认、备份确认或重试资格。
关键输入至少包含：源文件或源快照、目标宿主/当前用户、目标布局、选择/排除项、影响产物的高级选项。
改变它们会使旧预览和确认失效；过期任务回调不得覆盖新 revision 的界面。

### 3.2 默认全选的准确含义

- 新迁移默认选中全部权限允许且可迁移的用户内容，**包含设置、密钥、插件**；不得擅自换成脱敏预设。
- “全选”不是无条件对所有布尔键赋 true：不可获取、无权限、未知和不兼容项必须显式列出。
- 不能因目标插件不支持自动写入就删除一个可由目标原生通道导入的类目；应给手动导入路径。
- 不可将旧同步脚本“不带 backups”的操作特例继承为产品默认政策。历史备份、缓存、宿主私有数据按真实迁移语义判断，并展示有效范围与排除理由。
- 权限 unknown 不等于管理员，空类目不等于缺陷，已有数据库聊天接口缺席不等于“全部聊天已导出”。
- 恢复旧任务应显示“沿用旧任务选择”，不得让旧偏好静默污染一个新迁移。

### 3.3 两端流程

源端：来源 → 目标格式 → 有效范围 → 兼容/敏感检查 → 确认 → 生成交付物。
目标端：选择目标包 → 识别当前宿主与用户 → 核对范围/风险 → 目标备份 → 确认合并 → 执行 → 目标核对。

向导和高级工作台共享计划与执行状态；进入高级不丢失选择，返回向导不得悄悄重置高级参数。
向导不能直观表达的已启用高级项应显示摘要，不得用“简化 UI”为由静默关闭。
设置页仅放入口和设置；复杂宿主界面使用官方支持的 Popup 等入口，差异留在 host-bridge，不自造全站浮层。
不复制独立页面业务模板，不泄漏宿主 CSS，不引 CDN。

### 3.4 交付与结果

交付列表中的 artifact.role 固定为 source-backup / target-package / migration-report：

- source-backup：可获取范围内的原始源备份，注明限制与用途，不能误导用户拿它直接导入另一宿主。
- target-package：目标原生布局，直接供对应导入器使用；不加外层套装，不在未验证前向原生 ZIP 根目录塞新报告文件。
- migration-report：独立报告，面向用户解释范围、缺项、结果和下一步；默认仅含必要分类/逻辑编号/汇总，不含密钥、聊天正文或宿主绝对路径。

报告缺失不妨碍识别合法目标包；目标端重建自己的检查与授权，不信任报告中的“已确认”。
只持有目标包时，核对范围是该包可证明的内容，不能推断原源端全部数据都在其中。
下载状态区分“已生成”“已触发下载”“用户确认保存”，不能仅凭触发浏览器下载宣布文件永久可恢复。

## 4. 校验与错误矩阵

| 条件 | 必须行为 |
| --- | --- |
| 未选源 / 未选目标 | 定位到缺失步骤，不显示无理由禁用按钮 |
| 无权限 / 无法探测 | 区分拒绝与未知；说明原因、受影响内容与可用替代路径 |
| 支持转换但不支持自动写入 | 保留产包能力，提供准确原生导入和人工核对指引 |
| 接受不兼容项继续 | 结果保留缺项；不显示“全部完整迁移” |
| 切换源/目标/用户/范围 | revision 更新，旧确认与旧异步回调作废 |
| 读到陌生报告版本或损坏字段 | 不执行其中指令；保留合法 ZIP 的独立识别路径并解释报告不可用 |
| 无后端、无持久化能力 | 基础转换可继续；明确本次结果保存风险，不伪装成已持久保存 |

## 5. 正常、基本与反例

- 正常：源可读、目标格式可转换；默认选中设置与密钥，检查页提示仅供自用；目标原生可导入，用户完成核对。
- 基本：目标仅支持手动导入；交付目标 ZIP 与指引，用户确认后的核对证据标为人工，不假装自动验证。
- 反例：旧工作区把 globalExtensions 关闭，新迁移仍显示“默认全选”且不提示有效范围变化。

## 6. 必须测试的断言点

拟新增 test/migration-plan.test.js 与 test/migration-journey.test.js；它们当前不存在，不将文件存在当成已通过。

- 向导与高级模式在同一输入下的 effectiveSelection / exclusions 相同。
- 新迁移不继承旧任务污染选择；用户明确恢复旧任务时反而必须保留旧选择并标识。
- 设置、密钥、插件在权限和迁移能力允许时为默认选中，拒绝/未知时有对应理由。
- 对相同源/目标/选择变动，revision 的失效作用覆盖确认、报告和异步结果。
- 三份交付角色不会互换；目标 ZIP 可用既有原生布局检查；报告不含秘密值。
- 双入口均沿用唯一模板/核心；保留 test/single-template-source.test.js 等现有守卫。

## 7. 错误与正确做法

错误：从复选框 DOM 临时收集执行参数，同时结果页读取另一份旧 selection。
正确：计划构造一次，确认绑定 revision；执行与结果消费同一计划快照。


```text
源、目标或选择发生改变后，必须满足：
  nextPlan.revision > previousPlan.revision
  confirmation.planRevision !== nextPlan.revision
  oldCallbackMayUpdateCurrentView === false
```

以上为验收断言，不是已落地实现。写入授权与重试契约见 [迁移安全与证据](./migration-safety-and-evidence.md)。
