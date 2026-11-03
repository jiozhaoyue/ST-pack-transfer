# 局域网互传 · 交接（2026-10-27 · 正式接线完成）

> **UI 偏移溯源见** [../10-26-storage-chart-workbench/HANDOFF-2026-10-27-UI-TRACE.md](../10-26-storage-chart-workbench/HANDOFF-2026-10-27-UI-TRACE.md)：
> 设置页/图表全选/`导入01` 位置等偏移的完整证据与待修清单；**未确认前不要擅自改**。

> **状态：功能完成，待四宿主/真机复跑。**
> 执行卡内联 LAN 区块已接入 `index.js`（`qr` + `actions.lan`），旧浮层与 `.wb-lan-*` 样式已删除；
> 独立 Web 双上下文 3 MB + 64 KB 多包排队真互传 **24/24 通过**。
> 剩余：四宿主/六对复跑、PT 快照重装、真机双设备 AC-10。

---

## 一、一句话现状

局域网互传从「独立浮层 + 发送/接收两个绝对页签」改为**执行卡内联、一屏同时显示发送与接收**；
接收包直接进**唯一的导入区**，只用包卡文件名下原有的来源徽标区分 **本地导入 / 远程导入**，
宿主仍由**扫包**判定。二维码（显示 + 相机扫描）已接入 demo，相机权限失败时提示并保留粘贴。

**代码层面（2026-10-27 接线后）**：新 UI 已在正式三件套落地（`style.css` / `workbench-template.js` / `workbench-view.js`）；
`src/ui/lan-transfer-panel.js` 已重写为**内联控制器**（只读模板 id + `view.setLan()`），
`src/ui/qr.js` 提供二维码，`index.js` 传入 `qr` / `actions.lan` / `getSendTargets`，
接收走 `ORIGINS.LAN` 并以「远程导入」徽标落进唯一导入区。

---

## 二、4 轮讨论定稿（用户逐轮确认）

| # | 主题 | 决定 |
| --- | --- | --- |
| 1 | 承载面 | **执行卡内联、可折叠区块**；不再用独立弹窗；不设发送/接收绝对页签 |
| 1 | 一屏布局 | **发送在上、接收在下**（桌面与移动端同序；移动端用 CSS 把接收提到最上） |
| 1 | 发送源 | **只发导入区当前勾选的包**；不额外接本地文件选择器 |
| 1 | 接收落地 | **直接进导入区**，不弹确认；自动选中/高亮 |
| 2 | 展开方式 | 执行卡内「局域网互传」可折叠；展开时包区让出高度、执行卡内部滚动 |
| 2 | 二维码 | **文本码 + 二维码同显**；接收端提供「扫码」按钮，粘贴始终可用 |
| 2 | 多包 | **逐个排队发送**；每完成一个，接收端落一张包卡并分别标来源 |
| 2 | 进度 | **发送/接收各自行内进度条 + 状态**；折叠标题显示当前活动百分比 |
| 3 | 移动端 | **接收在上**；一个「扫码」按钮（按当前步骤扫取件码/应答码）；跟随执行卡 |
| 3 | 相机权限 | 拒绝/不可用时显示原因，**粘贴框始终保留**，不自动窥探权限 |
| 4 | 来源标记 | **不新造「来自某设备」**；导入区只有一个，用文件名下的现有徽标区分 `本地导入` / `远程导入` |
| 4 | 宿主判定 | 接收后仍**扫包**（layout），不信发送端自报；图标角标显示 ST/L/TT/PT |
| 4 | 同名冲突 | **自动加序号**（`name (2).zip`），不覆盖 |
| 4 | 失败重试 | **新取件码 + 续传**（`fileId` + 已收字节）；界面显示已收比例 |
| 4 | 扫码后 | **扫码即继续**：取件码自动 accept、应答码自动 apply |

用户中途纠偏（务必记住）：
- **导入区只有一个**，不是「本地导入区 / 远程导入区」两个区；本地/远程只体现在徽标。
- 不要新造任何来源标签；沿用包卡文件名下现有的 `.pkg-meta` 徽标。
- 写文档/实现时不要无思考地把所有东西都塞进正式代码；正式代码必须自包含、零测试引用。

---

## 三、demo 已完成并实测

### 3.1 UI

