# 技术设计：工作台双方向重设计

> 配套 `prd.md`（需求与验收）。本文件承载**技术设计**：分层契约、状态形状、伪代码、布局、
> 三条 CSS 铁律、取舍与回滚。所有 `file:line` 均为 2026-10-15 现场取证读数。

---

## 1. 问题诊断（现场取证）

### 1.1 「全部待扫描」——状态机漏接线，非显示缺陷

`src/ui/category-filter.js:41` 声明 `let isUnscanned = false;`，注释（`:37-40`）写明
「此标记随扫描结果到来而关闭」。实际写入点只有两处：

| 位置 | 行为 |
| --- | --- |
| `category-filter.js:110` `renderCategoryStats({categories}, { unscanned: true })` | 置 `true` |
| `category-filter.js:127` `if (typeof opts.unscanned === 'boolean') isUnscanned = opts.unscanned;` | **仅在显式传参时**改 |

真实扫描的两个调用点：

- `index.js:1390` `renderCategoryStats(plan);` —— 无 opts
- `index.js:1793` `renderCategoryStats(hostPlan);` —— 无 opts

⇒ 标志置 `true` 后**永无翻转路径**。徽标（`:281`）恒走 `'待扫描'` 分支。

**连带缺陷**：`:192` `const isAvailable = isUnscanned || (data.count || 0) > 0;`
在 `isUnscanned === true` 时恒真 ⇒ 源包中不存在的类目也被 `availableCategories.add(key)`
并默认 `currentSelection[key] = true`（`:195-197`）⇒ 假勾选经 `notifySelectionChanged()`
一路传入 `convert()`。

**修法（最小）**：两处调用改 `renderCategoryStats(plan, { unscanned: false })`。
修完后 `isAvailable` 恢复为「以计划读数为准」，假勾选自动消失。

### 1.2 「明细」竖排

`style.css:1235-1243` 的 `.btn-expand-detail` 无 `white-space` 声明；右组
`style.css:1229-1233` 的 `.category-right-group` 是 `display:flex` 且无 `min-width` / `flex-shrink` 保护
⇒ 列宽不足时按钮被压到最小内容宽度，中文逐字折行成「明\n细」。

### 1.3 行菜单覆盖上传区

`style.css:2644-2658` 的 `.stash-row-menu` 是 `position:absolute` + `top:calc(100% + 4px)`，
但**全仓 grep `stash-row` 只命中这一条**——没有任何 `position:relative` 的行容器
⇒ 包含块落到最近的定位祖先（或初始包含块），`top:100%` 相对的是**那个祖先**，
菜单因此飘到 `#dropzone` 之上。

### 1.4 外层滚动条

`style.css` 中 `overflow-y:auto` 出现在 `:816 :1028 :1304 :1648 :1924` 等多处，
叠加 8 个区块常驻 ⇒ 容器高度必然溢出。

---

## 2. 分层契约（本设计的核心）

三层各司其职，**模块层是唯一有实现的一层**：

```
层 1  MODULES   纯渲染函数 state → DOM         ← 唯一实现，四形态 × 双端共用
层 2  FLOWS     模块清单（顺序 + 参与集合）    ← 声明，无实现
层 3  SHELLS    摆法（grid / stack）           ← 声明，无实现
```

### 2.1 层 1：模块契约

```js
// 每个模块：纯渲染函数。禁止事项——
//   ✗ 读 state.flow（方向判断属流程层）
//   ✗ 写 media query（布局属外壳层）
//   ✗ 直接操作其他模块的 DOM（跨模块通信走 state + 事件总线）
//   ✗ 持有跨渲染的可变状态（状态一律进 state，模块自身无闭包状态）
const MODULES = {
  QuotaBoard:   (s) => renderQuota({ browser: s.quota.browser, host: s.quota.host, dist: s.quota.dist }),
  SourceSlot:   (s) => renderSlot({ role: s.slotRole, origins: s.origins, pkg: s.pkg }),
  ScopeTree:    (s) => renderScope({ plan: s.plan, selection: s.selection }),
  PackOptions:  (s) => renderPack(s.pack),
  RestoreOptions:(s) => renderRestore(s.restore),
  ActionBar:    (s) => renderActions({ flow: s.flow, enabled: s.canRun, task: s.task }),
  ProductList:  (s) => renderProducts(s.products),
  ExtensionRow: (s) => renderExtRow({ enabled: s.extEnabled }),
  LogConsole:   (s) => renderLog(s.logs),
};
```

