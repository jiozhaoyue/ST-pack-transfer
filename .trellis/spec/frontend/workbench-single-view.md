# 工作台单一视图与局域网互传

> 2026-10-14 新建。来源：用户当轮死命令 + 实测取证。**本页自包含**，不引用任务目录。
> 适用：`src/ui/workbench-template.js`、`style.css`、`src/ui/onboarding-guide.js`、
> `src/ui/lan-transfer-panel.js`、`src/core/lan-transfer.js`。

---

## 1. 单一视图（无模式切换、无步骤条）

**契约**：工作台只有**一个视图**。区块按层级顺序排列，没有「向导模式 / 高级模式」切换，
没有步骤条，没有按步骤分段显隐。

**为什么**：2026-10-13 引入的迁移向导把同一份 DOM 用 `data-wb-step` 分段显隐，
用户 2026-10-14 实测后裁定整体删除。实测缺陷（截图 + DOM 双证）：

| 现象 | 根因 |
| --- | --- |
| 第 6 步「核对」整步为空 | `#report-panel` 未参与 `data-wb-step` 显隐 |
| 第 3 步「范围」显示的不是范围选择器 | `#category-panel` 初始 `display:none`，该步实际渲染打包折叠项 |
| 配额条与日志台在每一步都可见 | 二者无 `data-wb-step`，属全局 chrome 却放在向导正文流里 |
| 「从源重开」空壳框全程可见 | 见 §2 |

**守卫**：`test/workbench-session.test.js` 断言模板里**不得**再出现
`data-wb-step` / `btn-wb-view-toggle` / `wizard-rail` / `btn-wizard-*` / `wizard-step-counter`。

---

## 2. `[hidden]` 与 `display` 的特异度陷阱（真实事故）

**契约**：任何「默认隐藏」的容器，若样式表给它写了 `display`，**必须同时写一条
`[hidden]` 覆盖规则**，且该规则的特异度**不低于**写 `display` 的那条。

**事故**：`#wizard-gate` 在模板里是 `hidden`，但 `style.css` 写了
`#app.app-container .wb-gate { display: flex }`。插件内已有一条全局兜底
`#app.app-container [hidden] { display: none }`，**但两者特异度相同**（id + 2 个 class 级），
于是**源码顺序决定胜负**——`.wb-gate` 那条位置更靠后 ⇒ 它赢 ⇒ 空壳框永远可见。
更糟的是 `showGate()` 在全仓**没有任何调用点**，所以它从不被触发、却永远显示，
内容永远是空字符串。同类元素 `.host-tree-confirm-bar` / `.task-controls` / `.report-panel`
都单独补了 `[hidden]` 覆盖规则，**唯独漏了 `.wb-gate`**——「逐元素打补丁而非根治」的实证。

**正确写法**（提高特异度，不依赖源码顺序）：

```css
#app.app-container .wb-guide-overlay[hidden], .st-converter-drawer-app .wb-guide-overlay[hidden] {
  display: none;
}
```

**同类坑**：空容器仍占位。`#category-summary-badge` 无内容时渲染成一个空胶囊
（截图里那个「▬」）。修法是 `:empty { display: none }`。

**控件消费点守卫为何没拦住**：该守卫只强制「声明存在」，**不能验证声明为真**
（守卫脚本自己的注释已写明）。`btn-wizard-reopen` 的声明在语法上成立，
所以守卫放行了一个从不触发的控件。

---

## 3. 配色纪律：只用 `--SmartTheme*`

**契约**：`style.css` 里除 `var(--SmartTheme*, 回退值)` 外，**不得出现颜色字面量**
（无宿主时的中性回退值除外，且只能出现在变量定义块）。

**2026-10-14 清理**：原变量块自建了一整套色板，全是硬编码字面量——
四个平台品牌色（`--accent-st/luker/tt/pt`）、六个动作色（`--st-action-*`）、
三个状态色（`--warning/danger/success`）——而同一段第 11 行自己写着「严禁在此硬编码覆盖」。
现全部改为**映射到宿主已有令牌**：

