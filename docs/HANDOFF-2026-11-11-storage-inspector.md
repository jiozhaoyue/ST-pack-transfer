# HANDOFF-2026-11-11 · 统一存储审查面板（占满插件 DOM）

> 状态：**已实现（2026-11-11，提交 `d8fb38f`）**。本文保留为实施契约与取证记录；
> 后续改动以本文判据为准，规范页见 [`.trellis/spec/frontend/storage-inspector.md`](../.trellis/spec/frontend/storage-inspector.md)。
>
> 用户 2026-11-11 明确裁定：不是内联展开、也不是浏览器视口全屏，而是**占满插件容器 `#app.app-container`**；
> UI 与逻辑**照抄 Luker 原生 Storage Inspector**。宿主行读宿主，浏览器行读浏览器，两边**同一套 UI 与交互**。
> 旧实现（配额行内联展开）已按 §五 替换。

---

## 一、一句话目标

把「浏览器配额」和「宿主配额」两行统一成同一个入口：点击后在 `#app.app-container` 内打开**整面板**
存储审查视图，布局/下钻/刷新/错误态全部对齐 Luker `storage-inspector`，只切换数据源 provider。

---

## 二、现状（代码事实，实施前，2026-11-11）

> 以下为**改造前**的过渡实现，已全部替换；保留用于对照，不得作为当前实现依据。

| 项 | 宿主配额 | 浏览器配额 |
| --- | --- | --- |
| 读数 | `readHostStorageQuota()`（`src/ui/host-bridge.js:815`）：Luker `RestProvider` 读 `POST /api/users/storage/inspect`，`path: []`，取 `quota.{usedBytes,quotaBytes}`；失败走同端点直连兜底 | `readBrowserQuota()`（`index.js`）：`navigator.storage.estimate()` |
| 界面 | `#quota-head` 一行：标签 + 进度条 + `已用 / 总量 · pct%` | 同一行，另加**内联** `#quota-details` 明细（本轮加的，作废） |
| 点击 | `openHostStoragePage('server')`：打开宿主账户窗口 Storage 页并点 `[data-act="storage-kind"][data-kind="server"]`，明细由 Luker 原生 inspector 提供 | 当前是切换 `#quota-details` 显隐（错误方向） |
| 跨平台 | 只有 Luker 有该端点；ST/TT/PT 无宿主存储审查 | 所有平台都可读浏览器 |

**现状截图**（本地取证，路径不纳版本控制）：
`test-results/shots/01-normal-1280.png`（正常界面）、
`02-quota-collapsed-1280.png`（配额收起）、
`03-quota-expanded-1280.png`（当前内联展开，桌面）、
`04-quota-expanded-380.png`（当前内联展开，380）、
`05-tutorial-demo-1280.png`（教程演示模式）。

---

## 三、目标 UI（照抄 Luker）

参考实现（只读参考，不复制其宿主耦合代码）：

- `Instance/Dev/Luker/public/scripts/templates/storageInspector.html`
- `Instance/Dev/Luker/public/css/storage-inspector.css`
- `Instance/Dev/Luker/public/scripts/storage-inspector.js`
- `Instance/Dev/Luker/public/scripts/browser-storage-inspector.js`
- 用户文档：`Instance/Dev/Luker/docs/zh-CN/features/storage-inspector.md`

面板结构（自上而下，全部在 `#app.app-container` 内）：

1. **头部**：面包屑 `nav` + 右侧刷新按钮。
2. **配额行**：`已用 / 总量`；超限用警示色。
3. **堆叠使用条**：按类目着色分段，宽度 = 占已用量比例。
4. **图例**：每个类目一个色块 + 名称。
5. **列表**（唯一滚动区）：每行 = 图标 + 名称 + 点阵条 + 大小 + （可下钻时）chevron；
   敏感项（如 `secrets.json`）只显示大小，不显示内容。
6. **状态**：loading（骨架）/ empty（该类别无数据）/ error（原因 + 重试）。

交互：

- 点可下钻行 → `fetch(path + [key])`，面包屑追加；点面包屑任一级返回；刷新按钮重取当前路径。
- 只读：第一版**不提供删除**（见 §八 待裁定）。
- 手机与桌面同一套结构；列表在手机端仍为单列、每行不换行，名称省略、大小始终可见。
- 关闭面板回到进入前的视图（图表/数据包/扩展管理），不改动任何选择状态。