`renderQuota` 的 `host` 为 `null` 时整块加 `.is-disabled` 并写 `aria-disabled="true"`
——**置灰而非隐藏**（PRD R2.7），使独立模式与插件态共用同一份 DOM 结构。

### 2.2 层 2：流程

```js
const FLOWS = {
  out: { label: '导出', options: 'PackOptions',
         modules: ['QuotaBoard','SourceSlot','ScopeTree','PackOptions','ActionBar','ProductList','LogConsole'] },
  in:  { label: '导入', options: 'RestoreOptions',
         modules: ['QuotaBoard','SourceSlot','ScopeTree','RestoreOptions','ActionBar','ProductList','LogConsole'] },
};
```

两个流程的**唯一差异**是 `options` 槽填哪个模块。新增流程（如局域网直传）= 加一行。

### 2.3 层 3：外壳

```js
const SHELL = {
  desktop: () => grid2col({
    left:  ['QuotaBoard', 'SourceSlot', 'ProductList', 'LogConsole'],   // 数据侧
    right: ['ScopeTree', 'options', 'ActionBar'],                       // 决策侧
  }),
  mobile: () => stack1col({
    order:       'FLOWS[flow].modules',
    sticky:      ['ActionBar'],
    collapsible: ['ScopeTree', 'PackOptions', 'RestoreOptions', 'LogConsole'],
  }),
};
```

`options` 是占位符，由 `FLOWS[flow].options` 在渲染时解析——这是「同签名不同内容」
的落点，也是「打包区 vs 恢复区」不产生第二个模块的原因。

### 2.4 阶段门控

```js
function visible(stage, flow) {
  const base = ['quota', 'source'];
  const persistent = ['log'];          // 常驻：出错时唯一的可见反馈
  switch (stage) {
    case 'idle':     return [...base, FLOWS[flow].options, ...persistent];
    case 'scanned':  return [...base, 'scope', FLOWS[flow].options, 'action', ...persistent];
    case 'running':  return [...base, 'action', ...persistent];
    case 'awaiting': return [...base, 'scope', 'action', ...persistent];
    case 'done':     return [...base, 'products', 'action', ...persistent];
  }
}
```

`idle` 态即用户要求的「初始只有上传和打包区」+「上方配额与数据分布」。

**实施中修正了初稿两处**：

1. **`awaiting` 阶段是必需的，不是可选。** 初稿只有 `running`，而宿主拉取路径在
   `workbenchBusy = true` 期间要渲染统一文件树并**等用户点确认**（`index.js` 的
   `waitHostTreeConfirm`）。`running` 藏掉 `scope` ⇒ 确认条不在视野里 ⇒ `await` 永久挂起。
   故把「执行到一半停下来等用户拍板」独立成一阶段，且其**优先级高于 running**。
2. **`log` 是常驻模块，不参与阶段门控。** 它是一条折叠着的单行抽屉，几乎不占版面，
   却是扫描/转换出错时唯一的可见反馈；按阶段藏起来等于让人看不到错误。
   与「初始只有上传和打包区」不冲突——那句话针对的是**内容区块**，不是状态条。

### 2.5 隐藏方式：`hidden` 属性，不是移出 DOM

初稿写的是「切屏 = 移出 DOM（AC-2.3）」，理由是「`display:none` 的子树仍会被
`getElementById` 命中，业务代码可能误取到另一个方向的控件」。**该理由被现场证据推翻**：

- 全仓有十余处**动态** `getElementById`（`renderCategoryStats` 取 `#category-panel`、
  宿主文件树确认取 `#host-tree-confirm-bar`、暂存区渲染取 `#stash-list` …）。
  摘出 DOM 会让它们拿到 `null` 而**静默空转**；
- 宿主拉取路径更会直接死锁（见 §2.4 第 1 条）。

故改为翻 `hidden`：元素留在 DOM 里，上述查找全部照旧。
属性隐藏的**已知陷阱**是「作者样式的 `display` 压过 UA 的 `[hidden]{display:none}`」
（本仓 2026-09-25 与 2026-10-14 各踩过一次）——项目已在 `style.css:2711` 用
`#app.app-container [hidden] { display: none }`（双前缀，位置排在 `.wb-sec` 之后）统一兜住。

⇒ **PRD 的 AC-2.3 相应改写为**：切屏后非当前方向的模块带 `hidden` 属性且不可见，
**但仍在 DOM 中**（由 `test/workbench-shell.test.js` 与 E2E 双向锁）。

---

## 3. 上传槽 / 选项槽的张力（用户 2026-10-15 点名要讨论的点）

