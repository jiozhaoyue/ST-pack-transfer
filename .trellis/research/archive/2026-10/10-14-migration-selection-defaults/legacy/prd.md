# 默认选择口径统一（OQ-1：13 键为准）

## Goal

落实用户 **2026-10-14** 对 OQ-1 的裁决——**默认「完整迁移」的全选口径以 `currentSelection` 的
13 键表为准**——并消除它暴露的**双轨陷阱**：三张「默认表」各写各的，导致「面板显示已勾选 backups、
产物里却没有备份条目」。

## 背景（现场取证）

`research/selection-semantics.md` §2/§4 已取证，本片复核后确认现状：

| 表 | 载体 | 键数 | 现状默认 | 证据 |
| --- | --- | --- | --- | --- |
| UI 勾选意图 | `category-filter.js` 模块级 `currentSelection` | **13** | 10 标准 `true`、`backups=true`、`cache=false`、`appPrivate=false` | `src/ui/category-filter.js:22-36` |
| 端点缺省体 | `host-bridge.js` 的 `FULL_SELECTION` | **10** | 全 `true`（无特殊类目） | `src/ui/host-bridge.js:258-269` |
| 真正决定产物的标志 | 三个 `include*` 参数 | 3 | 模板三个复选框**均无 `checked`** ⇒ 全 `false` | `src/ui/workbench-template.js:177,181,185`；`src/core/plan-preview.js:118` |

⇒ **三处默认值各自硬编码、互不引用**。`backups` 在面板上是 `true`、在产物里是 `false`——
**用户看到「已勾选」但拿不到数据**（`selection-semantics.md` §4 已标为「现状的真实陷阱」）。
用户裁定「13 键为准」后，这个矛盾必须消掉，否则裁决落不到实处。

## Requirements

- **R1 单一默认源**：新增纯模块 `src/core/selection-defaults.js`，导出
  `DEFAULT_SELECTION`（13 键，值即上表「现状默认」）、`STANDARD_SELECTION_KEYS`（10 键）、
  `SPECIAL_SELECTION_KEYS`（3 键）与 `SPECIAL_SELECTION_FLAGS`（特殊键 → 其 `include*` 载体名）。
  **不新增第二份硬编码表**。
- **R2 三处派生**（消除双轨）：
  ① `category-filter.js` 的 `currentSelection` 初值 ← `DEFAULT_SELECTION`；
  ② `host-bridge.js` 的 `FULL_SELECTION` ← `STANDARD_SELECTION_KEYS`（导出名与形状不变，
     以免破坏 4 处既有调用）；
  ③ 模板三个特殊类目复选框的 `checked` ← `DEFAULT_SELECTION` 对应值（**backups 默认勾上**，
     cache / appPrivate 仍不勾——表里就是 `false`）。
- **R3 口径可见**：检查页在既有「逐条排除项」之上，补**按类目汇总**的一行
  （「本次不含：派生缓存（原因）· 应用私有配置（原因）」），让「不可默认漏掉数据」
  在**知情**层面成立——不静默丢，也不假装包含。
- **R4 不改判定语义**：`plan-preview.js` / `transform.js` 的 `include*` 参数默认值**不动**
  （仍是 `false`）——它们是**库级默认**，由调用方（`index.js` 读复选框）显式传值。
  本片只统一**界面默认**，避免把「库默认」与「产品默认」混为一谈。
- **R5 零新增依赖**；不碰 `10-01` 的 S1 判定契约。

## Constraints

- `src/core/` 禁 DOM（`L1-MR-6`）；`selection-defaults.js` 纯常量模块。
- **单一模板源**：模板改动只许写 `src/ui/workbench-template.js`（`check:template-source`）。
- **不擅自缩小默认范围**（`R-03`）：本片**只把 defaults 对齐到用户裁决的表**，
  不改表里任何一项的值。

## Acceptance Criteria

- [x] **AC-1 单一源可判**：`grep` 全仓，`DEFAULT_SELECTION` 的 13 个键值**只出现一次**；
  `currentSelection` 初值、`FULL_SELECTION`、模板三复选框的默认**全部**由它派生
  （有测试钉住「改一处默认 ⇒ 三处同步变」）。
  —— *`src/core/selection-defaults.js` 是唯一字面量；`category-filter.js` 的 `currentSelection`
  改为 `{ ...DEFAULT_SELECTION }`，`host-bridge.js` 的 `FULL_SELECTION` 改为 `buildEndpointSelection()`，
  模板三复选框改为 `${checkedAttr('backups'|'cache'|'appPrivate')}`。
  `test/selection-defaults.test.js` 断言 13 键齐全 + 10/3 划分不重不漏 + 表 frozen +
  **flag 名与 `plan-preview.js` 实际入参对账**（防漂移）。*