| 类别 | 映射到 |
| --- | --- |
| 强调 / 平台标识 / 动作色 / 警告 | `--SmartThemeQuoteColor`（宿主引用色） |
| 正文 / 危险 / 动作丢弃与过滤 | `--SmartThemeBodyColorInverted`、`--SmartThemeEmColor` |
| 成功 | `--SmartThemeUnderlineColor` |
| 阴影 | `--SmartThemeShadowColor` |

**四宿主主题变量实测**（`Instance/Dev/{SillyTavern,Luker,TauriTavern,PureTavern}`）：
共享 17 个 `--SmartTheme*`；PureTavern 另有 `--SmartThemeMainColor` 与
`--SmartThemeCheckboxBgColorA`。**四宿主都没有语义色变量**（无 danger / success / warning）
——所以不可逆动作**不靠颜色区分，靠二次确认**（用户裁定 D-01）。

---

## 4. 文案纪律

**契约**：界面上**禁止任何说明性文案**——不许括号补充、不许分号长句、不许教学 tooltip、
不许空态解释段。允许保留的只有：状态与错误反馈、placeholder、图标悬停名、状态读数摘要。

**判定**：`title=` 属性的值**不得超过 8 个字符**（只能是「暂停」「关闭工作台」这类悬停名）。

**曾经的违反**：`git-mode` 三个 radio 各挂 30–60 字 `title=` 长句说明——
而模板文件头第 13 行自己就写着「不出现解释性静态文案」。规则早已存在却被违反。

**术语**：禁止「瘦身 / 剔除」这类黑话。Git 历史三档现文案为
「保留历史 / 只留更新所需 / 不含历史」。

---

## 5. 控件纪律

**契约**：

1. 所有多选一**一律用枚举**（带 id 的下拉），不用并排 radio。三组已改：
   `extension-mode-select` / `git-mode-select` / `restore-mode-select`。
2. 设置项**一律单列**，禁止并排。
3. 折叠区在区块内**紧凑成组**：去掉各自外边距与圆角，相邻项只留一条分隔线。
4. 新增控件必须在 `scripts/control-consumer-guard.js` 的 `CONTROL_CONSUMERS` 里
   写下「谁读它的值」；同时把 id 加进 `scripts/single-template-source.js` 的
   `REQUIRED_TEMPLATE_IDS`（若该节点由模板产出且被静态引用）。

**守卫的实现陷阱**：两个守卫都按**文件源码正则**提取控件，所以
**注释里不得出现控件标签字面量**——否则会被当成无 id 的控件误报（2026-10-14 实际踩到）。
同理，按源码正则做的「文案纪律」断言会把注释一并算进来，
**要断言渲染结果就调用 `getWorkbenchHtml()`，不要读文件源码**。

---

## 6. 宿主动态识别

**契约**：宿主标识必须**动态求得**，认不出时兜底 `unknown`；新增宿主**不改判定逻辑**。

**四宿主实测判据**：

| 宿主 | 前端全局 | `/version` 的 `agent` |
| --- | --- | --- |
| Luker | `globalThis.lukerContext` | `Luker:2.7.0:…`（含 `stCompatVersion`） |
| TauriTavern | `window.__TAURITAVERN__` | `…:TauriTavern` |
| PureTavern | `globalThis.__PURE_TAVERN__` | `…:PureTavern` |
| SillyTavern | `globalThis.SillyTavern` / `#extensionsMenu` | 只有 `version`，无 `agent` |

**已知缺口**：`src/ui/host-bridge.js` 的 `detectHost()` 目前只返回
`st|luker|standalone`，**区分不出 TauriTavern 与 PureTavern**。
它还有 `hostLayoutCode()` 归一（`luker → l`）与 `verifyHostPlatform()` 服务端二次校验。
判定顺序不可颠倒：**Luker 前端同时暴露两个全局**，故必须先判 `lukerContext`。

---

## 7. 局域网互传

**契约**：纯前端直连走 **WebRTC DataChannel**；会话模型＝**一次性取件码**；
安全上下文不可用时**如实降级**，不假装能连。

**为什么不能照搬参考实现**：Luker 是 Node 服务端、TauriTavern 是 Rust 侧，
两者都是「本机起 HTTP/HTTPS 服务、对端连过来」。本插件纯前端，
**浏览器不能监听端口**，故必须换成 WebRTC。

