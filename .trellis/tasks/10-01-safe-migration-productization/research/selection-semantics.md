# 选择范围语义（S0 取证）

> 取证日期：2026-10-13。回应 codex 会话遗留问题「旧选择过滤规则」与 `R-03`（完整自用默认全选）。
> 证据均为本仓 `file:line`。本片只**描述现状语义**与**必须区分的概念**，不裁定产品默认（默认已由 `D-07` 裁定）。

## 1. 三个必须分开的概念

`R-03` 要求「权限允许且可迁移内容全选」，但「全选」在代码里有**三张不同的表**，混用即产生 `R-05` 所说的「静默缩小范围」：

| 概念 | 载体 | 含义 | 证据 |
| --- | --- | --- | --- |
| **requested（用户请求）** | `currentSelection`（UI 模块级） | 用户在类目面板上的勾选意图 | `src/ui/category-filter.js:22-36` |
| **requested-paths（单项穿透）** | `currentExcludedPaths` | 类目内**逐文件**反选排除 | `src/ui/category-filter.js:38, 437-447` |
| **effective（有效）** | `plan.categories[cat].selectedCount` + 逐条 `item.selected` | 经「类目未勾选 / 单项排除 / 平台 DROP」三重过滤后的**真正进产物**集合 | `src/core/plan-preview.js:306-363` |

**判据纪律**：任何「覆盖率 / 排除项」读数必须落在 **effective** 上；`requested` 只是输入。

## 2. `currentSelection` 的键与默认值（现状）

模块级 `let currentSelection`（`category-filter.js:22-36`），**13 键**：

- **10 个标准类目**：`characters / chats / lorebooks / presets / settings / secrets / assets / extensions / globalExtensions / vectors` —— 默认**全 `true`**。
- **3 个特殊类目**：`backups=true`、`cache=false`、`appPrivate=false`。

另有一个**并行的** `FULL_SELECTION`（`src/ui/host-bridge.js:254-265`）：**只含 10 个标准类目、全 `true`**，
用于「未传 selection 时」的宿主导出缺省体（`fetchHostBackup` 的 `selection ?? FULL_SELECTION`，`host-bridge.js:728`）。

⇒ **两张表不一致**：`currentSelection` 有 13 键且 `backups` 默认 true，`FULL_SELECTION` 只有 10 键。
「默认全选」到底以哪张为准，现状**未定义**，是本片要暴露的第一个缺口。

## 3. 旧选择污染的真实来源（codex 遗留问题 #2 的答案）

`renderCategoryStats()` 每次渲染会**改写** `currentSelection`（`category-filter.js:185-194`）：

```js
const isAvailable = (data.count || 0) > 0;
if (isAvailable) {
  availableCategories.add(key);
  if (typeof currentSelection[key] === 'undefined') {
    currentSelection[key] = (key !== SPECIAL_CATEGORIES.CACHE); // 新键默认 true（cache 除外）
  }
} else {
  currentSelection[key] = false;   // ← 不可用类目被强制置 false，且是「写回」不是「临时视图」
}
```

**两个污染机制**：

1. **`count===0 ⇒ 写回 false`**：渲染一个**不含某类目**的包，会把该键永久置 `false`；换一个**含该类目**的包时，
   它仍是 `false`（因为第 189 行的「新键默认」只在 `undefined` 时触发）。⇒ **换包后旧勾选残留**。
2. **模块级状态不清零**：`currentSelection` / `currentExcludedPaths` 是模块级 `let`，
   `resetCategoryFilter()`（`category-filter.js:452-464`）**不清这两个**（只清 `availableCategories` / `expandedCategories` / `currentPlan`）。

⇒ `R-03` 的「不能继承旧会话污染值」**正是针对此**。修复方向（归 S1 判定契约）：计划生成必须**显式快照** requested，
不读「被渲染改写过」的 `currentSelection`。

## 4. 特殊类目的迁移语义（现状）

三个特殊类目**不走 `selection` 布尔**，而走 `generatePlan` / `convert` 的**独立 include 标志**：

| 特殊类目 | 触发标志 | 现状默认 | 证据 |
| --- | --- | --- | --- |
| `cache`（派生缓存） | `includeCache` | 丢弃 | `src/core/plan-preview.js:265-273` |
| `backups`（历史备份/聊天备份） | `includeBackups` | 丢弃 | `src/core/plan-preview.js:274-282` |
| `appPrivate`（应用私有） | `includeAppPrivate`（TT 目标恒含） | 丢弃（TT 除外） | `src/core/plan-preview.js:283-291` |

⚠️ **双轨风险**：`currentSelection.backups` 默认为 `true`，但真正决定备份是否进产物的是 `includeBackups`（默认 `false`）。
两者**不同步** ⇒ 用户在面板看到「backups 已勾选」但产物里没有备份条目，**是现状的真实陷阱**。

`D-07`（完整自用默认全选）落地时必须**统一**这两条轨，不能只改一边。

## 5. `applyPreset('safe')` 与产品默认的关系

`applyPreset`（`category-filter.js:388-415`）的 `safe` 预设会**取消 `secrets` 与 `chats`**。
这是**用户主动点的快捷筛选**，不是默认值 —— 不得把它当默认（`R-03` / `D-07` 明确「不以脱敏子集取代默认值」）。

## 6. 本片未做的事

- 未裁定「默认全选」以 `currentSelection` 还是 `FULL_SELECTION` 为准（这是 S1 判定契约的输入，需在 S1 PRD 固化）。
- 未改任何代码；`currentSelection` 的污染机制仅**描述**，修复归 S1/S5。
