# 计划：web 模式互联码无反应 + 手机图表勾选错位 + 教程生成包 0 KB 样式异常

记录时间：2026-11-19
状态：待用户批准后执行

## 背景

用户实测 web 模式点击「生成互联码」完全无反应且无报错，另有手机模式图表勾选标记不在中心、
教程模式数据包列表生成包样式异常。本文件如实记录已核实的根因与证据，供修复与验收追溯。

---

## 问题一（P0）：web 模式点「生成互联码」无反应、无报错

### 根因

`src/ui/workbench-view.js:8740` 的 `setLan(next = {})` 只处理 `open` / `next.send` /
`next.recv` / `scanError`，**缺少 `next.peer` 分支**。

调用方 `src/ui/lan-transfer-panel.js:903`:

```js
const setPeer = (patch) => view.setLan({ peer: patch });
```

`peerGenerate()`（`lan-transfer-panel.js:1051`）成功后执行 `setPeer({ code, tip })`，
该 patch 被 `setLan` **静默丢弃**，不抛异常，因此 `try/catch`（第 1053-1056 行）也不会触发。

`renderLan()`（`workbench-view.js:5547-5567`）从 `state.lan.peer` 读 `code` / `tip` /
`connected` 渲染二维码与输入框；由于从未写入，恒为初始空值，界面零变化。

### 影响面

不只是「生成互联码」。所有经 `setPeer` 的交互全部失效：

- `lan-transfer-panel.js:1051` 生成对等码
- `lan-transfer-panel.js:1085` 生成应答码
- `lan-transfer-panel.js:1093` 连接中提示
- `lan-transfer-panel.js:1111` 断开复位
- `lan-transfer-panel.js:942`（`syncPeerUi`）连接态 / RTT / 活跃传输卡 / 队列

### 附带缺陷

- `state.lan.peer` 初始结构（`workbench-view.js:443-450`）缺 `code` / `tip` 字段，
  只有 `connected` / `rtt` / `offerCode` / `answerCode` / `active` / `queue`。
  其中 `offerCode` / `answerCode` 在整个 view 内**无任何读写**，属死字段。
- `peerGenerate()`（`lan-transfer-panel.js:1035`）未检查 `probeDirectCapability()` 结果，
  非安全上下文（如 `http://` 局域网 IP）下仍会尝试建立 `RTCPeerConnection`。
- `waitIceComplete()`（`lan-transfer-panel.js:247`）6 秒到点静默返回 `false`，调用方
  `peerGenerate` 不检查返回值，用户需空等最长 6 秒且无任何进度反馈。
- **点击无 loading / disabled 态**（`lan-transfer-panel.js:1035-1057`，
  事件绑定 `workbench-view.js:7642`）：按钮可重复点击，能并发创建多个
  `RTCPeerConnection` / DataChannel，造成资源泄漏与状态竞争。
- **长互联码单行输入**（`workbench-template.js:147`）：对等码经 `encodePickupCode` 可达
  上千字符（`qr.js:63` 注释称约 2.9KB 容量）。红队实测 2000 字符时
  `scrollWidth=11036` vs `clientWidth=266`（320px 视口），用户只能看到码开头。
- **`.lan-qr.is-compact` 无任何 CSS 规则**：模板 `workbench-template.js:156` 使用该类，
  但 `style.css` 中不存在定义。实际生效的是 `style.css:2119` 固定 116px 盒子与
  `style.css:2164` 的 `svg{width:150px;height:150px}`，SVG 被容器硬压（150→104px）。
  二维码版本升高时可能被压到不可扫。
- **无障碍缺失**：`#lan-peer-btn-copy`（`workbench-template.js:153`）纯图标按钮只有
  `data-i18n-title`，无 `aria-label`（同文件 45/92/387 行的纯图标按钮都带
  `data-i18n-aria`）；`#lan-peer-input` 无 label；二维码 SVG 无 `role` / `aria-label`。

### 红队实测补充（Playwright headless，320/375/768 三档）

- `[hidden]` 全局保护存在（`style.css:1957`），未被裸选择器压过，此项安全。
- 无横向溢出。英文下 4 个按钮在 320/375px 折成 2 行，属可接受换行。
- `#lan-peer-queue-list` 有 `max-height:190px; overflow-y:auto`（`style.css:2136`），正确。
- 队列渲染对 `name` / `status` / `title` 均已 `escapeHtml`，无未转义插值。