**已实测的技术前提**（Playwright，2026-10-14）：

- `file://` 与 `http://localhost` **都是安全上下文**；`RTCPeerConnection` /
  `crypto.subtle` / `navigator.clipboard` 均可用。
- 无 STUN 时 offer/answer 各带 2 个 **mDNS（`.local`）ICE 候选**，
  DataChannel 两端 `connected`，32 KB 消息完整送达。
- **单条消息有上限**，大包必须分块（本实现 64 KB/块）。
- 端到端实测：两浏览器上下文传 300 KB，接收端 **SHA-256 与源端完全相同**。

**必须如实告知的限制**：无服务器时信令是**两跳手工交换**
（发送端出取件码 → 接收端回应答码 → 发送端粘贴）。装 Authority 才能并成一跳。
**不得把它描述成一步。**

**降级判据**：`probeDirectCapability()`——非安全上下文（`http://<局域网IP>`）
或浏览器无 `RTCPeerConnection` 时返回不可直连并给出可读原因。

**借鉴来源**：Luker 的一次性配对链接 / 按条目核对 / 分场景报错；
TauriTavern 的阶段+进度事件 / 原子落盘 / 自然续传 / 地址发现。

### 7.1 当前实现（2026-10-27）

| 能力 | 实现 | 证据 |
| --- | --- | --- |
| 信令负载 v2 | `buildSignalPayload` / `readSignalPayload`，含 `file.id`（`name:size:lastModified` 的 FNV-1a）与 `resumeFrom`；v1 旧码仍可读 | `test/lan-transfer.test.js` |
| 分块 | 64 KB/块；发送端 `bufferedAmount` 高低水位 + 250ms 兜底 | 同上 |
| 摘要核对 | SHA-256 + 字节数；**两端都有摘要才比摘要**，缺任一端退回字节数并在界面标注「仅核对大小」 | 同上 + E2E L12 |
| 续传 | 接收端保留 `.part`，应答码携带已有字节数；失败重试生成新码 | 设计见 `design.md` |
| 一次性 | 成功后先清空取件码/应答码并断链，再入库；旧码重复使用被明确拒绝 | E2E L14–L16 |
| 降级 | 非安全上下文 `probeDirectCapability()` 返回不可直连，按钮禁用并给出「导出文件手动传入」 | 单测 + 探针 |
| 信令中继 | **未实现**（没有可依赖的中继端点契约）；界面如实写「两跳」 | PRD R-06 收口 |

**接收端落盘的硬规则（2026-10-27 实测事故）**：数据帧可能**先于 OPFS sink 打开**到达。
旧实现直接丢弃这些块，产物字节数不足、摘要核对失败——表现像「传输坏了」，根因却被掩盖。
现在 `meta` 帧建立 `sinkReady` promise，写链**等待 sink 就绪**，**绝不丢块**；
`failRecv` 只认第一次失败（sink 打开失败 / 写链异常 / 通道关闭会竞争触发）。

**自动化证据**：`npm run e2e:web -- --only lan-transfer --rebuild`
两个**独立上下文**（各自 IndexedDB，避免假阳性）真实互传 3 MB + 64 KB 合法 zip
（跨越 64 KB 分块边界），**24/24 通过**：多包勾选 → 取件码/应答码生成 → 二维码渲染 →
两包排队传输 → 摘要一致 → 接收端两包均标「远程导入」→ 一次性失效 → 坏码拒绝。

---

### 7.2 交互模型二次重做（2026-10-27 · 正式接线已完成）

用户四轮评审定稿，**推翻**「独立浮层 + 发送/接收两个绝对页签」：