**容器与层级（关键，别再理解错）**：

- 面板不是 `position:fixed; inset:0` 的浏览器视口全屏，也不是内联块；
- 它占满 **`#app.app-container`** 的内容区，做法与现有 `#transfer-view` / `#extension-view`
  整面板替换一致（见 `src/ui/workbench-view.js` 的 `syncMainView()`）；
- 在插件模态里等于占满插件模态；在独立 Web 里等于占满页面里的 `#app` 容器。

---

## 四、统一数据契约（provider）

**同一套 UI 只认一个接口**（照 Luker 的 `StorageInspector + provider` 结构）：

```js
provider.fetch(pathArray) => Promise<{
  path: string[],                 // 当前路径
  parent: null | string[],        // 上一级
  label: string,                  // 当前层标题
  quota: null | { usedBytes: number, quotaBytes: number|null, over: boolean },
  entries: Array<{
    key: string,                  // 下一级路径片段
    label: string,
    icon: string,                 // 图标名（UI 映射）
    sizeBytes: number|null,       // 浏览器无法精确计算时为 null → 显示 `?`
    childCount: number|null,
    canDrill: boolean,
    isSensitive?: boolean,
    note?: string,
  }>,
  isLeaf: boolean,
}>
```

### 4.1 宿主 provider（Luker）

- 端点：`POST /api/users/storage/inspect`，body `{ path: string[] }`，同源 + CSRF 头。
- 响应：`src/storage/inspector.js` 的 `InspectorResponse`；L0 返回 10 类 total + quota，
  后续层返回该层 entries；错误 `400 { error:{code,message} }`（`E_INVALID_PATH` / `E_NOT_INSPECTABLE`）。
- 实现方式：**复用 Luker 页面里已有的模块**（`loadStorageInspectorModule()` 的 `RestProvider`），
  与 `readHostStorageQuota()` 当前做法一致；不要重新实现 L0–L4 的目录遍历。
- ST / TT / PT：没有该端点 ⇒ 面板里宿主源显示「当前宿主未提供存储审查」，**不伪造**、不回退成浏览器数据。

### 4.2 浏览器 provider

照 `browser-storage-inspector.js` 的 L0 五类与下钻：

| 路径 | 数据来源 | 单条大小 |
| --- | --- | --- |
| `localStorage` | 逐键 `key/value` | `(key.length + value.length) * 2` |
| `sessionStorage` | 同上 | 同上 |
| `indexedDB` | `indexedDB.databases()` | `null` → 显示 `?`（浏览器不提供单库大小） |
| `cachestorage` | `caches.keys()` | 单缓存 `?`；若可枚举响应再用 `Content-Length` 估算，估不出就 `?` |
| `quota` | `navigator.storage.estimate()` | 只读总量视图 |

- L0 的类目总量：`navigator.storage.estimate().usageDetails`（Chrome 提供 `indexedDB` / `caches` /
  `serviceWorkerRegistrations` / `fileSystems`）+ 自算 localStorage/sessionStorage；
  浏览器不提供的类目显示 `?`，**不显示假 0**。
- `quotaBytes` 为 0/null 时显示「无限/未知」，与 Luker 文档口径一致。
- 全部只读；不删除任何键/库/缓存（第一版）。

---

## 五、改点清单（文件级）

### 5.1 删除/替换当前内联实现

- `src/ui/workbench-view.js`
  - 删除 `renderQuotaDetails()` 与 `state.browserDetailsOpen` / `state.browserDetails`。
  - `renderQuota()` 中删除 `#quota-details` 内联块与 `qd-caret`；两行统一为「打开面板」入口。
  - 配额行点击：`kind='browser'` 与 `kind='server'` 都调用 `actions.openStorageInspector(kind)`。
- `index.js`
  - `readBrowserUsageDetails()` 改造成浏览器 provider（返回 §四 契约，而不是扁平的 `items/app/opfs`）。
  - 保留 `readBrowserQuota()` 作为 L0 入口的轻量读数。
- i18n：`quota.browserDetails` / `quota.loading` / `quota.noBreakdown` / `quota.item.*` 可复用或迁移到
  `storageInspector.*` 命名；新增面包屑、刷新、空态、错误、重试、无限配额等文案（zh/en 同步）。

