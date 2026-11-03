# 执行计划：UI 编排与数据流重规划

> 本任务是**父规划任务**：执行 = ①收口前置门 → ②按任务地图逐个建子任务并推进。
> 复选框随执行实时勾选（L0-2）。验证命令均在仓根执行。

## 0. 前置门：收口 `10-15`（D-01）—— ✅ 2026-10-24 完成（提交 `f97a000` 已推送）

- [x] 0.1 QuotaBoard（S2.6）——核实已随 `d3d9c6e`/`be04efd` 落地，勾选补记
- [x] 0.2 S1 浏览器实测——新增 `e2e/standalone/specs/s1-remedies.e2e.cjs` **15/15 全绿**，
  四张截图落 `test-results/shots/s1-*.png`
- [x] 0.3 S3.1 规范落盘——新建 `.trellis/spec/frontend/workbench-three-layer.md` + index 登记
- [x] 0.4 S3.3 归档——`archive/2026-10/`（--skip-branch-validation：本仓直接 main 提交非 PR 制）
- 验证：`npm test` 865 passed / 2 skipped / 0 failed；e2e s1-remedies 15/15

## 1. A 线 `ui-orchestration-impl`（依赖 0）

- [ ] 1.1 建子任务并回填 PRD（本 PRD 的 R-A1~R-A6 + design §2~§5）
- [ ] 1.2 分组列表（R-A1）：`groupItems` 纯函数 + 两列表 `groupBy` 接线 + 组头三态 checkbox；单测两态（分组/平铺）
- [ ] 1.3 区块「?」帮助（R-A2）：`HELP_TOPICS` 数据表 + 复用 attachRowMenu 浮层 + 悬空断言
- [ ] 1.4 铁律定型（R-A3）：`ui-orchestration-rules.md` spec 单页 + 文案守卫扩按钮动词表
- [ ] 1.5 `detectHost` 两级判定（R-A4）：宿主注册表 + tt/pt 接入 + 消费点过堂；8899 PT 实测
- [ ] 1.6 拉取前预览（R-A5）：内联摘要行（类目数+能力读数），零新增请求
- [ ] 1.7 纯本地 IO 审计（R-A6）：OPFS 不可用回退路径读数（手机场景）与优化
- [ ] 1.8 收口：E2E 分组/帮助断言 + 截图 + `npm test` 零回归 + 五守卫全绿 + 推送
- 验证：`npm test`；`npm run check:css-scope && npm run check:control-consumer`（等五守卫）；`npm run e2e:web`

## 2. B 线 · Luker 极致省字节 `luker-selection-max`（无依赖，可与 1 并行）

- [ ] 2.1 取证：Dev Luker 8003 上 selection 形状粒度 / 重类目排除 / Content-Length 三问（design §5.3）
- [ ] 2.2 按取证粒度透传排除项；不支持的退回浏览器过滤
- [ ] 2.3 基线读数：同勾选集优化前后拉取字节数对比报告
- 验证：`npx vitest run test/`（host-bridge 相关）；E2E 只连 8003

## 3. B 线 · Authority PR `authority-st-capability`（Authority 仓，无依赖）

- [ ] 3.1 在 Authority 仓按其流程建任务/issue：ST 选择性备份 + 整包恢复端点需求（本仓 PRD 只登记期望）
- [ ] 3.2 本仓侧适配器：特性检测 + st 平台优先增强通道 + 失败回退（design §5.4）
- [ ] 3.3 装/未装两态单测 + PR 链接登记回本 PRD
- 验证：装/未装两态单测全绿；未装时行为与现状逐字节等价

## 4. C 线 · TT CDP 取证 `tt-cdp-probe`（无依赖，可与 1 并行）

- [ ] 4.1 按 design §6.1 五步取证（调试口 → connectOverCDP → 冒烟）
- [ ] 4.2 结论三分支落地（纳入矩阵 / tauri-driver 评估 / 替证策略入 spec）
- 验证：取证脚本与读数留 `test-results/`；结论写入 `.trellis/spec/guides/instance-e2e-and-data-sync.md`

## 5. C 线 · `e2e-instances-runner`（依赖 4）

- [ ] 5.1 `scripts/` 四脚本审阅后**提交入库**（独立提交，防 P-18）
- [ ] 5.2 `npm run e2e:instances`：restart → guard → 三 Dev 宿主冒烟矩阵（+TT 若 4 通过）
- [ ] 5.3 读数产物：`test-results/instances/` 逐宿主 md + 截图
- [ ] 5.4 跑稳后上贡素材整理（守卫+矩阵+脚本 → harness 回流清单）
- 验证：`npm run e2e:instances` 一键全绿；guard 对 Real 端口拒绝生效（负例自测）

## 6. D 线 · `harness-reflow`（tavern-harness 仓；R-D2 依赖 1.4）

- [ ] 6.1 在 harness 仓建任务：回流机制（contributions.md + 审核约定）
- [ ] 6.2 扫描登记命令 + `--verify` 挂工作流
- [ ] 6.3 UI 铁律素材上贡（tavern-helper-frontend 空位 / tavern-ui-style）
- [ ] 6.4 MCP 查询面扩展
- 验证：harness 仓自身校验（--verify/--apply 幂等）；本仓零改动

## 7. 父任务收口

- [ ] 7.1 跨子任务验收对表（AC-0~AC-10）逐条勾选
- [ ] 7.2 本 PRD 收敛终稿 + 子任务全部建立或完成
- [ ] 7.3 归档

## 风险文件与回滚点

- 高风险：`src/ui/stash-list.js` / `export-queue.js`（1.2）、`src/ui/host-bridge.js`（1.5/3.2）——
  均为多消费点共享模块，改动前先 `grep` 消费面。
- 回滚：A 线四提交各自独立；B/C 线与 A 线无文件交集；`groupBy=null` 是分组开关的内置回退。
- 提交纪律：显式 pathspec、暂存区校验（L0-7）；`.trellis/tasks/` 不入库（L0-17），规范条文落 spec。