| 项 | 定稿 |
| --- | --- |
| 承载面 | **执行卡内可折叠区块**（`#lan-block`），不做独立弹窗；不设绝对页签 |
| 一屏 | 发送在上、接收在下；移动端接收在上（CSS `order:-1`） |
| 发送源 | **只发导入区当前勾选的包**；多选时逐个排队 |
| 接收落地 | **直接进唯一的导入区**，自动选中；不弹确认 |
| 来源徽标 | **不新造**「来自设备」；沿用文件名下 `.pkg-meta` 的徽标：`本地导入` / `远程导入` |
| 宿主 | 接收后仍**扫包**判定 layout；图标角标显示 ST/L/TT/PT |
| 二维码 | 文本码 + QR 同显；`getUserMedia({facingMode:'environment'})` + jsQR 解码；权限失败提示且粘贴始终可用 |
| 扫码后 | 取件码自动 accept、应答码自动 apply（扫码即继续） |
| 失败 | 新取件码 + 按 `fileId` 续传；显示已收比例 |
| 同名 | 远程接收自动加序号，不覆盖 |

**二维码来源**：`qrcode-generator` 2.0.4（MIT，编码）+ `jsQR` 1.4.0（Apache-2.0，解码），
本地 vendor 到 `src/vendor/`；根许可证 **AGPL-3.0**。`src/ui/qr.js` 以 classic `<script>`
注入本地文件（qrcode-generator 的顶层 `var qrcode` 在 ESM 里不会挂 window），
`ready()` 失败时二维码隐藏、文本码与粘贴始终可用。

**当前状态（2026-10-27 接线后）**：`index.js` 已传入 `qr` 与 `actions.lan`；
`lan-transfer-panel.js` 已去浮层、只读模板 id 并通过 `view.setLan()` 驱动；
`getSendTargets()` 取导入区勾选包（多包排队）；接收落库走 `ORIGINS.LAN`，
`importFiles({remote:true})` 自动加序号并扫包。旧 `.wb-lan-*` 浮层样式已删除。
剩余：四宿主/六对复跑、PT 快照重装、真机双设备 AC-10（见 HANDOFF）。

**布局约束**：局域网展开时包区让出高度（`.col-side.lan-open > .zone-card{flex:0 0 28%}`），
执行卡内部滚动；旧的 `inset:0` 全屏浮层在 TT 会塌陷（TT 的 `<html>` 有 transform 且高 0），
全屏浮层一律 `100vw × 100vh`。

> ⚠ **2026-11-05 起 §7.2 的「承载面 = 执行卡内可折叠区块」被 §7.3 取代**；其余条目
> （发送源、接收落地、来源徽标、扫码、失败续传等）继续有效。

---

### 7.3 局域网改为整面板替换（2026-11-05 用户裁定）

**契约**：局域网互传不再是执行卡内的折叠块，而是**左侧图表面板的完整替换**：

- 三个顶层面板 DOM：`#chart-card`（左侧图表）、`#zone-card`（数据包列表）、`#action-card`（执行卡）。
- 图表面板头（`#chart-card .panel-actions`）放一个「局域网互传」按钮 `#lan-open-btn`。
- 点击后：`#chart-card` 整体 `hidden`，**同级**的 `#lan-view` 面板显示——替换的是**整个面板**
  （含面板头与边框），不是只换里面的 `#chart-stack` 图表。
- `#lan-view` 自己的面板头有标题与关闭按钮 `#lan-close-btn`，点击回到 `#chart-card`。
- 移动端布局顺序由 DOM 决定：`.col-chart` 在最前 ⇒ 局域网面板自然出现在**最上方**，
  下面依次是 `#zone-card`（数据包列表）、`#action-card`。不得用 CSS `order` 反序。

**DOM 落点**（`src/ui/workbench-template.js`，唯一模板源）：

```
.col-chart
  section.panel.chart-card#chart-card        ← 原有，面板头新增 #lan-open-btn
  section.panel.lan-view#lan-view [hidden]   ← 新增，承载原 #lan-block 的全部内容
```

原 `#lan-block` 内的扫描 / 发送 / 接收结构**原样迁移**进 `#lan-view .lan-body`，
不再保留 `.lan-block` 外框、`#lan-toggle`、`#lan-toggle-hint`。

**状态与渲染**（`src/ui/workbench-view.js`）：

- `state.lan.open` 仍是唯一开关，语义改为「局域网面板是否占据图表面板位置」。
- `renderLan()` 只翻 `#chart-card` / `#lan-view` 的 `hidden`，**删除**
  `.col-side.classList.toggle('lan-open')` 与 `#lan-toggle-hint` 的读写。