### 5.2 新增面板

- 模板（唯一源）：`src/ui/workbench-template.js` 新增
  `<section class="panel storage-inspector-view" id="storage-inspector-view" hidden>`，内部节点：
  `#si-breadcrumbs` / `#si-refresh` / `#si-quota-used` / `#si-quota-total` / `#si-bar` / `#si-legend` /
  `#si-list` / `#si-loading` / `#si-empty` / `#si-error` / `#si-retry` / `#si-close`。
- 视图逻辑：`src/ui/workbench-view.js` 新增 `renderStorageInspector()`（结构照 Luker 模板），
  以及 `state.storageInspector = { open, source:'browser'|'host', path:[], data, loading, error }`。
- 面板显隐并入 `syncMainView()`：打开时隐藏 chart/zone/extension/transfer，只显示本面板。
- 数据层：`src/core/storage-inspector-model.js`（纯逻辑：路径拼接/面包屑/类目配色/大小格式化/
  entries 归一），可单测；`src/ui/storage-inspector-browser.js`（浏览器 provider）；
  宿主 provider 放 `host-bridge.js`（宿主差异唯一落点）。
- 入口：`index.js` actions 新增 `openStorageInspector(source)`；两行配额共用。
- CSS：`style.css` 全部挂 `#app.app-container .storage-inspector-view ...`，配色用 `var(--SmartTheme*)`；
  堆叠条/图例/列表/骨架/错误态照 Luker 视觉，不引入裸选择器。
- 守卫：新控件同步 `REQUIRED_TEMPLATE_IDS` 与 `CONTROL_CONSUMERS`；i18n 文案全走 locale。

---

## 六、验收判据（可执行）

1. 桌面 1280 / 手机 380：点「浏览器配额」与「宿主配额」**都打开同一个面板**，
   且面板 `getBoundingClientRect()` 与 `#app.app-container` 完全一致（不是视口）。
2. 面板内：面包屑、配额行、堆叠条、图例、列表同时可见；列表是唯一滚动区。
3. 浏览器源：L0 五类（localStorage / sessionStorage / IndexedDB / Cache Storage / 配额）；
   进入 localStorage 能看到键；IndexedDB 能看到库名；无法测大小的项显示 `?`。
4. 宿主源（Luker）：L0 十个类目与配额来自 `/api/users/storage/inspect`；
   点「聊天」能下钻；面包屑返回正常；刷新按钮重新取当前路径。
5. 宿主源（ST/TT/PT）：显示「当前宿主未提供存储审查」，不展示任何伪造数字。
6. 错误态：断网/端点 400 时显示原因与「重试」，重试可恢复。
7. 只读：全流程不修改 `localStorage` / `sessionStorage` / IndexedDB / Cache Storage
   （前后逐键比对一致）。
8. 教程演示模式：面板打开的是演示数据或提示「演示模式不提供真实读数」，退出后真实数据不变。
9. 关闭面板回到进入前视图，选择集合、分区 tab、图表状态不变。
10. 六守卫 + 目标测试全绿；`npm run build` exit 0；4173 预览多宽度无横向溢出。

---

## 七、参考实现索引

| 用途 | 路径 |
| --- | --- |
| 面板 DOM 结构 | `Instance/Dev/Luker/public/scripts/templates/storageInspector.html` |
| 面板样式 | `Instance/Dev/Luker/public/css/storage-inspector.css` |
| 面板控制器（面包屑/下钻/刷新/错误） | `Instance/Dev/Luker/public/scripts/storage-inspector.js` |
| 浏览器 provider/mutator | `Instance/Dev/Luker/public/scripts/browser-storage-inspector.js` |
| 宿主响应结构 | `Instance/Dev/Luker/src/storage/inspector.js`（`InspectorResponse`） |
| 宿主端点 | `Instance/Dev/Luker/src/endpoints/users-private.js:1850`（`POST /storage/inspect`） |
| 用户文档（口径/FAQ） | `Instance/Dev/Luker/docs/zh-CN/features/storage-inspector.md` |

---

## 八、待用户裁定

1. **是否提供删除**：Luker 浏览器 inspector 支持删键/删库/删缓存。本插件首版建议**只读**，
   避免误删用户浏览器数据；若要删除，必须二次确认并列出目标名。