### 3.1 张力来源

- **上传槽是双向的**：导出用它取源包，导入用它取待恢复包。
- **打包槽是单向的**：只有导出有压缩/分卷/包名；导入需要的是合并/覆盖/先备份。

两者被平铺在同一层，主从关系不可见，于是「不好说」。

### 3.2 裁定方案（用户已选「单一共享槽 + 角色标签」）

```js
// 单一 SourceSlot，角色由 state.slotRole 驱动，不实例化两次
state.slotRole = 'source' | 'restore';

// 角色切换语义：
//   · pkg 保持不变 —— 同一个包可先导出再导回（这是共享槽的全部价值）
//   · origins 可用集合随角色收窄：restore 角色下无「从宿主拉取」（不能把自己写回自己）
//   · 切换方向**不触发**重新上传、不触发重新扫描
```

选项槽同理：`PackOptions` 与 `RestoreOptions` **同签名**（都吃 `state` 返回 DOM），
占位由流程层决定 ⇒ 满足 PRD R2.2「差异仅一项」。

---

## 4. 三条 CSS 铁律（PRD C1，必须可程序化断言）

| 铁律 | 规则 | 断言方式 |
| --- | --- | --- |
| **R1 无外层滚动条** | 工作台根容器不得声明 `overflow-y: auto\|scroll`。模块内部若必须滚动（13 类目长列表），须自带 `max-height` 且该模块是唯一的滚动容器 | 根容器 `scrollHeight <= clientHeight + 1`；计算样式 `overflow-y === 'visible'` |
| **R2 浮层必锚行** | 任何 `position:absolute` 浮层的宿主行必须 `position:relative`；浮层须做视口边界翻转（下方空间不足则向上展开） | 展开菜单后 `rect(menu) ∩ rect(#dropzone) === ∅` |
| **R3 单行文字不折** | 所有按钮 / 徽标 / 标签须 `white-space:nowrap` + `flex-shrink:0` | 320px 视口下控件 `offsetHeight` 为单行高度 |

R2 的通用化：把「行内菜单」抽为 `attachRowMenu(rowEl, items)`，内部负责
① 给 `rowEl` 补 `position:relative` ② 渲染后按 `getBoundingClientRect()` 决定上/下翻转。
禁止各调用点自行 `position:absolute`。

---

## 5. 布局

### 5.1 桌面（≥1024px）

```
┌──────────────────────────────────────────────────────────────────┐
│  [导出 ●] [导入 ○]                        [● 扩展] [打开] [引导]  │
├────────────────────────────────┬─────────────────────────────────┤
│  QuotaBoard                    │  ScopeTree                      │
│  浏览器 2.1G/8.0G ▓▓▓░░        │  ☑ 角色卡     1240 项  明细 ▾   │
│  宿主   1.4G/12G  ▓▓░░░        │  ☑ 聊天记录   1437 项  明细 ▾   │
│  ── 数据分布 ──                │  ☑ 世界书       62 项  明细 ▾   │
│  聊天 ████████ 62%             │                                 │
│  素材 ███ 21%                  │  PackOptions                    │
│                                │  目标平台 [PureTavern ▾]        │
│  SourceSlot                    │  压缩     [标准 ▾]              │
│  角色 [源包 ●][待恢复 ○]       │  分卷     [不分卷]              │
│  ┌ 上传 / 宿主 / 库 ┐          │  包名     {target}_{date}.zip   │
│  │ tauritavern-…zip │ 1 项 ⋯   │                                 │
│  └──────────────────┘          │  ActionBar                      │
│                                │  [ 开始转换 ]                   │
│  ProductList                   │  ▓▓▓▓▓▓░░░░ 62%  [暂停][中止]   │
│  · out_st_2026-10-15.zip ↓ ⟳ ⊗ │                                 │
│                                │                                 │
│  LogConsole                    │                                 │
└────────────────────────────────┴─────────────────────────────────┘
```

grid：`grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`；
两栏各自 `min-width: 0` 防内容撑破（否则又出横向滚动条）。

### 5.2 移动（≤480px）