- 点击 `#lan-open-btn` / `#lan-close-btn` 只改 `state.lan.open` 并重渲染，不直接操作 DOM。

**CSS**（`style.css`，双前缀铁律不变）：

- 删除 `.col-side.lan-open > .zone-card` 与 `.lan-toggle*` 规则。
- `#lan-view` 与 `#chart-card` 同为 `.col-chart` 的直接子面板：`flex:1 1 auto; min-height:0`，
  内部 `.lan-body` 是唯一滚动容器（R1 无外层滚动条）。
- 默认隐藏的 `#lan-view` 若被写了 `display`，必须补一条特异度不低于它的
  `#app.app-container #lan-view[hidden]{display:none}`（见本页 §2）。

**守卫与登记**：

- `scripts/single-template-source.js` 的 `REQUIRED_TEMPLATE_IDS`：新增 `chart-card`、
  `lan-open-btn`、`lan-view`、`lan-close-btn`；移除 `lan-toggle`、`lan-toggle-hint`。
- `scripts/control-consumer-guard.js` 的 `CONTROL_CONSUMERS`：为 `lan-open-btn` /
  `lan-close-btn` 各写真实消费点（读 `state.lan.open`）。
- 按钮文案「局域网互传」已在 `ui-orchestration-rules.md` §2 的动词封闭集内，不得换词。

**验收**：

1. 点「局域网互传」后，左侧整块图表（含面板头、配额条、图例、图表）消失，局域网面板占满该列。
2. 右侧数据包列表与执行卡位置不变。
3. 320px 视口下，局域网面板在数据包列表之上。
4. `#chart-card[hidden]` 与 `#lan-view[hidden]` 的计算样式均为 `display:none`。
5. `npm test` + 五个 UI 守卫全绿。

---

## 9. 正式 UI 即预览（2026-11-05 用户裁定，demo 页整体作废）

**规则（唯一入口）**：开发期预览**只走** `npm run dev` → `http://127.0.0.1:3040/`
（正式 `index.html` 的独立 Web 形态，与插件态共用同一套模板与视图）。

- **不存在**任何独立 demo / 预览页。`src/ui/ui-demo.html` 已删除，
  `test/ui-demo-isolation.test.js` 一并删除。
- 正式三件套（`style.css`、`src/ui/workbench-template.js`、`src/ui/workbench-view.js`）
  是唯一 UI 源，改完刷新即生效（Vite HMR）。
- 正式代码、构建、测试、CI 中**不得**再出现 `ui-demo` 路径或演示外壳。

**为什么**：demo 页需要维护第二套演示数据与外壳，与正式 UI 反复漂移——
2026-10-26 就出现过「demo 有、生产无」的虚拟节点（完整扩展包 / 保留 Git 历史 / 保留构建配置）。
dev server 已能直接跑正式 UI，demo 只剩维护成本与误导风险。

**数据必须真实**：预览用真实数据——导入真实 zip 或从宿主拉取；不得在正式代码里注入演示数据。
独立 Web 无数据源时显示空态引导，这是正确行为，不是缺陷。

**形态由真实视口决定**：`data-view` 由 `matchMedia` 计算，不提供演示用的桌面/移动切换按钮。

**验证方式**：内置浏览器打开 `http://127.0.0.1:3040/`，用 DOM 计算值（宽高、`grid-template-columns`、
`overflow`、`getBoundingClientRect`）与截图取证；不再要求「先 demo 生效」。

> 历史 `.trellis/research/**` 里关于 demo 的说明是**存档**，不再作为当前流程依据。

**正式数据必须真实**：浏览器配额来自 `navigator.storage.estimate()`，不可用时显示「未提供」；
宿主配额经宿主官方 Storage Inspector 模块（`/scripts/storage-inspector.js` 的 `RestProvider`）
读取，读不到时显示「未提供」，**禁止**用演示数字冒充真实读数。

**改动流程**：改正式三件套 → `npm test` + 守卫 → 内置浏览器在 3040 上取证。

---

## 8. 本轮验证读数（2026-10-14）

- `npm test`：**817 passed / 2 skipped / 0 failed**（80 文件通过 / 1 skipped）。
  改前的本轮基线是 783 passed / 11 failed（4 个文件锁的是旧设计契约，已按新契约重写）。