2. **非 Luker 宿主的宿主页签**：显示「未提供」还是直接隐藏（建议显示未提供，避免用户以为宿主没数据）。
3. **入口命名**：沿用「浏览器配额 / 宿主配额」，还是改成「浏览器存储 / 宿主存储」。

---

## 十、执行记录（2026-11-11 本轮实施）

**用户追加裁定**：两行打开的是**同一个面板**，面板内可直接切换数据源；**点哪一行进入，面板初始显示哪一侧**。

实施口径（在 §八 三项待裁定上取本文推荐值，用户要求「把所有的都完成」）：

| 项 | 本轮取值 |
| --- | --- |
| 删除能力 | **不做**。只读，`canDelete` 一律忽略 |
| 非 Luker 宿主 | 宿主源照常可切，面板显示「当前宿主未提供存储审查」，不伪造数字 |
| 入口命名 | 沿用「浏览器配额 / 宿主配额」两行，两行都打开同一面板 |
| 面板占位 | 占满 `.app-main` 内容区（隐藏数据包列与分隔条），非视口全屏、非内联块 |
| 数据源切换 | 面板头 `segmented` 页签（浏览器 / 宿主）；独立 Web 态隐藏宿主页签 |

改点落位：

- `src/core/storage-inspector-model.js`（新）— 纯逻辑：尺寸格式、配色类、点阵填充、面包屑路径、响应归一。
- `src/ui/storage-inspector-browser.js`（新）— 浏览器 provider（L0 五类 + 下钻，只读）。
- `src/ui/host-bridge.js` — 新增 `fetchHostStorageInspect(path)` / `hostStorageInspectCapability(platform)`。
- `src/ui/workbench-template.js` — 新增 `#storage-inspector-view` 面板骨架。
- `src/ui/workbench-view.js` — 删除内联 `#quota-details`；新增 `renderStorageInspector` / `openStorageInspector` / `closeStorageInspector`。
- `style.css` — 面板样式，全部挂 `#app.app-container`，颜色复用既有 `--vc-c1..c12`。
- `index.js` — `actions.storageInspector(source, path)`；删除 `readBrowserUsageDetails` / `webStorageBytes` / `readOpfsUsage`。
- i18n — 新增 `si.*` 系列（zh/en 同步）。

**执行状态**

- [x] 模型 / 浏览器 provider / 宿主适配 / 模板骨架 / 视图渲染 / 样式 / 文案 / 控制器接线
- [x] 六守卫全绿（css-scope / dom-injection / template-source / dom-scope / control-consumer / i18n）
- [x] 目标测试：新增 28 项（模型 14 / 浏览器 provider 10 / 宿主适配 4），三个文件共 33 项通过；
      既有守卫与视图相关 120 项通过（control-consumer / single-template-source / dom-scope /
      i18n / copy-audit / workbench-session / plugin / selection-defaults / tutorial-anchor / git-mode）
- [x] `npm run build` exit 0
- [x] 4173 静态预览取证（Playwright，1280 / 380）：**26/26 通过、页面零错误**
      —— 面板填满内容区、`data-si=1`、数据包列与分隔条让位、L0 五类齐全、堆叠条有底色、
      `sessionStorage` 下钻键一一对应、IndexedDB 库名与 `?` 大小、面包屑返回、刷新、关闭回图表、
      Web Storage 逐键不变、初始来源跟随点击行、手机态零溢出且点阵隐藏。
      截图 `test-results/shots/si-desktop-1280.png` / `si-mobile-380.png`（不纳版本控制）。
- 未取证项：真实 Luker 实例下的宿主源下钻（本机没有运行中的 Dev 实例）；ST/TT/PT 的
  「未提供」态由 `hostStorageInspectCapability` 纯函数保证，已有单测；宿主端点回落路径有 mock 单测。

---

## 九、本轮之前已完成（与本文无关，勿回退）

- U1/U2 页头与徽标；U4/U5 包名行；U6 偏好二次点击确认。
- 目标任务式教程 + 教程演示模式（占满 `#app` 内的占位数据、退出还原、零写盘）；详见
  `docs/PLAN-2026-11-11-ui-fixes-next.md` §六。
- 当前配额内联展开是**过渡实现**，按本文 §五 替换。
