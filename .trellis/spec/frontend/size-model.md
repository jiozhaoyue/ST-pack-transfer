# 体积测量 / 预测模型（2026-11-17 用户硬要求，待实现）

> **状态：⏳ 待实现。** 用户要求：所有体积测量与体积预测必须健壮、覆盖全部情况、精准；不能“用户说了才加检测”。

## 1. 现状与债务

- 当前压缩比硬编码：`src/ui/workbench-view.js:1454-1455`
  （fast `0.65` / maximum `0.42` / store `1.0` / default `0.5`）。
- 现有入口：`projected` / `estZipMb`（约 1454-1500）、`realUncompressedMbOf`（约 1981）、
  `volumesOf`（`src/core/chart-model.js:560`）、pending 卡（约 7821）。
- 问题：未系统覆盖 ZIP 开销、分卷开销、生成条目、扩展模式、Git 剔除、引擎载体、去重、差量、目标新增文件；未知体积容易显示成精确值。

## 2. 必须覆盖的矩阵

1. 全部类目：chats / characters / lorebooks / images / presets / extensions / vectors / private / native / backups / cache / unknown。
2. 源包压缩与未压缩体积、条目数、ZIP 本地头/中央目录/数据描述符开销。
3. 转换新增/删除：manifest、`_convert` 说明、PT 模块记录、引擎 `_engine_meta.json` / `_engine_dump.bin` / `luker-storage.sqlite`、目标布局改名。
4. 扩展模式：full / manifest / dual；Git keep / minimal / strip。
5. 分卷：每卷清单、中央目录、跨卷重复条目、卷数。
6. 差量 / 合并 / 去重 / 冲突跳过。
7. 私有配置兼容剔除、原生资产剔除、`.git` 剔除。
8. 未知或读不到体积：输出 `?` 或区间 + `unknowns[]`，禁止假精确。

## 3. 建议实现

- 新增 `src/core/size-model.js`：输入 plan entries + 选项，输出
  `{ predictedBytes, breakdown, confidence, unknowns }`。
- 纯逻辑、无 DOM；单测覆盖全部矩阵。
- UI 只消费模型，不在 `workbench-view.js` 里散落压缩比。
- 用真实 fixture 做 `predicted vs actual` 回归（转换后实际 ZIP 字节数）。

## 4. 验收

- 每个类目、四种 Luker 引擎、full/manifest、split、delta 都有预测/实测对比。
- 任何未知项都出现在 `unknowns[]` 且 UI 显示 `?`，不得静默按 0 或固定比例。
- 现有 `npm test` 全绿；新增 size-model 单测全绿。
