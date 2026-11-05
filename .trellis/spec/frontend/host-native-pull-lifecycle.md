# 宿主原生导出界面的生命周期（打开 · 拉取 · 关闭 · 让路）

> 2026-11-05 新建。来源：用户当轮裁定「点完从宿主拉取后直接关闭原生面板」「宿主原生下载与插件拉取
> 同时发生时插件让路，宿主优先」。**本页自包含**，改这三件事只读本页即可，不必先读源码。
>
> 适用：`index.js`（`fetchFromHost()` / `pullFromNativeUi()` / `pullFromHost()`）、
> `src/ui/host-bridge.js`（`openNativeBackupUi()` / 注入按钮 / 新增关闭与忙态探针）、
> `src/i18n/locales/{zh-CN,en-US}.js`。

---

## 1. 契约

| 时机 | 必须发生 | 禁止 |
| --- | --- | --- |
| 用户点原生界面里注入的「从宿主拉取」 | 先读原生勾选 → **立即关闭原生界面** → 工作台进度条接管 | 让原生界面停留在上面盖住工作台进度 |
| 插件拉取启动前，宿主原生导出已在途 | 插件**不启动**，给出顶部提示 | 两个导出并发抢宿主 IO |
| 插件拉取在途，用户又点宿主原生下载 | 插件**中止自己的 fetch**，提示宿主优先 | 插件继续跑完、与宿主导出争带宽 |
| 无法判定宿主忙态 | **放行**（fail-open） | 因探针失败阻断用户 |

**为什么宿主优先**：宿主原生导出由宿主自己驱动浏览器下载，插件**无法取消它**；插件能取消的
只有自己那次 `/api/users/backup`。两个全量导出并发会把宿主 CPU/磁盘打满，用户体感是
「两个都卡住」，且插件侧更容易被误判为「插件很慢」。

---

## 2. 原生界面落点与关闭方式（四宿主）

| 宿主 | 原生界面 | 关闭动作 |
| --- | --- | --- |
| ST | 账户弹层里的 `.userBackupButton` | 关闭该弹层（最近的 `dialog[open]` / `.popup[open]`），隐藏 `.popup_background` |
| Luker | 账户弹层 →「Backup & Restore」弹层（`.userBackupManager`） | 同上，关闭承载弹层 |
| TT | 扩展列表 → Data Migration 内联抽屉（`#data_migration_settings`） | 收起该内联抽屉；再按需收起扩展列表 |
| PT | `dialog#pure-tavern-data-management-dialog` | 直接 `dialog.close()` |

实现落点：`src/ui/host-bridge.js` 新增并导出 `closeNativeBackupUi(platform)`。
**不得复用** `closeHostExtensionSurface()` 作为唯一实现——后者会关掉所有打开弹层与扩展抽屉，
用于「打开全屏工作台」是合理的，用于「拉取后关闭」过宽；`closeNativeBackupUi()` 只关**承载
本项目按钮的那一层**，找不到时不抛错。

> 关闭必须发生在 `readNativeBackupSelection()` / `readPtExportOptions()` **之后**——先读值再关，
> 否则弹层被移除后读不到勾选。

---

## 3. 忙态探针与并发让路

### 3.1 探针

`src/ui/host-bridge.js` 新增并导出：

```js
export function isNativeExportBusy(platform) -> boolean
```

判据按**显式声明表**取选择器，禁止用平台名推导：

```js
const NATIVE_EXPORT_TRIGGERS = Object.freeze({
  st: ['.userBackupButton'],
  luker: ['.userBackupButton', '.userBackupManager .backupActionRow'],
  tt: ['#data_migration_export_button'],
  pt: ['#ptdm-export'],
});
```

任一命中元素满足以下**任一**即视为忙：

- `el.disabled === true`
- `el.getAttribute('aria-busy') === 'true'`
- `el.dataset.busy === 'true'`
- `el.className` 命中 `/\b(?:busy|loading|generating|disabled)\b/`

