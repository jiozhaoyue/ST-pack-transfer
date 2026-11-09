# Luker 2.9 账户窗口与存储页（自包含契约）

> 2026-11-09 新建。来源：Real Luker 8004 = `2.9.0-rc.1`（`4cb090b73`）源码取证。
> 改「原生备份界面打开 / 注入 / 读取勾选 / 配额跳转」前只读本页即可。

---

## 1. 宿主事实（2.9 与旧版的分界）

| 项目 | 2.9（新版） | ≤2.8（旧版） |
| --- | --- | --- |
| 账户入口 | `#account_button` → `openAccountWindow()` | 账户弹层 + `.userBackupButton` |
| 账户窗口 | `AccountWindow extends DataPages`，自绘窗口（`dw-*` 类） | `templates/userProfile.html` 弹层 |
| 备份页动作区 | `.dw-foot`，主按钮 `[data-act="backup-go"]` | `.userBackupManager .backupActionRow` |
| 类目勾选 | `button.dw-chip[data-act="bcat"][data-id]`，选中态 = `.on` 类 | `input[name="backupCategory"]` |
| 存储页 | `[data-region="storage"]`；分页 `[data-act="storage-kind"][data-kind="server\|browser"]` | 无（旧版只有 Storage Inspector 弹层） |
| Storage Inspector 导出 | `RestProvider` / `mountStorageInspector` / `createStorageInspector`；**无** `openStorageInspector` | 同上（本仓曾依赖 `openStorageInspector`，在 2.9 不存在） |
| 窗口关闭 | `.dw-ibtn.is-close[data-act="close"]` | 本仓旧的 `[data-result]` 完成链路 |

**禁止**：按平台名推导「Luker 一定是什么样」。一律先探测新版模块/锚点，失败再走旧版。

---

## 2. 打开账户窗口

模块：`/scripts/account-window.js`（站点根绝对路径，与插件安装位置无关）。

```js
const mod = await import(/* @vite-ignore */ '/scripts/account-window.js');
typeof mod?.openAccountWindow === 'function';
```

`openAccountWindow({ tab, view, handle, onDone })`：

- `tab`：`profile | sync | backup | restore | migrate | settings | snapshots | storage | users | reset`
- **返回 Promise，窗口关闭时才 resolve** ⇒ 必须 `void` 调用，禁止 `await`（否则整段挂到窗口关闭）。
- 窗口已开时调用会导航到目标页，不会重复创建。

## 3. 打开原生备份页 / 注入按钮

- 打开：`void openAccountWindow({ tab: 'backup' })`，随后等待 `[data-act="backup-go"]`。
- 注入：在 `[data-act="backup-go"]` 的父级 `.dw-foot` 内、主按钮**之前**插入按钮；
  按钮类名必须用 `dw-btn big`（原生按钮样式），不要用 `menu_button`。
- 幂等：按钮带 `data-st-zip-injected="1"`；当前 `.dw-foot` 已含则跳过；
  残留在旧窗口的同名按钮先 `remove()` 再注入当前窗口。

## 4. 读取原生勾选（只读）

优先旧版 `input[name="backupCategory"]`；不存在时读新版：

```js
document.querySelectorAll('button.dw-chip[data-act="bcat"][data-id]')
// selected = el.classList.contains('on')
```

返回 `Record<categoryId, boolean>`，类别 id 与 `BACKUP_CATEGORY_KEYS` 一致
（`settings/secrets/characters/chats/lorebooks/presets/assets/extensions/globalExtensions/vectors`）。
**不写回宿主**：不点任何勾选、不改宿主记忆。

## 5. 存储页跳转（配额行点击）

```js
void openAccountWindow({ tab: 'storage' });
const btn = await waitFor(() => document.querySelector(
  `[data-act="storage-kind"][data-kind="${kind}"]`), 3000);
btn?.click();
```

- `kind = 'server'` → 宿主行；`kind = 'browser'` → 浏览器行。
- 模块不存在 / 导出形状不对 ⇒ 返回 `{ ok:false, reason:'host-missing' }`，
  UI 显示「当前宿主未提供存储页面」，**不**降级到任何伪造页面。
- 读数仍走 `readHostStorageQuota()`（`RestProvider.fetch([])` → `resp.quota.usedBytes/quotaBytes`）。

## 6. 忙态与点击监视

- 点击监视（`NATIVE_EXPORT_TRIGGERS`）新增 `[data-act="backup-go"]`。
- 状态探针（`NATIVE_BUSY_PROBES`）只认 `[data-act="backup-go"].busy`；
  **不得**把 `disabled` 当忙态（2.9 的空闲按钮在未选类目时也是 disabled）。
- 旧版探针 `.userBackupManager .backupDownloadButton.disabled` 保留，按探测顺序取先命中者。

## 7. 验收

1. 打开账户 → Backup：`.dw-foot [data-act="backup-go"]` 前有本项目按钮，类名 `dw-btn`。
2. 关闭窗口再开 3 次：按钮始终 1 个，且在当前窗口。
3. 点配额「浏览器」行 → 账户窗口打开且 `[data-kind="browser"]` 有 `.on`；
   点「宿主」行 → `[data-kind="server"]` 有 `.on`。
4. 非 Luker 宿主：配额行可点但提示「当前宿主未提供存储页面」，不打开任何窗口。
5. 读取勾选：返回值与原生 `.dw-chip.on` 完全一致，原生界面外观零变化。