| 区域 | 内容 |
| --- | --- |
| 执行卡 | `#action-row` 下方新增 `#lan-block`（`#lan-toggle` + `#lan-body`） |
| 发送 | `#lan-send-summary`（已选 N 个包 · 大小）、`#lan-btn-generate`、`#lan-send-code`、`#lan-send-qr`、`#lan-btn-retry`、`#lan-btn-cancel`、`#lan-answer-input`、`#lan-btn-scan-answer`、`#lan-btn-apply-answer`、`#lan-send-phase/bar/pct/detail` |
| 接收 | `#lan-offer-input`、`#lan-btn-scan-offer`、`#lan-btn-accept`、`#lan-recv-code`、`#lan-btn-copy-recv`、`#lan-recv-qr`、`#lan-recv-phase/bar/pct/detail`、`#lan-btn-abandon` |
| 扫码 | `#lan-scan`（video + canvas + 取消 + 错误行），内联在执行卡内，不是新弹窗 |
| 移动端 | `@media (max-width:860px)` 把 `.lan-recv{order:-1}`，接收在上 |

### 3.2 浏览器实测读数（`out/lancheck/probe-demo-lan.cjs`）

```
initial: lanVisible=true, bodyHidden=true, qrLib=function, jsqrLib=function,
         packages=5, origins=[本地导入 ×5]
summary: 已选 1 个包 · 380 MB
send:    code=SZC1.z.DEMO-OFFER-…, qr=true, phase=把取件码交给对方
sending: 36% 发送中
sent:    100% 已发送 · 摘要一致
recv:    code=SZC1.z.DEMO-ANSWER-…, qr=true
received: 100% 已接收 · 摘要一致；导入区出现远程包（origin=远程导入，自动选中）
mobile:  recvY < sendY（接收在上）
export:  导出区有 排序（时间倒序/名称/大小）
errors:  []
```

截图（gitignored，本地 `out/lancheck/`）：
`shot-demo-lan-send.png`、`shot-demo-lan-recv.png`、`shot-demo-mobile-lan.png`。

### 3.3 正式三件套落点

`style.css`、`src/ui/workbench-template.js`、`src/ui/workbench-view.js` 是手写唯一源；
`src/ui/ui-demo.html` 只 import 它们（`npm run dev` 后访问 `/src/ui/ui-demo.html`）。
`test/ui-demo-isolation.test.js` 守卫「正式代码零引用 demo」。

---

## 四、二维码与许可证（本轮新增）

| 项 | 内容 |
| --- | --- |
| 编码 | `src/vendor/qrcode-generator.js`（qrcode-generator 2.0.4，MIT，56,694 B） |
| 解码 | `src/vendor/jsqr.js`（jsQR 1.4.0，Apache-2.0，256,885 B） |
| 许可证 | `src/vendor/qrcode-generator.LICENSE`、`src/vendor/jsqr.LICENSE` |
| 根许可证 | `LICENSE` 已换为 **AGPL-3.0** 标准全文；`package.json` / `README.md` 同步 `AGPL-3.0-or-later` |
| demo 加载 | demo harness 用 classic `<script src="../vendor/…">` 加载二维码库；demo 只经 HTTP（`npm run dev`）预览 |
| 正式加载 | **待做**：`index.js` 导入 `src/ui/qr.js`，并把它传给 `createWorkbenchView({ actions, qr })` |
| 相机 | `getUserMedia({video:{facingMode:'environment'}})`；失败 `onError` → 错误行 + 粘贴仍可用 |
| 码内容 | 完整 `SZC1.z.…` 取件码/应答码（约 700 字符），QR cellSize=3、margin=2 |

**注意**：`qrcode-generator.js` 是 UMD，但 `var qrcode` 在 ES module 里不会挂到 window。
正式侧要么给 vendor 文件补一行 `window.qrcode = qrcode`，要么用 classic script 注入；
jsQR 的 UMD 会自动挂 `window.jsQR`。

---

## 五、当前状态（2026-10-27 接线后）

已完成：

1. `index.js` 已传 `qr` 与 `actions.lan`，按钮全部有真实动作。
2. 旧 `mountLanTransferPanel` 浮层与重复 `lan-*` id 已删除。
3. `.wb-lan-*` 样式已删除；旧浮层文件已重写为内联控制器。
4. `src/ui/qr.js` 已建：classic 注入本地 vendor；`ready()` 失败时二维码隐藏、粘贴可用。
5. `ORIGINS.LAN` + `远程导入` 徽标已接线；`importFiles({remote:true})` 自动加序号并扫包。
6. 多包队列已实现：勾选多个包 → 逐个生成取件码，完成一个自动出下一个。
7. E2E 已改写并通过：两个**独立上下文**、3 MB + 64 KB 两包排队、二维码渲染、远程导入徽标、一次性。

仍未完成：