元素不存在或宿主结构变化 → 返回 `false`（fail-open，见 §1）。
**不要**读宿主内部变量或源码推导状态（L1-MR-5）。

### 3.2 启动前检查

`index.js`：

- `fetchFromHost()`（工作台入口）与 `pullFromNativeUi()`（原生界面注入按钮）在真正发起
  `pullFromHost()` / `pullFromPt()` 之前都要调 `isNativeExportBusy(host.platform)`。
- 忙 ⇒ `view.toast(t('toast.hostExportBusy'))`（或宿主 `hostToast`，原生界面触发时优先宿主）
  并 `return`，**不得**进入 busy 状态。

### 3.3 在途让路

`pullFromHost()` / `pullFromPt()` 各持一个模块级 `AbortController`：

- 新增 `let activePullAbort = null`；进入拉取时 `activePullAbort = new AbortController()`，
  `finally` 中置 `null`。
- `src/ui/host-bridge.js` 的 `fetchHostBackup()` / `fetchPtBackup()` 增加可选
  `opts.signal`，用 `fetchWithTimeout` 的外部 signal 合流能力透传（见
  `component-guidelines.md` §「有界等待 / signal 合流」）。
- `index.js` 启动时调用 `watchNativeExportStart(() => { activePullAbort?.abort(); })`；
  `watchNativeExportStart` 是 `host-bridge.js` 新增的捕捉式点击监听：对
  `NATIVE_EXPORT_TRIGGERS` 的选择器做 `document.addEventListener('click', handler, true)`，
  命中即回调一次。监听只注册一次，幂等。
- abort 后走既有 `AbortError` 分支：日志记为「宿主优先，插件拉取已取消」，
  进度归零并提示，**不**记为失败。

### 3.4 提示文案

| key | 中文 | 英文 |
| --- | --- | --- |
| `toast.hostExportBusy` | 宿主原生导出进行中，插件拉取已取消 | Host export in progress; plugin pull cancelled |
| `toast.nativePanelClosed` | 已开始拉取 | Pull started |

文案受 `workbench-single-view.md` §4 约束：无括号、无分号长句。

---

## 4. 改点清单（按文件）

| 文件 | 改动 |
| --- | --- |
| `src/ui/host-bridge.js` | 新增 `closeNativeBackupUi()`、`isNativeExportBusy()`、`watchNativeExportStart()`；`fetchHostBackup()` / `fetchPtBackup()` 接受 `opts.signal` |
| `index.js` | `pullFromNativeUi()` 读勾选 → `closeNativeBackupUi()` → 忙态检查 → 拉取；`fetchFromHost()` 忙态检查；`activePullAbort` 与 `watchNativeExportStart` 接线 |
| `src/i18n/locales/zh-CN.js` / `en-US.js` | 新增 §3.4 两个 key |
| `test/host-native-pull.test.js` | 新增：关闭顺序、忙态四判据、fail-open、abort 让路 |

---

## 5. 验收判据

1. 原生界面点「从宿主拉取」后，**该界面消失**；工作台可见进度条推进。
2. 宿主原生导出按钮处于忙态时点插件拉取：**不发起请求**（网络面板零 `/api/users/backup`），
   出现提示。
3. 插件拉取在途时点宿主原生下载：插件请求被 abort（网络面板显示 cancelled），
   进度归零并提示宿主优先。
4. 探针选择器全部失配时：插件照常拉取（不得因探测失败而阻断）。
5. `npm test` 全绿；新增用例覆盖 1–4 的纯函数/桩 DOM 分支。

---

## 6. 已知边界

- 忙态探针依赖宿主 DOM 形状（`disabled` / `aria-busy` / class）。四宿主若改用非标准忙态，
  探针会 fail-open——这是**有意**的：宁可偶尔并发，也不让用户点不动。
- 原生下载一旦被浏览器接管就无法由插件取消；本节所有「取消」均指**取消插件自己的请求**。
- PT dev 当前不加载 `scripts/extensions/**`（见 `host-capabilities.md`），PT 分支只有单测覆盖。
