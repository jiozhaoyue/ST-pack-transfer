# UI 层全量重写

## Goal

把工作台 UI 层（模板 + 样式 + 交互）全量重写为单一界面，满足父任务 C-01~C-10。
`src/core/` 与全部既有契约不动。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R-01 | 删除 `#btn-wb-view-toggle`（模式切换）、`#wizard-rail`（六步步骤条）、`#btn-wizard-prev/next`、`#wizard-step-counter`、`#wizard-gate` 及其空壳框；删除 `migration-wizard.js` 中对应逻辑 |
| R-02 | 删除「模式选择」类控件：`input[name=extension-mode]`、`input[name=git-mode]`、`input[name=restore-mode]` 全部改为 `select` 枚举 |
| R-03 | 扩展包枚举＝{只导出清单, 完整扩展包}；Git 历史枚举＝{保留历史, 只留更新所需, 不含历史}；后者仅在前者＝完整扩展包时可用 |
| R-04 | 配色收敛：删除 `--accent-st/luker/tt/pt`、`--st-action-*`、`--warning/danger/success`、`--text-gold` 等自造色；全部改为 `var(--SmartTheme*, 回退值)`；回退值只在无宿主时生效 |
| R-05 | 危险动作（覆盖写入 / 删除）不靠颜色，靠二次确认弹窗 |
| R-06 | 上传区与导出区渲染为列表（名称 + 大小 + 单条操作） |
| R-07 | 删除一切说明性文案：括号补充、分号长句、`title=` 教学 tooltip、空态解释段 |
| R-08 | 控件单列不并排；区块间距紧凑，无大间隔 |
| R-09 | 宿主动态识别：数据驱动注册表，两级判定（前端全局 → `/version` agent）；未知宿主兜底 `unknown`；新增宿主不改判定逻辑 |
| R-10 | 同步维护 `scripts/control-consumer-guard.js` 的控件声明表：删除的控件移出、新增的控件写入 |

## Acceptance Criteria

- [ ] AC-01（R-01）：界面无任何模式切换与步骤条；截图可证
- [ ] AC-02（R-02/R-03）：三组 radio 均为枚举；扩展包与 Git 历史为两个独立枚举
- [ ] AC-03（R-04）：`npm run check:css-scope` 通过，且 `style.css` 内除 `var(--SmartTheme*, …)` 外无颜色字面量
- [ ] AC-04（R-05）：覆盖写入与删除有二次确认；截图为证
- [ ] AC-05（R-06）：上传区与导出区为列表；截图为证
- [ ] AC-06（R-07）：模板内无括号说明、无分号、无 `title=` 长句
- [ ] AC-07（R-08）：控件单列；折叠行（若有）间距与行高成比例
- [ ] AC-08（R-09）：四宿主各显示正确名称；未知宿主显示 `unknown`；单测覆盖判据
- [ ] AC-09（R-10）：`npm run check:control-consumer` 通过
- [ ] AC-10：五个守卫全绿；`npm test` 零回归；`npm run e2e:web` 通过
- [ ] AC-11：交付含前后截图对照

## 范围外

- 不改 `src/core/`。
- 不引入任何框架或库。
- 不改宿主源码与实例目录。
- 不做引导动画（属 `10-14-onboarding-guide`）。