- 五个 UI 守卫全绿：`check:css-scope`、`check:dom-injection`、`check:template-source`、
  `check:dom-scope`、`check:control-consumer`。
- `npm run e2e:web -- --rebuild` 通过。
- `impeccable detect` 对模板与两个新模块：**零命中**。

---

## 9. 零浮层：设置 / 日志 / 帮助 / 确认一律面板内视图（2026-11-02）

**契约**：工作台内**不得**出现 `position:fixed` 的业务浮层。设置、日志、帮助、确认
（流量 / 删除 / 恢复 / 合并冲突 / 私有件 / 清空队列）全部是 `.app-body` 内的
`.view-card`，同一时刻只显示一个；顶栏按钮进入，视图内关闭按钮或 Esc 返回工作台。

**为什么**：2026-11-02 在 Luker 实测——`#modal-overlay` / `#log-overlay` 这类嵌套在面板里的
`position:fixed` 浮层定位失效：设置与流量确认只剩暗色遮罩、内容不可见（用户表现为
「两个从宿主拉取按钮点了没反应」），日志浮层跑到左上角。宿主 `html` 带
`-webkit-transform: translateZ(0)`（Luker `public/style.css:143`）会改变固定定位的
包含块；TauriTavern 已在 journal Session 55 记录同类塌陷。根因不修浮层，直接取消浮层。

**结构**：

```
#app.app-container
  header.app-header   （btn-guide / btn-log / btn-settings / btn-close）
  div.app-body
    main.app-main#view-workbench
    section.view-card#view-settings / #view-log / #view-help / #view-confirm （hidden）
  div.toast（absolute，面板内裁剪）
  div.tutorial-overlay（保留：全屏引导，用户 2026-11-02 裁定）
```

**API**：`workbench-view.js` 的 `showPane(name)` / `backToWorkbench()`；
`openModal(title, desc, extraHtml, actions)` 签名不变，内部改为渲染 `#view-confirm`；
`openSettingsView(html, { onSave })` 渲染 `#view-settings`。

**守卫**：
- `check:template-source` 的业务节点清单必须包含 `view-*` 与 `settings-*`，且**不得**再包含
  `modal-overlay` / `log-overlay` / `help-popover` / `fullname-pop`。
- `check:control-consumer` 必须为 `settings-save` / `settings-cancel` / `settings-close` /
  `help-close` / `modal-close` 各写一条真实消费点。
- 浏览器实测：三个视图的 `getComputedStyle(el).position === 'static'`，且 DOM 中不存在旧浮层节点。

**例外**：教程全屏引导、`#st-converter-modal-overlay`（插件外壳）仍是固定定位；
新增**任何**业务浮层前必须先过用户裁定。

---

## 11. 执行卡取消 · 进度条置底 · 图表网格（2026-11-05 用户裁定）

**契约**：工作台不再有独立的「执行卡」面板。动作按钮并入数据包列表底部，
进度条成为贯穿所有视图的常驻底栏，图表卡改为自适应网格。

**为什么**：独立执行卡把可用的纵向空间切成三块，图表被压成一条；
进度条藏在执行卡里，手机上滚动后就看不见，且必须先点顶栏日志按钮才能看日志。

### 11.1 顶层面板只剩两个 + 常驻底栏

```
.app-body
  .app-main#view-workbench
    .col-chart        ← #chart-card / #lan-view（图表区）
    .splitter-v
    .col-side
      #zone-card      ← 数据包列表；底部新增 #action-row
  section.view-card#view-settings / #view-log / #view-help  (hidden)
  footer#workbench-progress   ← 常驻底栏，任何 view-card 下都可见
```

- **删除** `#action-card`（含其面板头与 `data-help="action"`）。
- `#action-row` 移入 `#zone-card` 底部，作为 `.zone-foot`；`renderActions()` 消费点不变。
- **删除** 顶栏 `#btn-log`；`#log-dot` 迁入底栏。
- `#workbench-progress` 是 `.app-body` 的**最后一个 flex 子项**（`flex:0 0 auto`），
  `.app-main` 负责内部滚动 ⇒ 手机端滚动内容时底栏**不离开视口底部**。