### 为什么 1427 个测试没拦住

经实跑核实（`npx vitest run` → 1427 passed / 2 skipped，153 files，11.87s）：

1. `test/lan-transfer.test.js` 只测纯逻辑（编解码、分块、状态机），文件头第 6-8 行自述
   「WebRTC 与 DOM 装配……不在此处假装测过」，且只从 panel 导入 3 个纯函数。
2. 全 `test/` 对 `setLan` / `getLan` / `createView` 的调用为**零**。
3. 所有涉及 `workbench-view.js` 的测试都是 `readFileSync` + `toMatch` 的源码字符串匹配。
4. `test/ui-viewport-guard.test.js:52-70` 只断言模板里存在 `lan-peer-btn-generate` 等字符串。
5. 项目无 `jsdom` / `happy-dom`，vitest 默认 node 环境，无 DOM 可操作。
6. `check:control-consumer` 输出自述「只强制『声明存在』，不验证声明为真」。
7. `check:dom-injection` 输出「整文件豁免 1 个（`src/ui/workbench-view.js`）」。
8. `e2e/standalone/specs/lan-transfer.e2e.cjs:161` 只点 `#lan-btn-generate`（legacy 路径），
   对 `peerGenerate` / `lan-peer-btn-generate` 零覆盖。

### 修复方案（待批准）

在 `setLan` 增加 `peer` 分支：

```js
if (next.peer) Object.assign(state.lan.peer, next.peer);
```

并补齐 `state.lan.peer` 初始的 `code` / `tip` 字段。

---

## 问题二（P0）：手机模式图表勾选 ✅ 不在中心

### 根因

`style.css:1982-1992` 的对勾用**绝对定位硬编码**，按 14px 方框算：

```css
#app.app-container input[type="checkbox"]:checked::after {
  left: 4px;  top: 1px;  width: 4px;  height: 8px;
}
```

手机模式 `style.css:1766` 把 `.tree-check` 放大到 `20px`：

```css
#app.app-container[data-view="mobile"] .tree-check{width:20px;height:20px}
```

但 `::after` 的偏移量没有同步，对勾仍钉在按 14px 计算的位置，在 20px 方框内偏左上。

同类放大点（均未同步 `::after`）：`style.css:1768` `.pkg-check` 20px、
`style.css:1795` `.pkg-check` 20px（重复声明）、`style.css:1788`
`.tree-keepincompat input` 18px、`style.css:1797` `.ext-dev-check input` 20px。

### 修复方案（待批准）

改用百分比 / 居中变换，不再依赖固定像素：

```css
left: 50%; top: 45%;
transform: translate(-50%, -50%) rotate(45deg);
```

并把各放大点统一，避免每加一处尺寸就要重算偏移。

---

## 问题三（P0）：待导出卡片是凭空的第三套卡片系统（用户 2026-11-19 裁定「不应当存在」）

### 用户判定

> 是他妈的样式他妈的有绝对问题，我他妈的不知道你从哪里找的素材，
> 他妈的这种样式，生成这种样式的逻辑就不应当存在，不应当有这些素材和样式

即：**0 KB 只是表象**。真正问题是 `pendingCardHtml()` 凭空造了一套卡片渲染，
连带造了一批**只服务它一个人**的素材与样式，绕开了既有数据包卡范式。
对策不是「让它显示对体积」，而是**删除这套私有渲染，复用真实包卡**。

### 内容与样式两个层面的重复

仓库里并存三套卡片渲染：

| 渲染器 | 位置 | 卡片类名 | 状态 |
| --- | --- | --- | --- |
| 数据包卡（真实） | `workbench-view.js:2205` `pkgCard()` | `.pkg-card` | 主范式，含复选框/序号/宿主实心角标/纯文本徽标 |
| 待导出卡（私有） | `workbench-view.js:8594` `pendingCardHtml()` | `.pkg-card.is-export` + 私有占位/图标 | **应删除** |
| 导出队列卡（另一套） | `export-queue.js:500+` | `.eq-*` / `.btn-archive-action` | 独立第三人，同样重复 |

