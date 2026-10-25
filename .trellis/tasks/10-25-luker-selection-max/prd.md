# Luker 极致省字节拉取

## Goal

取证 `/api/users/backup` selection 契约粒度（类目级 → 文件级可否），能透传的排除全部透传，
同勾选集下拉取字节数较基线下降，附实测读数（父任务 R-B1 / D-03① / design §5.3）。

## 背景（2026-10-25 取证）

- 现状：`fetchHostBackup(platform, selection)` 把 13 键类目布尔表原样透传
  （`src/ui/host-bridge.js:784-787`，`src/core/selection-defaults.js`）。
  ST 端点忽略 selection（必全量，浏览器内过滤）；Luker 原生支持类目级勾选。
- 痛点：Luker 端 `backups/`、`cache/` 等重类目即使全不勾，若 Luker 端点粒度只到类目级，
  类目内部的必然载荷（如类目清单/元数据）仍会进包；且未知端点是否支持路径/文件级排除。
- 取证环境：Dev Luker（`dev-luker.localhost:8003`，白名单内；D-12 域名强制、E2E 只连 Dev）。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R1 | **契约取证三问**（对 Dev Luker 实测，结论落 `research/`）：① selection 值形状是否支持**文件/路径级**排除（现状只传类目布尔）；② `backups` / `cache` 等重类目勾 false 时端点实际排除多少字节（勾选差分实测）；③ 端点是否返回 `Content-Length`（可估总量、可给拉取前预览供读数）。 |
| R2 | **能透传的全部透传**：依取证粒度实施——端点支持什么粒度就传什么粒度；不支持的排除项退回浏览器内过滤（现状路径），不伪造粒度（父 PRD 风险表）。 |
| R3 | **读数基线**：同勾选集「优化前 vs 优化后」拉取字节数实测对比，落 `deliverables/` 取证报告（AC-5 的实测数字）。 |
| R4 | ST/TT/PT 路径零行为变化（能力表 `BACKUP_SELECTION_SUPPORT` 不动；改动只在 luker 分支）。 |
| R5 | 单测：透传形状、能力表、退回路径三态均有断言；`npm test` 零回归、五守卫全绿。 |

## Acceptance Criteria

- [x] AC-1 取证报告落 `research/luker-selection-probe.md`：三问各有实测结论与命令复现（含响应摘录）。—— 七轮探针 + 双法交叉验证（差分/清单）
- [x] AC-2 ~~细粒度透传~~：取证结论=契约无文件/路径级粒度（非布尔形状被静默忽略）⇒ 按 AC-3 分支收束。
- [x] AC-3 取证结论为仅类目级（现状已到顶）：报告 §0/§6 记录判定与收束理由；**重大补充事实**：`settings` 键与 `backups/` 892.2MB 绑死（勾设置必拖备份，占全量 49.8%），解绑诉求登记 R-B2。
- [x] AC-4 字节读数：同勾选集对比表（Dev Luker 实测数字）落 `deliverables/bytes-report.md`，父任务 AC-5 勾结引用。—— 全量 1,794,066,397B；反选 settings 省 50.2%（894,775,736B）
- [x] AC-5 `npm test` 全绿零回归；五守卫全绿；E2E 只连 Dev 白名单（8003）。—— 892 passed / 2 skipped（基线一致）；五守卫（css-scope/dom-injection/template-source/dom-scope/control-consumer）全绿；取证只连 dev-luker.localhost:8003

## 范围外

- 不改 ST 全量+过滤路径（ST 增强走 Authority PR：`authority-st-capability`，在 Authority 仓）。
- 不建清单缓存层（D-03 已裁定不做）。
- 不动 `src/core/` 转换契约。

## 依赖与关联

- 父任务：`10-24-ui-orchestration-r2`（AC-5）。
- 改动集中在 `src/ui/host-bridge.js` luker 分支（与 A 线无文件互踩）。
