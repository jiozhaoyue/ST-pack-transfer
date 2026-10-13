# 迁移核对证据构造与重试候选（S4 剩余项）

> 父任务：`10-01-safe-migration-productization`。把 `index.js` 内联的 `buildRestoreVerification`
> 抽为**可单测的纯模块**，并补齐 S4 契约的两块纯逻辑（`migration-safety-and-evidence.md` §3.3/§3.4）。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R1 | 把 `index.js` 内联的 `buildRestoreVerification` 抽到 `src/core/migration-verification.js`（纯逻辑，可单测）。 |
| R2 | `summarizeVerification`：按 `method`（automatic / user-attested）与 `status` 汇总，供界面**分别呈现**机器核对与人工确认。 |
| R3 | `selectRetryCandidates`：**双重门**——① 逐项 `assessRetry`（证据驱动）；② 整体**重新过写入门**（重试不绕门）。 |
| R4 | 如实登记「**自动全量读回核对**」仍受宿主能力阻断（无「列用户文件」端点）。 |

## Acceptance Criteria

- [x] AC-1（R1）：`buildRestoreVerification` 三形态（不可解析 ⇒ unknown / 零写入 ⇒ failed / 确认写入 ⇒ confirmed 且 reason 明示「未逐条读回核对」）单测覆盖；`index.js` 不再内联。
- [x] AC-2（R2）：空证据 ⇒ total 0 / coverage unknown；混合 ⇒ 分别计数且 coverage `mixed`；全 full ⇒ `full`。
- [x] AC-3（R3）：无可重试项 ⇒ 不请求写入门（`gateAllowed:false`）；有候选且门放行 ⇒ 返回候选；**有候选但门不过（无备份）⇒ 候选为空**（判别力）。
- [x] AC-4（R4）：`docs/DEVELOPER-GUIDE.md` / 规范如实登记。
- [x] AC-5：`npm test` 零回退；五守卫 + build + build:offline + 独立形态 E2E 全绿。

## 范围外

- 宿主侧**自动全量读回核对**与**自动重发执行**（均需目标侧读能力 / 重试 UI）——判定层就绪，执行待接。