```
┌───────────────────────┐
│ [导出 ●] [导入 ○]     │
│ ───────────────────── │
│ QuotaBoard            │
│  浏览器 2.1G/8.0G ▓▓░ │
│  宿主    ——（灰）     │
│ ───────────────────── │
│ SourceSlot            │
│  角色 [源包 ●][待恢复○]│
│ ┌───────────────────┐ │
│ │ 选择数据包         │ │
│ └───────────────────┘ │
│ tauritavern-…zip  ⋯   │
│ ───────────────────── │
│ ScopeTree       ▸ 展开│
│ ───────────────────── │
│ PackOptions     ▸ 展开│
│ ───────────────────── │
│ ProductList           │
│ · out_st_….zip ↓ ⟳ ⊗  │
├───────────────────────┤
│  [ 开始转换 ]  ← 吸底  │
└───────────────────────┘
```

`ActionBar` 吸底用 `position: sticky; bottom: 0`（不用 `fixed`——`fixed` 在插件抽屉态
会脱离宿主容器的层叠上下文，且需额外算 safe-area）。移动端 `safe-area-inset-bottom`
以 `padding-bottom: max(8px, env(safe-area-inset-bottom))` 吸收。

### 5.3 复用证明

| 场景 | 模块层 | 流程层 | 外壳层 |
| --- | --- | --- | --- |
| 独立 Web 桌面 | 同一份 | `out`/`in` | `desktop` |
| 独立 Web 移动 | 同一份 | `out`/`in` | `mobile` |
| 插件抽屉桌面 | 同一份 | `out`/`in` | `desktop` |
| 插件抽屉移动 | 同一份 | `out`/`in` | `mobile` |

四行**模块层完全相同** ⇒ 满足 PRD C2。

---

## 6. 宿主注入形态（PRD R2.8）

现状：`src/ui/host-bridge.js` 向四个注入点分别注入按钮 / 行。
改为**只注入一行**：

```
[●] 酒馆数据包互转工坊        [打开]
 ↑ 宿主扩展启用/停用开关       ↑ 全屏打开工作台（openConverterModal）
```

- 沿用 `dataset.stZipInjected` 幂等防重与 `watchHostDom` 自愈，机制不变，只换注入体。
- 「打开」复用既有 `openConverterModal()`，不新增入口。
- 开关语义：宿主扩展启用/停用（**非**工作台内某功能开关）。

---

## 7. 取舍与备选

| 决策点 | 选定 | 备选 | 否决理由 |
| --- | --- | --- | --- |
| 方向分离 | 顶部开关两屏 | 同屏双列 / 同屏内联 | 双列在移动端退回单列 ⇒ 双端表现分叉，违反 C2；内联仍长 ⇒ 滚动条难根治 |
| 上传槽 | 单一共享 + 角色标签 | 每方向独立槽 | 独立槽需实例化两次同一模块，且换方向要重选包 |
| 选项槽 | 同签名两模块（PackOptions / RestoreOptions） | 一个模块内 if 分支 | if 分支会让模块感知方向，违反层 1 契约 |
| 移动端吸底 | `position: sticky` | `position: fixed` | `fixed` 在插件抽屉态脱离宿主层叠上下文 |
| 宿主配额置灰 | 保留 DOM + `.is-disabled` | 直接不渲染 | 不渲染会让独立/插件两态 DOM 结构分叉，增加守卫分支 |

## 8. 回滚

- S1（四个现症）与 S2（三层重构）**分批提交**：S1 单独一个提交，可独立回滚。
- S2 触及 `src/ui/workbench-template.js`（单一模板源）与 `style.css`，
  回滚点 = S1 完成后的提交哈希。
- `index.html` 只是空骨架（`check:template-source` 强制），S2 不动它。
- 守卫与测试在 S2 期间保持全绿；任何一条转红即回滚到上一个绿点，不带着红灯继续。

## 9. 已裁定 / 未决

### 9.1 已裁定（2026-10-15）

- **移动端展开类目明细的长列表**：走**模块内滚动**（`ScopeTree` 自身限高并滚动，
  页面其余部分不动）。用户经 AskUserQuestion 选定，并附布局示意。
  落地依据：`.detail-file-list`（`style.css:1299-1306`）**已经**是
  `max-height: 220px; overflow-y: auto;` —— 现有实现即符合，本设计只是把它固化为契约。

### 9.2 R1 的现存违反点（已定位，归 S2）

`design.md` §4 的 R1 要求工作台根容器不得是滚动容器。现场取证发现**唯一违反点**：

```
style.css:1919-1924
#st-converter-modal-overlay #app.app-container,
.st-converter-drawer-app .st-converter-modal-overlay #app.app-container {
  max-height: 92vh;
  overflow-y: auto;      ← 外层滚动条
}
```

