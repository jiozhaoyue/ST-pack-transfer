# Luker 2.9 适配 + 传输改造 · 交接（2026-11-09）

> 本轮交接文档。计划真源是 [`docs/PLAN-2026-11-09.md`](../../docs/PLAN-2026-11-09.md)；
> 宿主契约是 [`.trellis/spec/frontend/luker-2.9-account-window.md`](../spec/frontend/luker-2.9-account-window.md)；
> 后端能力调研是 [`docs/FUTURE-BACKEND-CAPABILITIES.md`](../../docs/FUTURE-BACKEND-CAPABILITIES.md)。

---

## 1. 本轮已完成（代码 + 单测 + 守卫 + 构建）

| 项 | 结果 | 落点 |
| --- | --- | --- |
| Luker 2.9 账户窗口适配 | 注入锚点改 `.dw-foot`；打开走 `openAccountWindow({tab:'backup'})`；旧版自动回退；勾选兼容 `.dw-chip.on` | `src/ui/host-bridge.js`：`openHostAccountWindow` / `openHostStoragePage` / `readNativeBackupSelection` / `mountLukerBackupManagerButton` |
| 配额两行 + 跳转 | 删除「宿主数据」下拉与明细树；浏览器/宿主两行可点，分别跳宿主存储页 browser / server；无能力宿主如实显示 | `src/ui/workbench-view.js` 的 `renderQuota()`；`index.js` 的 `hostStoragePage` action |
| 教程即时覆盖 | 首帧禁用位置过渡；自动教程从 300ms 改下一帧 | `openTutorial()` / `style.css` `.tutorial-overlay.instant` |
| 日志改造 | 按钮自带条数（去徽标）、毫秒时间戳、条数上限设置、默认加载清空、进度日志 16MB + 1.5s 节流 | `workbench-template.js` 日志区；`renderLog()` / `nowTime()` / `logLimit()`；`host-bridge.js` `canLogProgress()` |
| 设置分组 | 四个可收起 `<details>`：常用 / 导出默认 / 日志 / 诊断 | `src/ui/settings-panel.js` |
| 导出扩展清单 | 宿主 `/api/extensions` → Markdown 表格；不支持时如实提示 | `listHostExtensions()` + 设置「诊断」按钮 |
| 图表最大化 + 下钻 | 单卡最大化、逐层下钻、面包屑返回；勾选仍走同一 scope | `chartCardHtml()` / `volScopedNodes()` / `volBreadcrumbHtml()`；`state.volMaxKey` / `state.volPath` |

**验证读数**：`npm test` **982 passed / 2 skipped**（100 文件）；六条 UI 守卫全绿；`npm run build` 通过（5.23s）。
新增本地单测 `test/account-window-29.test.js` 8 例（能力声明、`host-missing`、两版勾选读取、扩展清单归一与失败）。

---

## 2. 关键事实（2026-11-09 取证，勿再假设）

1. **Real Luker 8004 = 2.9.0-rc.1**（`4cb090b73`）；Dev 8003 离线。
2. 2.9 账户是自绘窗口 `dialog.dw-layer → .dw-win → .dw`；备份页 `.dw-foot` + `[data-act="backup-go"]`；
   存储页 `[data-act="storage-kind"][data-kind="server|browser"]`。旧 `.userBackupButton` / `.userBackupManager` 已不存在。
3. `openAccountWindow({tab,...})` 的 Promise **在窗口关闭时才 resolve** ⇒ 调用处必须 `void`，禁止 `await`。
4. 2.9 的 `storage-inspector.js` **没有** `openStorageInspector` 导出；只有 `RestProvider` / `mountStorageInspector` / `createStorageInspector`。
   配额读数仍可用 `RestProvider`；「打开存储面板」必须改走账户窗口。
5. 2.9 仍是 **10 键 selection**，`settings` 仍绑定 `backups/`（上游未拆分）。
6. 宿主 CORS 代理：ST/Luker 有 `/proxy/:url(*)`，默认关；该中间件把 PUT/POST body 做 `JSON.stringify(req.body)` ⇒
   **不能传二进制/ZIP**，只能承担小请求。TT/PT 无代理。
7. 真·零本机流量只有服务端执行体能做；用户 2026-11-09 明令**本插件禁止做后端插件**（登记见 FUTURE 文档）。
8. 宿主服务端插件（仅 Luker）：`plugins/` + `enableServerPlugins: true`，路由 `/api/plugins/{id}/`，继承鉴权，无沙箱。

---

## 3. 已验证 / 未验证

