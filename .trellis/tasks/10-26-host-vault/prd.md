# 各酒馆私有格式仓：后端完整存储与导入导出

## Goal

让插件在**任意宿主**上保存**任意酒馆私有格式**的数据包（含与当前宿主不兼容的格式，
如 ST 里存 TT 的 .db 包），存储落**宿主服务端后端**（Authority blob 分块存储，
字节精确、完整不转换、完全存储），并提供仓列表 / 存入 / 导出 / 删除 / 恢复入口。
Authority 不可用时降级 IndexedDB（L0-11 / L1-MR-1：纯前端路径保持全功能）。

## 背景 / 动机（2026-10-26 用户目标）

- 「应当有功能可以在不同酒馆放各酒馆私有格式文件，即不兼容的文件，不是浏览器，
  是后端存储，完整的存储，完全存储，然后可以通过插件导入导出」。
- 现状缺口：`export-queue.js` 的 `mirrorArtifact` 只做**同名覆盖的单产物归档**，
  无索引、无多条目、无原始格式标签、无导出回读 UI；跨格式不兼容包无处安放。
- 既有可复用件：`src/storage/authority-store.js` 已有分块 blob 存取
  （`putArtifact` / `getArtifact` / `deleteArtifact`，4MB 分块 + KV 清单 + 代际隔离）；
  `src/storage/db.js` IndexedDB files store（origin 分类）。

## Requirements

| # | 要求 |
| --- | --- |
| R1 | 新模块 `src/storage/vault-store.js`：统一仓 API（`vaultPut` / `vaultGet` / `vaultList` / `vaultDelete` / `vaultBackend`），Authority 可用时走后端 blob（命名空间 `vault:<id>:<name>`），不可用时降级 IndexedDB（`ORIGINS.VAULT`），同 API 形状 |
| R2 | 条目元数据：`{ id, name, formatTag(st/l/tt/pt/raw), size, chunks, savedAt, note }`；**同名不覆盖**（唯一 id）；索引存 Authority KV（`vault-index`，超 128KB 上限时分片 `vault-index:N`）或 IndexedDB 记录自身 |
| R3 | 存入字节精确：分块写入流式进行（不整包驻留），读出重组后按 `size` 校验；roundtrip 字节一致由单测锁定 |
| R4 | 存入入口三枚：① 任意文件加入仓（不限 zip）② 暂存区选中项存入 ③ 宿主拉取完成后存入 |
| R5 | 导出入口：仓条目 → 下载（复用既有下载链）或转入待导出区 |
| R6 | 恢复入口：条目 formatTag 与当前宿主兼容时提供恢复到当前宿主（复用既有恢复链，不兼容时按钮不出现） |
| R7 | UI 新模块 `data-wb-module="vault"`：标题「仓」；列表行含名称 / 格式徽标 / 体积 / 日期 / 行内动作；后端徽标（服务端 / 本地降级）；遵守文案约定与控件约定；idle 与 done 阶段可见、两流程共用 |
| R8 | 布局登记：`MODULE_IDS` / `SHARED_CORE_MODULES` / `visibleModules` / 模板 / `workbench-layout.test.js` 对账同步更新 |
| R9 | 测试：vault-store 单测（mock SDK 形状逐条对齐真 SDK，位置参数）、渲染测试、roundtrip 字节精确用例 |

## Acceptance Criteria

- [ ] AC-1 vault-store 四操作在 Authority 可用时走后端：多条目互不覆盖、删除互不误伤、
      roundtrip 字节精确（含 >4MB 跨块文件）
- [ ] AC-2 Authority 不可用时自动降级 IndexedDB，同 API 形状；`vaultBackend()` 可查询当前后端
- [ ] AC-3 UI 全链路：三入口存入、列表渲染（含格式徽标与后端徽标）、导出、删除均有消费者接线
      （control-consumer 守卫过）
- [ ] AC-4 布局对账：模板 / MODULE_IDS / FLOWS / 测试一致，五守卫全绿
- [ ] AC-5 `npm test` 零回归

## 范围外

- 跨宿主自动同步（LAN transfer 已有，可后续接「仓条目发送」）。
- TT / PT 后端直写（两宿主无 Authority，降级路径已覆盖其可用性）。
- checksum 完整性指纹（v1 以 size 校验 + roundtrip 测试锁定，后续可加流式 hash）。

## 依赖与关联

- 复用 `src/storage/authority-store.js` 分块原语（可能加 `onChunk` 钩子，向后兼容）。
- 上游探子报告：Authority blob 的物理落盘位置与列表能力（research/ 落档）。
- 父任务：无（独立功能任务；与 10-24-ui-orchestration-r2 的模块体系对接）。