### 只服务 `pendingCardHtml` 的孤儿素材（均已核实唯一消费者）

| 素材 | 定义 | 唯一使用点 |
| --- | --- | --- |
| `.pkg-check-spacer` | `style.css:808` | `workbench-view.js:8602` |
| `.pkg-icon[data-host="file"]` | `style.css:809-810` | `workbench-view.js:8603` |
| `.pkg-host-tag` 内联 `ZIP` 伪角标 | `workbench-view.js:8604` 内联 style | 同上 |
| `pending.badge` 文案「生成包」 | `zh-CN.js:1322` | `workbench-view.js:8606` |

对比真实 `pkgCard()`：复选框是**真复选框** `pkg-check`（2205/2238），不是空格占位；
角标是 `pkg-host-tag` 承载**宿主实色**（2226 `tagStyle`，ST/L/TT/PT），
不是手写 `ZIP` 字面量 + 内联 accent 色；meta 是纯文本徽标数组（2227-2234），
没有「生成包」这种自造 pill。

### 体积恒为 0 KB 的机制（表象）

教程演示生成（`workbench-view.js:6922-6933`）造的待导出项只含
`id`/`name`/`mb`/`size`/`zone`/`origin`/`target`/`time`/`nodes`，**无 `blob`**。
而 `pendingCardHtml():8595` 只认 `it.blob?.size`，`fmtMB(0)` → 恒 `0 KB`；
已算好的 `it.size`（6926）无人消费。

即便补上体积，这张卡依然是与真实包卡异构的野样式。故体积问题**随渲染器删除一并消失**。

### 修复方向（待用户裁定范围）

- A（推荐）：删除 `pendingCardHtml()`，待导出项走 `pkgCard()` 同一范式渲染；
  同步删除上表全部孤儿素材与 `pending.badge` 文案，动作入口收敛到 `.pkg-actions`。
- B：保留独立函数但强制复用 `pkgCard()` 的 DOM 结构与素材，只替换数据来源。
  样式仍只有一套。

无论哪种，`.pkg-check-spacer`、`data-host="file"`、内联 `ZIP` 伪角标、
`pending.badge` 都不应保留。

---

## 问题五（P1）：手机模式数据包列表抽屉动画异常

### 根因：展开态与收起态用了两套不同的布局算法

展开态（`style.css:1701-1704`）：

```css
#app.app-container[data-view="mobile"][data-zone-open="1"] .col-side{
  display:flex;flex-direction:column;order:-1;
  min-height:240px;max-height:75vh;
  animation:zoneDrop .24s ease;
}
```

收起态（`style.css:1725-1727`）：

```css
#app.app-container[data-view="mobile"] .col-side.is-closing{
  display:grid;grid-template-rows:0fr;
  animation:zoneClose .2s ease forwards;
}
```

两个致命矛盾：

1. **`flex` → `grid` 布局算法切换**。收拢动画一开始，`display` 从 `flex` 变 `grid`，
   盒模型被重建，`1fr→0fr` 的连续插值前提不成立，表现为内容瞬间塌陷再淡出，
   而不是平滑收拢。代码注释（1722 行）声称「1fr→0fr 收拢完再 display:none」，
   与实际实现不符。
2. **`style.css:1680` 反向锁定**：
   ```css
   #app.app-container[data-view="mobile"] .col-side > *{flex:0 0 auto}
   ```
   子项被强制 `flex:0 0 auto`，而 `0fr` 收拢依赖子项可压缩，规则互斥。

3. `zoneClose` 关键帧（1733-1736）只改 `opacity` 与 `translateY`，
   **没有 `grid-template-rows` 关键帧**，所以高度收拢完全没参与动画。

### 附带：列表重建丢失动画连续性

`renderZones()`（`workbench-view.js:2249`）每次都整体重建 `body.innerHTML`
（第 2295 行 `body.innerHTML=html`），并手动补偿 `scrollTop`（2296-2298）。
每次勾选/排序/切页签都重建全部 `.pkg-card`，无入场动画、无 FLIP 位移过渡，
列表内容会「闪一下」。`.pkg-card` 自身在 `style.css` 中无 `animation` / `transition`
（已 grep 确认）。

### 修复方向（待批准）