### 11.2 进度条即日志入口

- 点击底栏任意位置（或聚焦后按 Enter/Space）→ `renderLog()` + `showPane('log')`。
- 底栏内常驻一行提示文案 `progress.openLog`（「点此查看日志」），**这是唯一允许的
  可操作提示**，不受 §4「零说明性文案」约束（用户 2026-11-05 明确要求显式提示）。
- 日志视图不再自带进度条——底栏在 `#view-log` 下同样可见，读数天然同源。
- `#log-dot`（警告/错误计数点）挂在底栏提示旁，不再挂顶栏。

### 11.3 图表网格

- `.chart-stack` 是**网格容器**（`container-type:inline-size`），`.chart-group` 与
  `.vol-grid` 用 `display:contents` 让 `.vol-card` 直接成为网格项。
- 列数由**容器宽度**决定，硬上限 4：
  | 容器宽 | 列数 |
  | --- | --- |
  | ≥ 1060px | 4 |
  | ≥ 800px | 3 |
  | ≥ 520px | 2 |
  | < 520px | 1 |
- `gap:1px` + 卡片自身 1px 边框 ⇒ 相邻图表边**相互贴着**，不出现空白带。
- `.vol-card` 可拖拽改尺寸：`resize:both`，尺寸按 `data-volkey` 落 `localStorage`，
  刷新后保持；未拖拽时由网格决定。
- 每个 `.vol-card` 面板头有格式下拉 `[data-chartfmt]`（`bar` / `donut`），
  切换后只重绘该卡的 `[data-volchart]` 区域，不重建整棵树。
- 每张卡的 `.vol-body` 顶部渲染 `[data-volchart]` 可视化：
  - `bar`：每个一级类目一行，标签 + 横向占用条 + 读数；
  - `donut`：同一份数据的 SVG 圆环（≤ 6 段，余量并入「其他」）。
  数据与树**同源**（同一 `nodes` / `mb`），勾选或换包后即时更新。
- 树行尾部追加占用条 `.tree-occ`，宽度 = 该行 `mb` / 本卡总 `mb`。

### 11.4 守卫与登记

- `scripts/single-template-source.js`：移除 `action-card`、`btn-log`；
  新增 `workbench-progress`、`vol-chart`（若为模板节点）。`action-row`、`progress-fill`、
  `progress-label`、`progress-pct`、`log-dot` 保留。
- `scripts/control-consumer-guard.js`：移除 `btn-log`；为 `workbench-progress` 写真实消费点
  （点开日志视图）。
- `test/ui-verb-table.test.js` 的按钮封闭集不变（本次不新增按钮文案）。

### 11.5 验收

1. DOM 中不存在 `#action-card`；`#action-row` 在 `#zone-card` 内。
2. 任一视图下 `#workbench-progress` 的 `getBoundingClientRect().bottom` 等于 `.app-body` 底边。
3. 320px 视口滚动工作台，底栏仍在视口底部。
4. 点底栏进入 `#view-log`；日志视图底部可见同一条底栏，读数与工作台一致。
5. 顶栏无日志按钮。
6. 图表按容器宽度分 1/2/3/4 列，相邻卡片间距 1px；宽屏最多 4 列。

---

## 12. 滚动、配额折叠与目标平台默认（2026-11-05 用户裁定）

**为什么**：2026-11-05 实测——竖屏下 `.chart-stack` 与 `.zone-body` 各自滚动，
图表只能看到一半，数据包列表被压成只剩标题；配额行、宿主配额、宿主数据卡三处
重复表达同一份宿主信息；目标平台默认写死 `SillyTavern`，与宿主平台无关。

### 12.1 滚动绝对保守：竖屏只有一个滚动条

- **桌面**：`.app-main` 不滚动（`overflow:hidden`）。滚动只发生在内容列自己的容器内
  （`.chart-stack` / `.zone-body`），且 `overflow-y:auto` —— **不溢出就不出现滚动条**。
  滚动条一律细化（`scrollbar-width:thin`），不得出现系统粗滚动条。
