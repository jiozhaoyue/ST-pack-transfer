# UI 编排实施：分组列表 · 区块帮助 · 铁律定型 · 宿主识别 · 拉取预览

## Goal

落实父任务 `10-24-ui-orchestration-r2` 的 A 线（R-A1~R-A6）：在 10-15 三层骨架**不动外壳**的前提下，
把左栏两张列表升级为按维度分组、给每个区块加「?」上下文帮助、把文案/控件纪律定型为《UI 编排铁律》
并加守卫断言、`detectHost()` 接入 TT/PT 两级判定、宿主拉取前给出预览、审计纯本地（无 OPFS）回退路径。

## Requirements（来自父 PRD A 线 + design.md §2~§5，逐条可验）

| 编号 | 要求 |
| --- | --- |
| R-A1 | 分组列表：源包列表按来源（upload/host-export）分组、产物列表按目标平台分组；组头 = 徽标计数（`N 项 · X MB`）+ 组内全选三态 checkbox（不切断跨组多选）；空组不渲染；`groupBy` 可传 `null` 退回平铺（单测两态）；折叠态进 state 不进模块闭包 |
| R-A2 | 区块「?」帮助：每个 `data-wb-module` 区块标题栏一个「?」按钮 → 锚定浮层（`HELP_TOPICS` 静态数据表，标题 + ≤5 行要点 + 可选文档链接）；帮助文案受同一文案铁律约束（无括号/无分号/无教学口吻）；`HELP_TOPICS` key 必须对应存在 `data-wb-module`（守卫断言防悬空） |
| R-A3 | 《UI 编排铁律》落 `.trellis/spec/frontend/ui-orchestration-rules.md`（布局/控件/文案/帮助四节，每节规则+判据+守卫名）；按钮动词表为封闭集合，新增按钮先扩表；vitest 断言：模板按钮文案 ∈ 动词表、`HELP_TOPICS` 无悬空 |
| R-A4 | `detectHost()` 两级判定：宿主注册表数据化（`globalFlag`/`agentMatch`/`platformCode`），前端全局级（顺序：lukerContext → `__TAURITAVERN__` → `__PURE_TAVERN__` → SillyTavern）+ `/version` agent 复核级；返回集扩为 `st\|luker\|tt\|pt\|standalone\|unknown`；两级不一致以第 2 级为准并 `logger.warn`；既有消费点逐一过堂，tt/pt 未接线的能力**置灰不隐藏** |
| R-A5 | 拉取前预览：发起宿主拉取前在源包区块内联一行摘要（类目数 + 能力读数：Luker「按勾选透传」/ ST「全量拉取后过滤」）+ 确认按钮；数据源零新增请求（`selection-defaults.js` + `hostSelectionCapability()`） |
| R-A6 | 纯本地 IO 审计：OPFS 不可用（手机场景）回退路径读数与优化，产出审计记录 |

## Acceptance Criteria

- [x] AC-1 上传一个包 + 宿主拉取一个包 ⇒ 源包列表恰两组（E2E 断言组头计数）；转出两个目标 ⇒ 产物列表恰两组 —— s1-remedies H1-H7（2026-10-24，25/25）
- [x] AC-2 `groupBy=null` 退回平铺的单测通过；跨组多选仍可用（E2E：选两组各一条后批量下载可用）—— 列表测试 30/30
- [x] AC-3 每个可见区块标题栏有「?」，点开浮层仅含该区块说明；界面常驻说明文案为零（既有文案守卫保持绿）—— help-topics 5/5 + 守卫全绿
- [x] AC-4 `ui-orchestration-rules.md` 落盘 + index 登记；按钮动词表断言 + `HELP_TOPICS` 悬空断言进 vitest 且全绿 —— 落盘于 R-A3；index 登记于收口时补齐（2026-10-24）
- [x] AC-5 `detectHost()` 单测覆盖四宿主判据 + unknown 兜底 + 两级不一致以 agent 为准；既有单测零回归 —— detect-host 30/30
- [x] AC-6 拉取前预览：ST 平台显示「全量拉取后过滤」、Luker 显示「按勾选 N 类目透传」（单测两态）—— 4 项单测
- [x] AC-7 R-A6 审计记录落任务目录（回退链 + 读数 + 优化项清单）—— `research/local-io-audit.md`
- [x] AC-8 `npm test` 零回归（基线 865 passed）；五守卫全绿；`npm run e2e:web` 全绿（含 s1-remedies）—— 892 passed / 2 skipped（+27），五守卫绿，e2e:web exit 0（2026-10-24 收口复跑复核）

## 约束

- 三层外壳/流程层零改动（10-15 骨架已验收）；只动模块层与 host-bridge。
- CSS 双前缀铁律、`--SmartTheme*` 配色、文案纪律（title ≤ 8 字等）不回归。
- 不改 `src/core/` 转换契约；不改 IndexedDB 记录形状（分组是渲染视图）。

## 范围外

- Authority 适配器（B 线 3 号任务）；TT CDP 取证（C 线 4 号）；e2e:instances 入口（C 线 5 号）。
- tt/pt 的宿主拉取**接线**（只做识别 + 置灰；端点接线等 B/C 线取证）。