统一为同一布局模型（推荐 grid 保留在两态），让 `grid-template-rows:1fr → 0fr`
真正参与动画；删除互斥的 `flex:0 0 auto` 覆盖；或统一改回 flex + `max-height` 过渡。
列表重建问题单独评估是否引入 FLIP。

---

## 问题六（P0）：「发送到对端」按钮彻底不可用（双重错配）

### 第一层：`async` 函数当同步用

`src/ui/lan-transfer-panel.js:1175`：

```js
function peerSend() {
  const targets = getSendTargets ? getSendTargets() : [];
  if (!targets.length) {          // Promise 没有 .length ⇒ undefined ⇒ !undefined 恒 true
    toast(t('lan.toast.selectPacksToSend'));
    return;                       // 每次都从这里返回
  }
```

而 `src/ui/index.js:644` 定义的是 `async function getSendTargets()`，返回 `Promise<File[]>`。
即：**勾选了数据包也一样弹「请先勾选数据包」**，发送流程永远到不了入队。

### 第二层：字段名与类型双双错配

`lan-transfer-panel.js:1180-1185` 假设目标是 `{ name, sizeBytes, blob }` 的包装对象；
但 `getSendTargets`（`index.js:654`）返回的是 `new File([blob], pkg.name, {...})`，即 `File` 对象：

- `File` 只有 `.size`，没有 `.sizeBytes` ⇒ `size` 恒为 `0`
- `File` 没有 `.blob` ⇒ `blob` 恒为 `undefined`

即便修好第一层，`pumpPeerQueue()`（`lan-transfer-panel.js:1123-1126`）拿到
`task.file?.blob || task.file` 后 `file.slice()` 会落到 `undefined` 上抛错，
发送仍然失败。

### 修复方案

`peerSend` 改 `async`，`await getSendTargets()`，并直接以 `File` 为准：

```js
async function peerSend() {
  const targets = getSendTargets ? await getSendTargets() : [];
  ...
  targets.forEach((file) => {
    peerManager.enqueueSend({ name: file.name, size: file.size, blob: file });
  });
```

同时把 `workbench-view.js:7652` 的调用改为 `void actions.lan?.peerSend?.()`。

---

## 问题七（P1）：对等通道其余静默失败与无界等待

- **无界等待**（`lan-transfer-panel.js:1142-1144`）：
  `while (dc.bufferedAmount > HIGH_WATER_MARK) { await sleep(20) }`
  无超时、无 `readyState` 检查、无取消检查。通道 stalled 或被 `peerDisconnect()`
  关闭后此循环**永久悬挂**，`finally` 与后续队列永不执行。
- **`dc.onerror` 静默吞错**（`lan-transfer-panel.js:969-971`）：
  仅 `dbg('peer dc error')`，而 `dbg` 只在 `localStorage lan-debug=1` 时输出，
  生产环境对端通道错误完全不可见。
- **接收完成无 try/catch**（`lan-transfer-panel.js:1013-1025`）：
  `onmessage` 为 `async`，`q_done` 分支的 `await incoming.sink.finalize()`
  与 `void onReceive(...)` 抛错会变成未处理的 Promise rejection，用户静默丢失接收结果。
- **`capability.direct` 门禁缺失**（`lan-transfer-panel.js:1035` / `:1059`）：
  `generate`(597) / `applyAnswer`(614) / `retry`(655) / `acceptOffer`(817)
  四个入口都有门禁（共 5 处 `capability.direct`），唯独 `peerGenerate` / `peerConnect`
  没有。非安全上下文下拿不到干净提示。
- **定时器未清理**（`lan-transfer-panel.js:256-260` / `583-590`）：
  `withTimeout` 与确认等待的 `setTimeout` 在 promise 先 settle 后未 `clearTimeout`。

### 状态字段层面的噪声

- `workbench-view.js:446-447` `offerCode` / `answerCode`：全仓仅此两行，死字段。
- `workbench-view.js:451-452` `send.done` / `recv.done`：8 处写入（417/428/649/669/
  720/764/827/868/891），`renderLan()` 从不读取。
- `send.waiting` / `send.error`：多处写入但未列入 `send` 初始结构，靠 `Object.assign`
  动态长出。

### 已核实无问题的项

`renderLan()` 引用的 51 个 DOM id 与 `workbench-template.js` 全部 247 个 id 做差集为**空**，
不存在「渲染不存在的 id」的静默失效。

