# 技术设计：UI 编排实施（A 线）

> 技术设计主体在父任务 `10-24-ui-orchestration-r2/design.md` §1~§5（总架构/分组列表/帮助层/
> 铁律与守卫/宿主能力接缝），本文件只记**本任务的落地补充**，不重复父设计。

## 1. 分组列表的接线点

- `src/ui/stash-list.js`：`renderStashList` 增加 opts `groupBy`（默认 `'origin'`）；
  纯函数 `groupStashFiles(files)` → `[{key:'upload'|'host-export', label, items}]`。
- `src/ui/export-queue.js`：同样加 `groupBy`（默认 `'targetLayout'`）；
  `groupQueueItems(items)` 按 `targetLayout` 分（`st/l/tt/pt` + 其他归「其他」）。
- 折叠态：模块级 `collapsedGroups` Set 起步（现状两模块本就以函数式渲染 + 模块级状态为主，
  与 `category-filter` 同路数）；**不上移到全局 state**——外壳/流程层零改动的约束优先，
  折叠是纯视图态不参与业务。
- 组头三态 checkbox：读组内条目选中态派生（全选/半选/空选），点击只改组内成员的选中。

## 2. 帮助层挂点

- `HELP_TOPICS` 放新文件 `src/ui/help-topics.js`（纯数据，无 DOM）。
- 渲染：`workbench-shell.js` 装配后给每个 `[data-wb-module]` 的 `.wb-sec-head` 注入「?」按钮
  （复用宿主原生类 `menu_button`）；浮层用现有行菜单同款锚定方式（`position:absolute` +
  宿主行 `position:relative`，遵守 R2 浮层必锚行）。
- 断言：vitest 读 `getWorkbenchHtml()` 的 `data-wb-module` 集合 ⊇ `HELP_TOPICS` 键集合。

## 3. detectHost 注册表

```js
const HOST_REGISTRY = [
  { code: 'luker', globalFlag: 'lukerContext',    agentPrefix: 'Luker:' },
  { code: 'tt',    globalFlag: '__TAURITAVERN__', agentInfix: 'TauriTavern' },
  { code: 'pt',    globalFlag: '__PURE_TAVERN__', agentInfix: 'PureTavern' },
  { code: 'st',    globalFlag: 'SillyTavern',     agentPrefix: null }, // ST /version 无 agent
];
```

- 第 1 级按数组顺序探测 `globalThis[flag]`；第 2 级仅插件态且探测到宿主时 `GET /version`
  读 `agent` 复核（异步；`detectHost()` 保持同步返回第 1 级，新增 `verifyHostAgent()`
  异步复核供启动路径调用——`verifyHostPlatform()` 已有类似职责，评估合并而非新开）。
- tt/pt 消费点过堂：`hostSelectionCapability` 表已有 tt/pt 行（false）⇒ 拉取入口按
  `supported/known` 置灰；`hostLayoutCode('tt'|'pt')` 需补映射（tt→tt、pt→pt，直接透传）。

## 4. 拉取前预览

- 入口：`index.js` 现有宿主拉取动作函数前插一步——渲染内联摘要行
  （`将拉取 N 类目 · <能力读数>`）+「开始拉取」确认钮；取消即回到原态。
- 类目数：`DEFAULT_SELECTION` 13 键中值为 true 的计数；能力读数直取
  `hostSelectionCapability(platform).reason`（已是状态读数形态，非解释句）。

## 5. 验证策略

- 单测：分组纯函数（两列表 × 分组/平铺）、组头三态派生、HELP_TOPICS 悬空断言、
  动词表断言、detectHost 注册表（含两级不一致）、拉取预览文案两态。
- E2E：`s1-remedies` 扩展或新 spec：上传+宿主产物两组断言（宿主产物可借
  `origin=host-export` 直接注入 IndexedDB 夹具，不必真起宿主）。
