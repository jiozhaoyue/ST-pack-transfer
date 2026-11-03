# 实施计划：Luker 极致省字节拉取

> 复选框随执行实时勾选（L0-2），禁止事后补勾。

## 阶段 0 · 准备

- [x] 读 `.trellis/spec/frontend/host-capabilities.md` 与 `instance-e2e-and-data-sync.md`（E2E 纪律）
- [x] 确认 Dev Luker 8003 存活（域名形式探活，不裸 IP）—— 实例冷启动实测 163s（插件自动更新 SSL 超时拖慢，`restart-instances.cjs` 的 90s waitReady 不够，读数移交 e2e-instances-runner 任务吸收）

## 阶段 1 · 取证（design §1）

- [x] 写 `research/probe-backup-selection.cjs`（取证矩阵；后扩展为七轮探针，design 的 CSRF 步骤因实例 `disableCsrfProtection: true` 简化为免 token）
- [x] 跑取证矩阵，原始读数落 `research/probe-*.json`（七轮：形状边界/总量/数组伪 false 排除/清单定案/真布尔/逐键/settings-off 验证）
- [x] 结论三问逐条落 `research/luker-selection-probe.md`（含两次自我修正：数组≠伪 false；backups 实际进包且与 settings 绑死）

## 阶段 2 · 实施（依结论二选一）

- [x] 分支判定：**乙**（10 键布尔透传有效且已在线；`settings↔backups` 绑死 892MB 属端点契约缺陷，透传层无从解绑）——报告 §0/§6 记录判定依据
- [x] ~~甲：细粒度透传~~（契约无文件/路径级粒度，不实施）
- [x] 乙的补充：spec 增补契约表+三条硬约束（`.trellis/spec/frontend/host-capabilities.md`）；「两段式拉取」候选登记 R-B2，未经裁决不实施
- [x] `npm test` 全绿 + 五守卫全绿（892 passed / 2 skipped；五守卫全过 2026-10-25）

## 阶段 3 · 读数与收口

- [x] 同勾选集字节对比表落 `deliverables/bytes-report.md`（父 AC-5 数字：全量 1.79GB；反选 settings 省 50.2%）
- [x] 结论增补 `.trellis/spec/frontend/host-capabilities.md`
- [x] 父任务 `10-24-ui-orchestration-r2` AC-5 勾结引用
- [ ] 提交（显式 pathspec + 暂存区校验）+ push origin

