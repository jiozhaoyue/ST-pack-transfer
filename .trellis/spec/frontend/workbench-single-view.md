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
本轮**未做**逐条哈希核对（`verifyTransfer` 只比条目数与字节数）——不谎称做了。

---

## 8. 本轮验证读数（2026-10-14）

- `npm test`：**817 passed / 2 skipped / 0 failed**（80 文件通过 / 1 skipped）。
  改前的本轮基线是 783 passed / 11 failed（4 个文件锁的是旧设计契约，已按新契约重写）。
- 五个 UI 守卫全绿：`check:css-scope`、`check:dom-injection`、`check:template-source`、
  `check:dom-scope`、`check:control-consumer`。
- `npm run e2e:web -- --rebuild` 通过。
- `impeccable detect` 对模板与两个新模块：**零命中**。
