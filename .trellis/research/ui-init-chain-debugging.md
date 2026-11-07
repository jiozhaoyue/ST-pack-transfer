# UI 初始化链路中断的形态、定位法与高发位（2026-11-08 实证）

## 现象形态（已实证）

`index.js` 的 `main()` 是**串行初始化链**：`createWorkbenchView` → conversion-runner/exportQueue
初始化 → 日志订阅 → `setHost` → 文件/拖拽监听 → LAN → `syncPackages` → 配额 → 教程。
链上任何一处同步抛错（如 `ReferenceError`），其后**全部**接线静默死亡：
宿主徽标、动作行按钮（生成/拉取/合并）、页签计数、配额、日志全灭——用户看到的是
「整页异常、该有的按钮没有」，而**不是**指向真实出错行的任何提示。

- 2026-11-08 实证：`index.js:992` actions 对象简写属性 `pendingDownload,` / `pendingStash,`
  指向不存在的标识符（实际函数名 `downloadPending` / `stashPending`）→
  `ReferenceError: pendingDownload is not defined` → 整页半残（修复提交 `532e5e2`）。
- 单测拦不住：`npm test` 961 passed 全绿，因为 `index.js` 的 DOM 接线层没有单测覆盖。

## 快速判据（不用逐个控件排查）

刷新后看两个信号即可判定「初始化链中断」vs「局部 bug」：
1. `#count-import` / `#count-export` 是否还停留在模板占位值 `4` / `1`
   （真实 `syncPackages` 跑过必然是实际条数，空库为 0）；
2. `#btn-fetch` / `#btn-generate` 是否**从 DOM 里不存在**（renderActions 没跑）。

两者同时成立 ⇒ 初始化链在 `createWorkbenchView`（index.js `main()` 前段）之后、
`syncPackages` 之前断了。

## 真机捕获法（复现成本最低）

IAB/浏览器里初始报错发生在装监听之前，抓不到。利用 ESM cache-bust 重跑 bootstrap：

```js
window.addEventListener('unhandledrejection', (e) => window.__errs.push(e.reason?.stack || String(e.reason)));
await (new Function('return import("/index.js?bust=1")'))();  // 绕过 evaluate 包装器对动态 import 的改写
```

`bootstrap()` 的 `initialized` 守卫是模块级的，fresh import 会得到新模块实例并重跑
`bootstrap → main`，异常直接落在监听里，拿到精确堆栈（本次一击命中 index.js:992）。

## 高发位与预防（推断 + 实证）

- actions 对象的**简写属性**是此类错误高发位：新增接线引用既有函数时，先确认函数名；
  控制器内函数命名与动作键名不一致时（`downloadPending` vs `pendingDownload`）必须写显式键值。
- 排查干扰项（勿再被骗）：
  - fullPage 截图出现「工作台多份平铺」是 IAB 截图对 fixed 元素的伪影
    （DOM 实际只有 1 份 `.app-container`、`elementFromPoint` 命中干净）；
  - Playwright 点击超时可能是可操作性等待的偶发怪癖，用 `elementFromPoint` 命中测试证伪。
- 边界（未确认，仅记录）：`createWorkbenchView` 最小入参构造不抛错已实测；
  renderActions 等渲染函数对缺失容器是否全部有守卫未逐一验证。