- **竖屏**（`[data-view="mobile"]` 与 `@media (max-width:860px)`）：
  **唯一滚动容器是 `.app-main`**。`.chart-stack`、`.zone-body`、`.chart-card`、`.zone-card`
  一律 `overflow:visible`、`max-height:none`、`flex:0 0 auto`，保证一次滚到底
  看完全部图表与整张数据包列表。
- **判据**（320px 视口）：
  1. 全页 `scrollHeight > clientHeight + 1` 且 `overflow-y` 为 `auto|scroll` 的元素**恰好 1 个**（`.app-main`）。
  2. 滚动到底部时，最后一个图表卡与数据包列表尾部都可见。
  3. 底栏 `#workbench-progress` 全程贴视口底（见 §11.2）。

### 12.2 配额两行常驻 · 宿主详细数据默认收起

- `#quota-head` **直接**渲染「浏览器配额」「宿主配额」两行常驻内容。
  **不得**把这两行放进折叠按钮、详情容器或任何「点开才看」的结构（2026-11-05 用户裁定：
  「浏览器配额等禁止有这个折叠的东西，必须直接放置，必须用之前的」）。
- **宿主详细数据**（宿主目录清单）与上述两行**同一个** `#quota-head` 块内，紧跟其后；
  默认收起（`#quota-host-detail[hidden]`），点击 `#quota-host-toggle` 在**同一 DOM 内**展开，
  再次点击收起。展开态只渲染只读行（路径 + 体积），不参与勾选与统计。
- **全页唯一**：宿主信息只出现在这一处。图表栈不再有「宿主数据」卡（`chartTargets()` 无勾选包时返回空）。
- 读不到显示「未提供 / 宿主未提供存储读数」，**禁止假 0**。

### 12.4 动作按钮在数据包列表上方

- `#action-row` 位于 `#zone-card` 内、`#zone-tabs` **之上**，容器类 `.zone-actions`。
- 数据包面板下方**不再有任何动作区**；腾出的高度全部归图表区。
- 按钮集合不变：从宿主拉取 / 生成导出包 / 合并上传（导出区为下载 / 恢复 / 复制回）。

### 12.5 无数据包时两张引导卡并排居中

- `.chart-empty-guide` 固定两列：`grid-template-columns:repeat(2,minmax(0,1fr))`，
  `max-width:680px`、`justify-self:center`；`.chart-stack:has(> .chart-empty-guide)`
  垂直居中（`align-content:center`）。
- 竖屏（375×812）同样两列并排，并压紧：图标 28px、描述两行截断、按钮 26px 高、
  卡片 padding ≤ 9px。两张卡不得纵向堆叠占满屏幕。

### 12.3 目标平台默认值跟随宿主

- 设置新增 `defaultTarget`：`auto | st | luker | tt | pt`，默认 `auto`。
- `auto` ⇒ 目标平台等于宿主平台（宿主 → 目标映射：`st→SillyTavern`、
  `luker→Luker`、`tt→TauriTavern`、`pt→PureTavern`；`standalone` 回退 `SillyTavern`）。
- 用户在目标平台下拉里手动选过之后，本次会话以手动值为准；设置保存默认值后重新应用。
- 目标平台按钮在「选中平台 == 宿主平台」时显示宿主标记 `.host-tag`
  （与下拉项同一文案 `target.hostSuffix`）。
- 判据：宿主 Luker 下首次启动，按钮文本为 `Luker` 且带宿主标记；
  设置里把默认改为 `PureTavern` 后重新进入，按钮为 `PureTavern` 且无宿主标记。

---

## 10. 数据包选择语义（2026-11-05 用户裁定）

**契约**：勾选集合 `state.selectedPkgs` **只能**由以下操作改变：

- 数据包行内复选框（`[data-pkgcheck]`）；
- 批量「全选 / 全不选 / 反选」。

**禁止**：点击卡片主体、文件名、图标、空白处时清空勾选。点击卡片主体只允许切换
`state.source`（当前查看的包）并重绘图表，**不得**触碰 `selectedPkgs`。

**原因**：2026-11-05 实测，点数据包非复选框部分会把批量选择全部清空，用户无法连续多选。

**判据**：选中 2 个包后，依次点另一个包的行文本 / 图标 / 空白处，`state.selectedPkgs.size` 保持 2。