---

## 问题四（已澄清，不改）：汇总行随图表滚动

用户 2026-11-19 明确：**汇总行跟随整个图表一起滑动是正确行为，不是缺陷，不要修改。**

原先怀疑的 `.chart-foot` 在 `data-view="mobile"` 下随 `.chart-tree{overflow:visible}`
（`style.css:1754`）一起滚动，经用户确认属预期维度，此条撤销。

---

## 附带发现（记录，不在本次修复范围）

1. `AGENTS.md:147/154` 声称测试为 `1414 passed / 2 skipped`，实测为
   **1427 passed / 2 skipped**，文档数字滞后。
2. `AGENTS.md` 顶部 RULES-POINTER 声称规则唯一真源是 `RULES.md`（30 条）+
   `RULES-DETAILS.md`（82 条细则），但仓库根目录**不存在这两个文件**。
3. `state.lan.peer.offerCode` / `answerCode` 为死字段，全 view 无读写。
4. `style.css:1768` 与 `style.css:1795` 重复声明 `.pkg-check` 20px。

## 验收标准

- [x] web 模式点「生成互联码」后，输入框出现码、二维码显示、提示文案更新
      —— `setLan` 补 `peer` 分支；`test/ui-lan-state-contract.test.js` 7 用例覆盖
- [x] 点击后有即时状态反馈（不得空等 6 秒无变化）
      —— 生成期写入 `lan.peer.generating`；ICE 未收全时提示 `codeGeneratedNoIce` 并记 WARN
- [x] `setPeer` 的连接态 / RTT / 队列 / 断开复位全部生效
      —— 合成用例覆盖 connected / rtt / queue / 断开复位
- [x] 「发送到对端」按钮恢复可用
      —— `peerSend` 改 `async` 并 `await getSendTargets()`，入队直接以 `File` 为准
- [x] 手机模式图表勾选 ✅ 在方框正中（14px 与 20px 两种尺寸都居中）
      —— Chromium 实测偏差 0px（三档：桌面 14 .tree-check、手机 20 .tree-check、手机 20 .pkg-check）
- [x] 教程模式生成包含真实体积，非 0 KB
      —— 体积计算兼容 `blob.size` 与 `size/mb`
- [x] 教程模式生成的包卡与真实包卡视觉同构
      —— 删除私有渲染，改走 `pkgCard(pkg, { pendingId, pendingActions })`
- [x] 孤儿素材全部删除
      —— `.pkg-check-spacer`、`data-host="file"` 样式、手写 ZIP 角标、`pending.badge` 文案
- [x] 手机数据包列表抽屉动画不再中途切换布局模型
      —— 两态统一 flex/column，Chromium 实测 `display` 与 `flex-direction` 一致，`grid-template-rows` 已消失
- [x] 新增测试能覆盖 `setLan({peer})` 数据流（防止同类接线错误再漏）
      —— 移除 `peer` 分支做回归探针，3 个用例立即变红；恢复后全绿（已实测）
- [x] `npm test` 全绿且新增用例真实失败-通过可验证
      —— 1434 passed / 2 skipped（原 1427，新增 7）
- [x] 同提交内同步 `docs/DEVELOPER-GUIDE.md` 与 `README.md`

## 本次附带修掉的隐藏缺陷

- `renderLan()` 队列渲染调用 `formatBytes()`，但 `workbench-view.js` **从未导入该函数**。
  此前因 `setLan` 漏 `peer` 分支、队列恒为空，这行代码从未执行到；修好 `setLan`
  后由新集成测试立即抓出 `ReferenceError`。已改用本文件既有的 `fmtMB()`。
- `pumpPeerQueue()` 的 `bufferedAmount` 排空循环是真·无界等待，已补
  `readyState` / 取消标志 / `HIGH_WATER_TIMEOUT_MS` 三重退出条件。
- `dc.onerror` 仅写 debug 日志（生产不可见），已同时入日志与 toast。
- `q_done` 分支的 `finalize()` / `onReceive()` 无 try/catch，会静默产生未处理 rejection，已兜住。
- `peerGenerate` / `peerConnect` 缺 `capability.direct` 门禁，已与其余四个入口对齐。