- [x] **AC-2 双轨消除**：`currentSelection.backups === true` ⇒ 模板 `#include-backups-check`
  默认 `checked`；`cache` / `appPrivate` 为 `false` ⇒ 默认不勾。有测试断言三者一致。
  —— *`test/selection-defaults.test.js` 的 `【AC-2】模板三个特殊类目复选框的默认 = DEFAULT_SELECTION 对应值`
  （从 `getWorkbenchHtml()` 产物里正则取三个 `<input>` 断言 `checked` 属性）+
  `【AC-2 双轨消除】backups 默认勾选 ⇒ 面板意图与产物载体不再矛盾`。*
- [x] **AC-3 `FULL_SELECTION` 形状不变**：仍是 10 个标准键、全 `true`、`Object.freeze`；
  既有 4 处调用与相关测试零改动即通过。
  —— *`【AC-3】buildEndpointSelection 形状 = 既有 FULL_SELECTION` 逐键相等断言；
  全量 `npm test` 零回退（既有 4 处调用未改一行）。*
- [x] **AC-4 检查页可见**：检查页出现**按类目**的「本次不含」汇总行；无特殊类目被排除时该行为空。
  —— *新增 `formatSpecialExclusionSummary()`（`migration-wizard.js`，纯函数）+ `describeSpecialExclusions()`
  （`selection-defaults.js`）；`index.js` 的 `syncWizardCheckPanel` 读**当前勾选**（不是默认表）拼进 summary。
  用例 4 条：列出键+载体+理由 / 无排除⇒空串 / 缺 reason 无悬空分隔符 / 忽略畸形条目。*
- [x] **AC-5 零回退**：`npm test` 相对基线（801 passed / 2 skipped）只增不减、0 failed；
  五守卫 + `build` + `build:offline` + 独立形态 E2E 全绿。
  —— *`npm test` 801 → **813 passed / 2 skipped / 0 failed**（净增 12，80 文件）；
  五守卫 + `build` + `build:offline` 全绿；`e2e:web -- --rebuild` **496/496**（exit 0）。*
- [x] **AC-6 裁决留痕**：`10-01/implement.md` 的 S0 第二项勾选并写明**裁决原文与日期**；
  `selection-semantics.md` §6「未做的事」更正为「已裁定」。
  —— *`10-01/implement.md` 的 S0 第二项已勾选并附裁决原文（「13 键为准（默认更全，推荐）」+ 代价原文）；
  `research/selection-semantics.md` §6 标题改为「本片未做的事（**2026-10-14 更正：两项均已落地**）」，
  并把双轨陷阱的消除与新裁决的代价一并登记。*

## 未覆盖边界（如实登记）

- **`renderCategoryStats()` 的写回污染未修**（`selection-semantics.md` §3）：不可用类目被
  `currentSelection[key] = false` 永久置 false，换包后旧勾选残留。这是**旧选择继承**问题，
  归 S1/S5 判定契约，本片刻意不碰。
- **默认产物变大未经实机验证**：`include-backups-check` 默认勾上后，默认导出会含 `backups/`。
  本片只验证「三处默认同源」，**未**在真实实例上测过默认导出的体量与耗时变化。
- 检查页汇总行**未在浏览器里肉眼确认过**（独立形态 E2E 不覆盖向导检查页的文案渲染）。

## 影响面（诚实登记）

- **默认产物会变大**：`include-backups-check` 默认由不勾变为**勾上** ⇒ 默认导出会包含
  `backups/` 历史快照。Luker 上勾「系统设置」本就会隐含打包该目录（既有警示），
  故这是**把隐含行为显式化**，不是新增成本——但**默认导出体量与耗时确实会上升**。
  用户 2026-10-14 在选择该项时已确认接受该代价（选项原文含「代价：Luker 上勾 settings 会隐含
  打包 GB 级 backups/ 历史快照」）。
- `cache` / `appPrivate` **仍默认不含**（表里即 `false`）——本片不擅自把它们改成 `true`，
  但检查页会**明说**它们不在本次范围内。

## Out of Scope

- `renderCategoryStats()` 的「不可用类目写回 `false`」污染（`selection-semantics.md` §3）——
  那是**旧选择继承**问题，归 S1/S5 判定契约，本片不动。
- `plan-preview.js` / `transform.js` 的库级默认值。
