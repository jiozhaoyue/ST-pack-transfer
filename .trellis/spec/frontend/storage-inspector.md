# 存储审查面板（浏览器 / 宿主同一套 UI）

> 2026-11-11 定稿。自包含，不引用任务目录。适用：`src/ui/workbench-view.js`、
> `src/ui/workbench-template.js`、`src/ui/storage-inspector-browser.js`、
> `src/core/storage-inspector-model.js`、`src/ui/host-bridge.js`、`style.css`、`index.js`。

## 1. 契约

1. **一个面板**：`#storage-inspector-view`（模板唯一源），浏览器配额行与宿主配额行都打开它。
2. **初始来源 = 点击的行**：点「浏览器配额」进面板显示浏览器数据；点「宿主配额」显示宿主数据。
3. **面板内可直接切换**数据源：面板头 `#si-source-tabs` 两个页签（浏览器 / 宿主）。独立 Web 态没有宿主，页签隐藏。
4. **占满内容区**：打开时隐藏 `.col-side` 与 `.splitter-v`，`#app.app-container[data-si="1"] .app-main` 改为单列；
   面板填满 `.app-main` 的内边距内容盒。**不是**视口全屏，也**不是**内联展开。
5. **只读**：不删除任何键 / 库 / 缓存；不写 `localStorage` / `sessionStorage` / IndexedDB / Cache Storage。
6. **关闭回到进入前视图**：`#si-close` 或 Esc；分区、勾选、图表状态不改。
7. **读不到不伪造**：浏览器无法测大小的条目显示 `?`；配额 0 视为「未知总量」；宿主无能力显示「未提供」。

## 2. 数据契约（provider）

`provider.fetch(pathArray) => Promise<InspectorResponse>`

```js
{
  path: string[],
  breadcrumbs: Array<{ labelKey?: string, label?: string, path: string[] }>,
  quota: null | { usedBytes: number|null, quotaBytes: number|null, over: boolean },
  entries: Array<{
    key, labelKey?, label?, icon?, kind?, categoryKey?,
    sizeBytes: number|null, childCount?: number|null, countUnit?: string, canDrill: boolean,
  }>,
  isLeaf: boolean,
  unavailable?: true,   // 宿主无存储审查能力
}
```

- 面包屑优先 `labelKey`（走 i18n），否则用宿主/浏览器给的原文 `label`。
- `siRequest()` 用递增序号丢弃过期响应；任何 provider 抛错 → 面板显示 `code: message` 与「重试」。

## 3. 浏览器 provider（`src/ui/storage-inspector-browser.js`）

L0 五类，顺序固定：`localStorage` / `sessionStorage` / `indexeddb` / `cachestorage` / `quota`。

| 路径 | 来源 | 单条大小 |
| --- | --- | --- |
| `localStorage` / `sessionStorage` | 逐键读值 | `(key.length + value.length) * 2` |
| `indexeddb` | `indexedDB.databases()` → 逐库 `objectStoreNames` | L0 用 `estimate().usageDetails.indexedDB`；条目 `?` |
| `cachestorage` | `caches.keys()` → 逐缓存 `cache().keys()` | L0 用 `usageDetails.caches`；条目 `?` |
| `quota` | `navigator.storage.estimate()` | 已用量，只有一档 |

空类目（`childCount === 0`）不可下钻（照 Luker）。所有浏览器 API 经参数注入，可在 Node 用假对象单测；
`withTimeout` 兜底 IndexedDB / Cache 的阻塞调用，API 缺失一律降级为「无数据」。

## 4. 宿主 provider（`src/ui/host-bridge.js`）

- `hostStorageInspectCapability(platform)`：显式声明表，只有 `luker: true`；ST/TT/PT/独立态 `false`。
- `fetchHostStorageInspect(path)`：优先宿主 `RestProvider({kind:'self'})`；失败回落到
  `POST /api/users/storage/inspect`（同源 + CSRF，15s 超时）；两侧都失败则抛出 `code/status`。
- 非 Luker 由 `index.js` 直接返回 `{ unavailable: true }`，界面显示「当前宿主未提供存储审查」。

## 5. 渲染规则（照 Luker storage-inspector）

- 头部：面包屑 + 刷新；配额行 `已用 / 总量`（超限警示色）；堆叠条宽度 = 条目占**本层已测总量**比例；
  图例 = 色块 + 名称 + 大小；列表唯一滚动区。
- 每行：图标 + 名称（含 `childCount`）+ 8 点点阵（按本层最大条目比例）+ 大小 + 可下钻时的 chevron。
- 点行 / 点堆叠条分段 → 下一层；点面包屑任一级 → 返回。
- 颜色复用图表 12 色 `.vc-c1..c12`（`categoryColorClass`），不新增颜色字面量。
- 竖屏（`data-view="mobile"`）：隐藏点阵，`#si-list` 不单独滚动，唯一滚动容器仍是 `.app-main`。

## 6. 守卫与登记

- `REQUIRED_TEMPLATE_IDS`：`storage-inspector-view`、`si-source-tabs`、`si-refresh`、`si-close`、
  `si-breadcrumbs`、`si-list`、`si-retry`、`si-empty`、`si-error`。
- `CONTROL_CONSUMERS`：`si-refresh` / `si-retry` / `si-close` 各写消费点；数据源页签走 `group:.seg-btn`。
- 文案全部走 `si.*`；`title` 只用 `si.open`（≤8 字）。

## 7. 验收（可执行）

`node scripts/ui-verify-storage-inspector.cjs`（本地专属，前置 `npm run build` + 4173 预览）：

1. 1280：面板尺寸 ≈ `.app-main` 内容盒；`data-si=1`；数据包列与分隔条隐藏。
2. L0 五类齐全；配额行、堆叠条、图例、列表同时可见。
3. `sessionStorage` 下钻：面包屑两级、键与页面真实键一一对应；IndexedDB 列出库名且单库大小为 `?`。
4. 面包屑返回根层；刷新与关闭可用；关闭后回到图表且 `data-si` 清空。
5. 只读：全过程两处 Web Storage 逐键一致。
6. 380：`data-view=mobile`、零横向溢出、面板占满宽度、点阵隐藏。
