# 仓（vault）运行时验证固化为 e2e 矩阵 spec

## Goal

把 `10-26-host-vault` 任务里的一次性取证脚本（`research/verify-vault-runtime.cjs`）
固化为**仓库内的 e2e spec**，并入 `npm run e2e:instances` 矩阵，并补齐
**TauriTavern / PureTavern** 两个宿主的仓面板截图取证。

现状缺口：仓功能的运行时验证只存在于那个任务目录里（随任务归档，不入常规回归），
且只覆盖 Dev ST / Dev Luker；TT 与 PT 的仓面板从未截图取证。

## Requirements

| # | 要求 |
| --- | --- |
| R1 | 新增 `e2e/specs/vault.e2e.cjs`，覆盖仓的双后端全链路：仓模块可见 + 后端徽标 → 清场 → 存入固件包 → **UI 恰好 1 行且后端真值恰好 1 条** → 导出字节一致 → 删除后 UI 与后端双归零 → 零本插件报错 |
| R2 | spec 走后端真值判定：页内 `import()` 插件自身的 `vault-store.js` 读 `vaultList/vaultBackend/vaultDelete`，**不以 DOM 行数推断后端状态**；UI 只用于交互与截图 |
| R3 | 声明 `requiresInstances: ['dev-st', 'dev-luker', 'pt-web']`；可 `node e2e/run.cjs --only vault --instance <id>` 单跑 |
| R4 | `scripts/run-e2e-instances.cjs` 的矩阵为 dev-st / dev-luker / dev-pt 各增一条 `vault` 行（PT 走 `--only vault --instance pt-web`） |
| R5 | TT 走 CDP 路径：在 `e2e/lib/tt-cdp.cjs` 增 `ttVaultSmoke`（打开工作台 → 仓模块 → 后端真值 → 存入 → 删除 → 截图），由矩阵 tt-cdp 行调用 |
| R6 | 产物：截图为 `test-results/instances/vault-<host>-<step>-<date>.png`，读数为同名 `.md`（该目录已被 `.gitignore` 覆盖，不入库） |
| R7 | 不新增 npm 依赖；不连 Real；沿用错峰模型（随宿主一起跑，不额外常驻） |
| R8 | 若 spec 暴露产品缺陷，修产品代码并补单测；若只是断言写错，改断言并在注释里写清判据 |

## Acceptance Criteria

- [x] AC-1 `node e2e/run.cjs --only vault --instance dev-st` 全绿，后端徽标「本地」、`vaultBackend()=indexeddb` —— 17/17 PASS（2026-10-26）
- [x] AC-2 `node e2e/run.cjs --only vault --instance dev-luker` 全绿，后端徽标「服务端」、`vaultBackend()=authority` —— 17/17 PASS（连跑 3 次稳定；首次一次 4.5–9s 刷新延迟 flake 已由「按文案锁定弹窗 + 30s 等待」加固）
- [x] AC-3 `node e2e/run.cjs --only vault --instance pt-web` 全绿（PT 纯前端 ⇒ indexeddb 为预期）—— 17/17 PASS；另需先清 `fixture-web-split-st.zip` 类源包（否则阶段=scanned、仓不可见）
- [x] AC-4 tt-cdp 行的仓冒烟全绿，且有 TT 仓面板截图（`vault-tt-cdp-stored-*.png`）—— ttVaultSmoke PASS（backend=indexeddb、存入 1 条/后端 1 条/删除归零）；截图改为工作台元素截图避开真实聊天内容（P-11）
- [x] AC-5 `npm run e2e:instances` 全量 exit 0（含新增 vault 行）—— guard 21 · st 16+93+17 · luker 16+93+17 · pt 28+17 · tt-cdp smoke+vault 全绿（2026-10-26 15:25）
- [x] AC-6 `npm test` 零回归、五守卫全绿 —— 924 passed / 2 skipped；五守卫全绿
- [x] AC-7 spec 头注释记录两条判据理由：「为何不用 DOM 行数推断后端」「PT/TT 为何必然是 indexeddb」—— `e2e/specs/vault.e2e.cjs` 头部 + `guides/e2e-instances-runner.md`「仓（vault）行」节

## 约束

- 目标只在 Dev 白名单 `{8001, 8003, 8899}` + TT CDP `9223`（P-11 误连风险）。
- 仓数据是**测试写**：spec 开始时清空、结束时删除，不留残留（Dev 浏览器档案是持久的）。
- TT 的第三方扩展是**延迟激活**（冷启动 28.6–34.6s），仓冒烟必须复用已有的有界等待，
  不得再写「读一次即判死」。

## 范围外

- 不改仓的产品行为（除非 spec 暴露缺陷）。
- 不把 `10-26-host-vault` 的 research 脚本原地保留为第二实现（固化后删除该脚本）。
- 不做 Real 实例、不做 Authority 整包恢复端点（父任务 AC-6 治理项）。