其余 4 处 `overflow-y:auto` 均为**模块内滚动**且自带 `max-height`，合规：
`pre`（`:816`，160px）、`.archive-item-list`（`:1028`，250px）、
`.detail-file-list`（`:1304`，220px）、`.log-stream-container`（`:1648`，`flex:1`）。

**真因不是 CSS，是信息量**：8 个区块常驻 ⇒ 内容必然超 92vh。
把滚动挪到内层 div 只是换个位置显示同一根滚动条。
⇒ R1 的达成条件与 **§2.4 阶段门控**绑定：`idle` 态只渲染 3 个模块，内容短到不触发滚动。
**验收时机 = S2.5**，S1 不单独修。

### 9.3 未决

- `QuotaBoard` 的「数据分布」具体维度（按类目 / 按来源 / 按包）需一次实测读数后定。

---

## 10. 提交边界（P-18 现场风险）

开工时工作区已有 **11 个文件的在途改动**（非本任务产生，另一会话的 UI 还原重构：
日志控制台改用酒馆原生 `.inline-drawer` 外观、`.wb-field` 由纵向改回横向同行、
`.wb-tool-row` 改回 `flex-wrap: row`、引导遮罩改用巨型 `box-shadow` 挖孔、
删除「快速选择」枚举与 ST 选择模式提示、新增 `renderCategoryDefaults`）。

实测该批改动**停在绿点**（`818 passed / 2 skipped / 0 failed`）。

风险：`index.js` 与 `style.css` 同时在途且**本任务也要改**（S1.1 改 `index.js`，S1.2 改 `style.css`）
⇒ 按文件名无法把两者分开提交，`git add <file>` 会把在途改动一并带走（正是 P-18 形态）。

**处置**：提交前必须由用户裁定归属，不得默认捎带。

已按用户 2026-10-15 裁定执行：在途改动先单独落一个提交（`fb344bc`，提交信息标注非本任务产物），
再在其上提交本任务改动。

---

## 11. 实施中踩到的坑（值得进 spec 的）

### 11.1 单测夹具与真实模板不一致 ⇒ 夹具绿而真页面红

`test/workbench-shell.test.js` 的 `buildShell()` 把方向开关放在了 `#wb-shell` **内部**，
而模板里我把它写在了**外面**（兄弟节点）。后果：外壳用 `shell.querySelector('#btn-flow-*')`
按 id 找按钮 → 返回 `null` → `syncFlowTabs` 静默什么都不做 → **方向切换整个失效**，
且不抛任何错误（E2E 的 E1/E2「零异常」照样通过）。

单测全绿（夹具里开关在 shell 内），真页面 20 项断言里 4 项红。
**抓到它的是真浏览器 E2E，不是单测。**

两条防护已补：
- 模板注释里写明「方向开关必须在 wb-shell 内部」；
- `test/workbench-layout.test.js` 增加**按模板源码**的顺序断言
  （`#wb-flow-switch` 必须夹在 `#wb-shell` 与 `#wb-col-left` 之间）。

**教训**：单测的 DOM 夹具必须与模板**同构**；凡是「按 id/选择器查找」的契约，
夹具对不上就测不出模板写错。这类契约应当补一条**按模板源码**的断言（本仓守卫文化已有先例）。

### 11.2 模板是 JS 模板字符串 ⇒ 注释里不能出现反引号

`workbench-template.js` 返回的是模板字符串。我在 HTML 注释里写了 `` `#wb-shell` ``，
反引号直接**终止了模板字符串**，`vite build` 报
`Expected ';', got '#'`。构建失败，E2E 直接终止。
**教训**：往该文件的注释里写字时，反引号与 `${` 一律回避。

### 11.3 E2E 套件当前是红的，原因与本任务无关（既存）

`e2e/standalone/lib/common.cjs:50` 的 `gotoWorkbench` 会先点 `#btn-wb-view-toggle`——
该控件在 2026-10-14 随迁移向导一起删除（任务 `10-14-ui-full-rewrite` R-01，
`git show HEAD:src/ui/workbench-template.js | grep -c wb-view-toggle` ⇒ **0**）。
于是**所有**走该 helper 的 spec 都在第一步 30s 超时，共 24 项断言失败；
`#wizard-step-counter` 等 4 项同理。

**这不是本次改动引入的**：该控件在本次改动之前的 HEAD 就已不存在。
本次新增的 `e2e/standalone/specs/workbench-shell.e2e.cjs` 不引 `common.cjs`，
自带就绪判定，实测 **20/20 全绿**。

⇒ 后续需要单独一个任务清理这批陈旧 spec（删掉向导残留引用）。
