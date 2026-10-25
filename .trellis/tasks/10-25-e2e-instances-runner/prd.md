# e2e instances 统一入口

## Goal

`npm run e2e:instances` 一键：restart-instances + guard 白名单断言 + 三 Dev 宿主冒烟矩阵
（PT 必须 `--headed`；TT 视 `tt-cdp-probe` 结论定矩阵），产物落 `test-results/instances/`
（父任务 R-C2 / D-10 / design §6.2）。

## 背景

- 四脚本已入库（Session 48，`f793e6c`）：PT 安装 / 扩展行探针 / 实例探针 / 实例重启
  （`scripts/` 下，头注释与端口写死处待逐个审阅——本任务收编时过堂）。
- 既有守卫：`test/e2e/lib/guard.cjs` 白名单 {8001, 8003, 8899} + D-12 域名强制（21/21）。
- 既有独立 E2E：`e2e:web`（独立态）与实例侧手工脚本并存，尚无统一入口。

## Requirements

| # | 要求 |
| --- | --- |
| R1 | `package.json` 增 `e2e:instances`：串接 ①restart-instances（junction 校验 + PT 重装 + 进程重启）→ ②guard 断言 → ③逐宿主冒烟矩阵 |
| R2 | 矩阵（父 design §6.2）：`dev-st 8001 http`（挂载/工作台/上传-转换-下载）、`dev-luker 8003 https`（同上+宿主拉取 selection 透传读数）、`dev-pt 8899 http`（挂载+工作台打开，`--headed` 硬约束）、`tt-cdp 9223 cdp`（若上游结论并入） |
| R3 | 每宿主产物：`test-results/instances/<host>-<date>.md` 读数 + 截图 |
| R4 | 目标一律实例命名式域名（D-12：禁 `localhost`/`127.0.0.1` 裸串与域名端口错配） |
| R5 | 收编脚本逐个审阅：头注释、端口写死处、白名单一致性；审阅记录落任务目录 |
| R6 | 跑稳后素材上贡 tavern-harness（走其仓回流流程 R-D1，本任务只备素材不跨仓直改） |

## Acceptance Criteria

- [ ] AC-1 `npm run e2e:instances` 本机一键三宿主全绿（st/luker/pt），退出码 0。
- [ ] AC-2 单宿主失败不影响其余宿主跑完（逐宿主独立汇总），总报告列每宿主状态。
- [ ] AC-3 `test-results/instances/` 产物齐（每宿主一 md + 截图），含本次运行读数。
- [ ] AC-4 四脚本审阅记录落 `research/scripts-review.md`（头注释/端口/白名单逐项过堂）。
- [ ] AC-5 `npm test` 零回归、五守卫全绿；目标全在 Dev 白名单 {8001, 8003, 8899}（+TT 9223 若并入）。
- [ ] AC-6 父任务 AC-8 勾结引用（含 TT 矩阵参与状态与理由）。

## 范围外

- 不含 Real 实例（任何形态）。
- 不在本仓内实现 harness 侧回流（R-D1 在其仓流程）。
- 不改独立态 `e2e:web` 既有用例。

## 依赖与关联

- 上游：`10-25-tt-cdp-probe`（定矩阵是否含 tt-cdp 行；结论未出时先按三宿主实现，TT 行留扩展位）。
- 父任务：`10-24-ui-orchestration-r2`（AC-8）。
