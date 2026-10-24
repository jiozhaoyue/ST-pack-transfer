# 工作台三层架构与 CSS 铁律

> 2026-10-24 新建，来源：任务 `10-15-workbench-dual-flow-redesign` 定稿设计（design.md 全文见任务归档，
> 本页为**自包含**沉淀，不引用任务目录）。适用：`src/ui/workbench-layout.js`、`workbench-shell.js`、
> `workbench-template.js`、`style.css`、以及任何新增工作台模块。
> 按主题独立成页：`component-guidelines.md` 已超 32 KB 注入上限，禁止追加。

---

## 1. 三层分层契约

```
层 1  MODULES   纯渲染函数 state → DOM         ← 唯一实现，桌面/移动 × 独立/插件共用
层 2  FLOWS     模块清单（顺序 + 参与集合）    ← 声明，无实现（`workbench-layout.js`）
层 3  SHELLS    摆法（grid / stack）           ← 声明，无实现（`workbench-shell.js`）
```

模块层**禁止**：读 `state.flow`（方向判断属流程层）、写 media query（布局属外壳层）、
直接操作其他模块的 DOM（跨模块通信走 state）、持有跨渲染的可变状态（状态一律进 state）。

两个流程（导出/导入）的**唯一差异**是选项槽填哪个模块；新增流程＝流程表加一行。

## 2. 阶段门控与 `hidden` 语义

- 阶段集合：`idle / scanned / running / awaiting / done`。`awaiting`（执行中停下等用户拍板，
  如宿主文件树确认）**优先级高于** `running`；`log` 是常驻模块，不参与门控（出错时唯一可见反馈）。
- **切屏/门控一律翻 `hidden` 属性，不移出 DOM**：全仓十余处动态 `getElementById`
  （`#category-panel`、`#host-tree-confirm-bar`、`#stash-list`…）依赖元素在 DOM 里；
  摘出 DOM 会让它们拿到 `null` 而**静默空转**，宿主拉取路径直接死锁。
- `[hidden]` 的特异度陷阱见 `workbench-single-view.md` §2——给容器写了 `display` 就必须补
  特异度不低于它的 `[hidden]` 覆盖规则；本仓有全局兜底
  `#app.app-container [hidden] { display: none }`，但**不能依赖源码顺序取胜**。

## 3. 三条 CSS 铁律（可程序化断言）

| 铁律 | 规则 | 断言 |
| --- | --- | --- |
| **R1 无外层滚动条** | 工作台根容器不得声明 `overflow-y: auto\|scroll`；模块内滚动须自带 `max-height` 且是唯一滚动容器 | `s1-remedies.e2e.cjs` B2/B3：根容器计算样式 `visible` 且 idle 态 `scrollHeight <= clientHeight + 1` |
| **R2 浮层必锚行** | 任何 `position:absolute` 浮层的宿主行必须 `position:relative`；浮层须做视口边界翻转。通用实现 `attachRowMenu(rowEl, items)`，禁止各调用点自行 absolute | `s1-remedies.e2e.cjs` E3：`rect(menu) ∩ rect(#dropzone) === ∅` |
| **R3 单行文字不折** | 按钮/徽标/标签须 `white-space:nowrap` + `flex-shrink:0` | `s1-remedies.e2e.cjs` D2/D3：320px 视口下 `white-space === 'nowrap'` 且单行高度 |

## 4. 挂 body 的自绘浮层与 CSS 作用域

挂到 `document.body` 的全屏/浮层组件（如 `#wb-detail-overlay` 明细面板）**脱离了**
`.app-container` / `.st-converter-drawer-app` 双前缀容器 ⇒ 双前缀选择器命中不了它。
约定：此类浮层**只能用它自己的 id 作作用域根**（`#wb-detail-overlay …`），
并登记进 `check:css-scope` 白名单（`scripts/css-scope-guard` 的 allowlist）——
新增 body 级浮层不改这两步就是守卫红灯。

## 5. 单测夹具必须与模板同构（真实事故）

`test/workbench-shell.test.js` 曾把方向开关放在 `#wb-shell` **内部**，而模板写在**外面**（兄弟节点）
⇒ 外壳按 id 找按钮拿到 `null` ⇒ `syncFlowTabs` **静默空转**，方向切换整体失效且零报错；
单测全绿、真页面 4/20 红。**抓到它的是真浏览器 E2E，不是单测。**

约定：
- 夹具 DOM 结构必须与 `workbench-template.js` 同构（位置关系也要一致）；
- 凡「按 id/选择器查找」的契约，**必须**补一条**按模板源码**的顺序/存在断言
  （先例：`test/workbench-layout.test.js` 断言 `#wb-flow-switch` 夹在 `#wb-shell` 与 `#wb-col-left` 之间）。

## 6. 模板字符串的语法陷阱

`workbench-template.js` 返回 JS 模板字符串——**注释里不得出现反引号与 `${`**
（会终止模板/触发插值，`vite build` 直接报语法错）。往该文件写任何注释前先自查这两个字符。

## 7. 首装引导会拦截点击（E2E 必读）

全新浏览器上下文无引导完成标记 ⇒ 首装引导自动打开且铺满视口（`aria-modal`），
拦下后续**所有**点击。任何 E2E 在就绪判定后必须先退出引导
（点 `.wb-guide-actions button:has-text("退出")` 再等 overlay 消失），否则后续步骤随机挂。
