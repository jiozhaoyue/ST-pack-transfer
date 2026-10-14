# 设计：默认选择口径统一

## 1. 单一源 `src/core/selection-defaults.js`

```js
export const STANDARD_SELECTION_KEYS = Object.freeze([
  'characters', 'chats', 'lorebooks', 'presets', 'settings',
  'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors',
]);

export const SPECIAL_SELECTION_KEYS = Object.freeze(['backups', 'cache', 'appPrivate']);

/** 特殊类目键 → 真正决定产物的 include* 参数名（`plan-preview.js` / `transform.js` 的入参）。 */
export const SPECIAL_SELECTION_FLAGS = Object.freeze({
  backups: 'includeBackups',
  cache: 'includeCache',
  appPrivate: 'includeAppPrivate',
});

/** 用户 2026-10-14 裁决（OQ-1）：13 键为准，值即现状默认。 */
export const DEFAULT_SELECTION = Object.freeze({
  characters: true, chats: true, lorebooks: true, presets: true, settings: true,
  secrets: true, assets: true, extensions: true, globalExtensions: true, vectors: true,
  backups: true, cache: false, appPrivate: false,
});

/** 由默认表派生「本次不含」的类目及其载体参数名（检查页用）。 */
export function describeSelectionDefaults(selection = DEFAULT_SELECTION) { … }
```

**为什么放 `src/core/`**：三处消费者分别在 `src/core`（无）、`src/ui/category-filter.js`、
`src/ui/host-bridge.js`、`src/ui/workbench-template.js` —— 表本身是**领域常量**，
放 core 才不会让 `src/ui` 反过来成为别的模块的依赖（`L1-MR-6` 的分层意图）。

## 2. 三处派生

| 消费者 | 现状 | 改法 |
| --- | --- | --- |
| `category-filter.js:22-36` | 手写 13 键字面量 | `let currentSelection = { ...DEFAULT_SELECTION };` |
| `host-bridge.js:258-269` | 手写 10 键字面量 | `Object.freeze(Object.fromEntries(STANDARD_SELECTION_KEYS.map((k) => [k, true])))` |
| `workbench-template.js:177,181,185` | 三个复选框均无 `checked` | `checked` 由 `DEFAULT_SELECTION[k]` 插值 |

**`FULL_SELECTION` 导出名与形状不变**（10 键 / 全 true / frozen）：它被 `index.js:1693`（端点缺省体）、
`index.js:1852`（判断是否需插件内过滤）、`host-bridge.js:741,1029`（导出与合并包的 `formData`）
四处消费，形状一变即连带改动。**端点体不带特殊类目是既成事实**（特殊类目走 `include*` 参数，
不走 `selection` 布尔），本片不改这一点。

**模板插值**：`workbench-template.js` 是 JS 模板字面量，可直接
`` `${DEFAULT_SELECTION.backups ? ' checked' : ''}` ``。注意 `check:template-source` 要求
`index.html` 仍是骨架 —— 本片只改模板函数，骨架不受影响。

## 3. 检查页「按类目汇总」

`syncWizardCheckPanel(plan)` 已把**逐条**排除项交给 `wizard.setCheckPanel`。本片在 summary 行
补一段**按类目**的汇总：从 `plan.categories` 里取 `selectedCount === 0` 且**存在条目**的类目，
配上 `describeSelectionDefaults()` 给出的载体参数名，形如：

> 本次不含：派生缓存（`includeCache=false`，目标平台导入后会自动重建）· 应用私有配置（`includeAppPrivate=false`）

判据只读 `plan`（不读 DOM），故可在 Node 测。

## 4. 错误矩阵

| 条件 | 行为 |
| --- | --- |
| `DEFAULT_SELECTION` 缺某标准键 | 测试断言 13 键齐全（`AC-1`），不会静默少键 |
| 模板插值取到 `undefined` | `DEFAULT_SELECTION` 是 frozen 字面量，键齐；测试断言三处一致 |
| 检查页无任何类目被排除 | 汇总行留空（不打印空标签） |

## 5. 回退点

撤回 = 把三处改回硬编码字面量。**行为面唯一的实际变化是 `include-backups-check` 默认勾选**；
若判定该变化过重，单独把该复选框改回不勾即可，其余（单一源）保留。