8. **四宿主矩阵 / 六对互传**：需要在 Dev ST / Dev Luker / Dev PT / TT 上用新 UI 复跑
   （协议层未改，旧读数 120/120 仍可参考，但新 UI 必须重新取证）。
9. **PT 快照**：PT 的插件是 `git archive HEAD` 安装的快照；改完要 `install-pt-extension.cjs --replace` 重装。
10. **真机双设备（AC-10）**：仍未做；现有证据是同机双上下文 + 同机跨宿主。

---

## 六、剩余步骤（按顺序）

### 第 1 步：四宿主 / 六对复跑（新 UI）
1. `npm test` + 五守卫（已绿，可复跑确认）。
2. 四宿主矩阵：`node scripts/run-e2e-instances.cjs --only dev-st,dev-luker,dev-pt,tt-cdp`
3. 六对互传：`node out/lancheck/pair-all.cjs`。旧脚本用浮层选择器，需改成新 UI：
   `#lan-toggle` → `#lan-btn-generate` → `#lan-offer-input` → `#lan-btn-accept` →
   `#lan-answer-input` → `#lan-btn-apply-answer`。
4. PT 快照：`install-pt-extension.cjs --replace` 后跑 pt-load。

### 第 2 步：收口
1. 回填 `prd.md` / `implement.md`，更新 spec §7.2（已做），提交推送。
2. 真机双设备验收（AC-10）。

---

## 七、文件地图

| 区域 | 文件 |
| --- | --- |
| **正式 UI 唯一源** | 三件套：`style.css` / `src/ui/workbench-template.js` / `src/ui/workbench-view.js` |
| 开发预览页 | `src/ui/ui-demo.html`（只消费正式代码，`npm run dev` 后访问 `/src/ui/ui-demo.html`） |
| 生成物 | `style.css` / `src/ui/workbench-template.js` / `src/ui/workbench-view.js` |
| 视图 LAN 逻辑 | 在 `workbench-view.js` 的 `renderLan` / `startLanScan` / `setLan`（由 demo 同步） |
| 协议引擎（待改内联） | `src/ui/lan-transfer-panel.js` |
| 纯逻辑 | `src/core/lan-transfer.js` |
| 二维码 | `src/vendor/qrcode-generator.js`、`src/vendor/jsqr.js`（`src/ui/qr.js` 待建） |
| 控制器 | `index.js`（`mountLanTransferPanel` 调用处、`syncPackages`、`importFiles`） |
| 存储来源 | `src/storage/db.js`（`ORIGINS`） |
| demo 探针 | `out/lancheck/probe-demo-lan.cjs`（gitignored） |
| 六对互传 | `out/lancheck/pair-all.cjs`（gitignored） |

---

## 八、雷区（本轮新增）

1. **TT 的 `<html>` 带 `transform` 且高度 0**：全屏浮层用 `top:0;left:0;width:100vw;height:100vh`，不要 `inset:0`（否则塌成 0/24px）；`bottom` 锚点改 `top:calc(100vh - X)`。已在 `f5e2423` 修复。
2. **打开工作台前关闭宿主扩展弹层**：`host-bridge.closeHostExtensionSurface()`；TT 还会弹「扩展更新」dialog，层级高于工作台。已在 `f5e2423` 修复。
3. **demo 外圈不得进正式代码**：正式三件套不得出现 `demo` / `演示` / `DEMO_`；`test/ui-demo-isolation.test.js` 硬门禁。
4. **正式数据不得造假**：配额用 `navigator.storage.estimate()`；宿主无读数就写「当前宿主无逐项读数」。
5. **实例里只许留一份插件**：改名前的 `st-zip-converter` 副本会让旧 UI 抢占初始化；已移出为 `.disabled` / `.linkbak`。
6. **二维码库**：不要引 CDN；正式侧加载 vendor 时注意 qrcode-generator 的 ESM 导出问题。
7. **相机权限**：只在用户点「扫码」时请求；拒绝后保留粘贴，不自动重试权限。

---

## 九、本轮已验证（可作为回归基线）

- `npm test`：**874 passed / 2 skipped**（demo 隔离守卫替换旧逐字同步守卫）。
- 五守卫全绿：`check:css-scope` / `check:dom-injection` / `check:template-source` / `check:dom-scope` / `check:control-consumer`（43 控件 / 35 声明）。
- `test/ui-demo-isolation.test.js`：正式源码零引用 demo，demo 只消费正式模块。
- demo 浏览器探针：零错误、二维码/进度/远程徽标/移动端顺序/导出排序均通过。
- 协议层六对互传：**120/120**（旧浮层 UI 下；协议未改）。
