# 工作台 UI 取证审计（2026-10-14）

方法：起真实 dev 服务器（`http://localhost:3040/`，本机实例已在 `[::1]:3040` 监听）+ Playwright 1.62.1
逐步骤截图 + DOM 计算样式提取。**所有结论均为实测，不是读代码推断。**

## 一、实测硬缺陷

| # | 现象 | 根因（file:line） |
|---|---|---|
| 1 | 「从源重开」空壳框在**六个步骤 + 高级模式全程可见**，标题与理由都是空字符串 | `style.css:2812` 给 `.wb-gate` 写了 `display: flex`，压过 HTML 上的 `hidden` 属性。同类元素 `.host-tree-confirm-bar`(:689)、`.task-controls`(:713)、`.report-panel`(:751) 都单独补了 `[hidden]` 兜底规则，**唯独漏了 `.wb-gate`** |
| 2 | 向导第 6 步「核对」**整步是空的** | `#report-panel` 带 `hidden`，且未参与 `data-wb-step` 显隐；该步没有任何内容挂载 |
| 3 | 向导第 3 步「范围」显示的是**打包折叠项**，真正的内容范围面板被隐藏 | `#category-panel` 带 `data-wb-step="scope"` 但初始 `style="display:none"`，仅在有源包时由 JS 打开 |
| 4 | 配额条与日志台在**每一步**都可见 | `#usage-dashboard` / `#log-console-mount` 无 `data-wb-step`，属全局 chrome 却放在向导正文流里 |
| 5 | 高级模式一次性平铺 **41 控件 / 22 输入** | `workbench-template.js` 全量渲染，无渐进披露 |

## 二、冗余与黑话

- **重复标签**：`#btn-select-all`（全选）与 `#btn-host-tree-selectall`（全选）同屏。
- **并排铺开**：`#btn-select-all/deselect-all/invert-select` + 三个 `btn-quick`（仅角色卡/仅聊天记录/安全脱敏）共 6 个按钮一行。
- **黑话**：`Git 瘦身` / `Git 剔除` / `轻量清单` / `增量与差量` / `差量补丁`。
- **教学性 tooltip**（违反模板自己第 13 行的文案约定）：`git-mode` 三个 `title=` 各挂 30–60 字长句说明。

## 三、配色违规（用户死命令：只有酒馆颜色）

`style.css:15-72` 在容器上自建了一整套色板，其中**硬编码字面量**：

- 平台品牌色 `--accent-st:#38bdf8` / `--accent-luker:#c084fc` / `--accent-tt:#fb7185` / `--accent-pt:#34d399`（:42-45）
- 动作语义色 `--st-action-copy:#10b981` / `route:#3b82f6` / `migrate:#8b5cf6` / `drop:#ef4444` / `filter:#6b7280`（:51-56）
- 状态色 `--warning:#f59e0b` / `--danger:#ef4444` / `--success:#10b981`（:59-61）
- 文本回退 `#f5c542`、强调回退 `#f59e0b`、背景回退 `#14161c`/`#1b1e27`

而同一段第 11 行自己写着「严禁在此硬编码覆盖（09-07 教训）」。属自相矛盾。

## 四、折叠行间隔（用户新指令：禁止这样的间隔）

截图实测：四个折叠行（垃圾清理 / 扩展打包 / 增量与差量 / 包名）之间有明显竖向空隙，
行高与间距不成比例，视觉上像四个独立卡片而非一组。

## 五、模式类控件全清单（用户说「不止顶部，还有别的」）

| # | 位置 | 形态 | 候选处置 |
|---|---|---|---|
| 1 | 页头 `#btn-wb-view-toggle` | 向导模式 ↔ 高级模式 | 删（用户已定） |
| 2 | 向导步骤条 `#wizard-rail` 6 个按钮 | 步骤导航 | 删（随向导模式） |
| 3 | `#wizard-gate` 不兼容门 | 条件全屏块 | 保留逻辑，重做呈现 |
| 4 | `input[name=extension-mode]` | 二选一 radio 并排 | 改枚举 |
| 5 | `input[name=git-mode]` | 三选一 radio 并排 | 改枚举 + 去黑话 |
| 6 | `input[name=restore-mode]` | 二选一 radio 并排 | 改枚举 |

## 六、用户下达的硬约束（本轮原话，逐条）

1. 全面用代理找前端 skill / 框架 / 设计范式；禁止回退、禁止自写。
2. 只用酒馆颜色，禁止任何其他颜色。
3. 按钮去冗余，git 必须是项枚举，禁止有任何模式选择。
4. 上传区与导出区必须有列表。
5. 删除向导模式，只增加引导按钮；首次安装与再点都有全屏引导动画。
6. 宿主显示动态化，非四种宿主兜底 `unknown`。
7. 禁止任何说明文字：括号说明、分号、长句说明、并排、任何解释。
8. 禁止折叠行之间那种大间隔。

## 七、截图

工作区临时目录 `C:/Users/caocaobi/AppData/Local/Temp/stzip-shots/shots/`：
`01-initial.png`（第 1 步）`step2..step6.png`、`advanced.png`、`wizard-report.json`（每步可见区块清单）。