- ✅ 已验证：单测、六守卫、构建。
- ❌ 未验证：**浏览器实机**。内置 Browser 的 `preview_start` 在分类器层持续返回
  `claude-sonnet-5[1m] is temporarily unavailable`，未能启动 dev server；因此配额点击、教程耗时、
  图表最大化、日志按钮计数均未做真机读数。
- ❌ 未验证：Luker 2.9 真机注入（Real 8004 可访问但浏览器未启动；Dev 8003 离线）。

**下一会话第一步（最小复测）**：

```bash
npm run dev
```

打开 `http://127.0.0.1:3040`，按序取证：
1. 点 `#btn-guide`：蒙层是否**立即**覆盖（首帧无从左上方飞入）。
2. 配额两行：点击是否只弹「当前宿主未提供存储页面」（独立 Web 预期），桌面无空胶囊。
3. 日志视图：四个等级按钮文本是否带 `(N)`；行首时间戳是否为 `YYYY-MM-DD HH:MM:SS.mmm`。
4. 设置：四个分组能否收起；「诊断」→「导出扩展清单」在独立态是否如实提示。
5. 导入 `fixtures/fixture-st.zip` 后：图表卡右上角 `⤢` 是否最大化；树行是否出现 `›` 下钻；勾选是否仍生效。

Luker 真机复验：在 8004 打开 账户 → Backup，确认 `.dw-foot` 内出现 `dw-btn` 样式的「从宿主拉取」；
关闭再开 3 次按钮不重复；点配额「浏览器」行应打开账户窗口并选中 Browser Storage。

---

## 4. 未完成：第二批（R4–R6）

计划判据见 `docs/PLAN-2026-11-09.md` §1/§3，要点：

| 项 | 要点 |
| --- | --- |
| R4 迁移与备份入口 | 动作行只留 `#transfer-open-btn`；面板一级 tab「局域网互传 / 公网互传」，公网内再切 S3 / WebDAV；LAN 功能零回归 |
| R5 S3 通用化 | 分片（默认 8 MB）+ 增量（sha256/ETag 命中即跳过）+ 断点 + Range 下载 + 并发上限 + 错误分类 |
| R6 WebDAV | 新 `src/core/webdav-client.js`：OPTIONS 探 Allow；PROPFIND 405 → manifest；MKCOL 405/409 → 已存在；主路径只用 GET/PUT/HEAD/DELETE；不使用 PATCH/LOCK/MOVE；Basic 认证；CORS 失败单独分类 |

**已裁定**：自动备份只做 `stream-direct`（流式直传，不落盘，注明经本机网络）与
`pull-trim-upload`（拉取后按独立偏好修剪再上传）；偏好与图表勾选分开且常驻提示；
所有网络传输入口必须弹流量提醒。服务端直传**不实现**。

---

## 5. 坑与注意事项（本轮新增）

1. **测试桩的 `closest` 不会按选择器过滤**：`closeNativeBackupUi` 的 `dialog.dw-layer` 判定必须同时校验
   `className`，否则桩里任何 surface 都被当成新窗口，旧链路测试全红。
2. **新增设置项会撞现有断言**：`test/settings-panel.test.js`、`test/settings-store.test.js`、
   `test/plugin.test.js` 都写死了键集/复选框数；新增键后要同步更新（本次 4 处）。
3. **模板必需节点**：删日志徽标必须同步 `scripts/single-template-source.js` 的 `REQUIRED_TEMPLATE_IDS`。
4. **`[hidden]` 特异度**：配额行由 `div` 改为 `button` 后，`.quota-row` 规则必须保持 `#app.app-container` 前缀；
   无能力提示用 `.quota-nopage`，不要另起容器（默认隐藏容器需高特异度覆盖）。
5. **进度日志颗粒度**：不要按固定字节步进（4MB 在 500MB+ 包上会刷屏）；用「至少 16MB **且** 间隔 ≥1.5s」双阈值。

---

## 6. 文件索引

- 计划：`docs/PLAN-2026-11-09.md`
- 宿主契约：`.trellis/spec/frontend/luker-2.9-account-window.md`
- 能力事实增补：`.trellis/spec/frontend/host-capabilities.md`（「Luker 2.9 账户窗口」节）
- 后端建议：`docs/FUTURE-BACKEND-CAPABILITIES.md`
- 开发指南：`docs/DEVELOPER-GUIDE.md`（§A 原生入口、§I 诊断）
- 未提交：本轮全部改动仍在工作区（`git status` 可见）；`test/`、`scripts/` 按铁律 21 不入库。
