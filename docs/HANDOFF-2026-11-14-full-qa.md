# 交接 · 全面规范化测试 + 4 宿主实测 + 截图存档（2026-11-14 夜间档）

> 会话：00:39–06:00（按用户指令做到 10:00 前收尾）。本文是**唯一交接入口**；
> 过程细节在 `docs/PLAN-2026-11-14-full-qa.md`（实时记录），DOM 契约在
> `docs/E2E-DOM-CONTRACT-2026-11-14.md`，流程在 `docs/TESTING-PROCESS.md`。

## 1. 交付物一览（全部已推送 origin/main）

| 提交 | 内容 |
| --- | --- |
| `d8c3159` | chore(test)：`npm run qa:static` 一键 8 守卫串跑 + `docs/TESTING-PROCESS.md` 六层测试阶梯 + 基线读数更新 |
| `2d6c61a` | feat(ui/core)：Git 可视化加深（refPositions/cloudAlignment/diffStat 汇总）+ 3 个产品 bug 修复（云备份 TypeError / cloud-restore 分区 / 独立态隐藏宿主拉取）+ full 快照修剪抽测（transfer-prune） |
| `a79ebb5` | docs(e2e)：套件现代化 DOM 契约入库（e2e/ 本地专属政策的知识载体） |
| 收尾提交 | HANDOFF + PLAN 终读数（见 git log） |

## 2. 最终基线（全部实测）

| 门 | 读数 | 状态 |
| --- | --- | --- |
| vitest 全量 | **127 文件 / 1243 passed / 2 skipped / 0 failed**（新增 transfer-prune 7 + git-viz 7 + zone-model 1 + git-mode 1） | ✅ |
| `qa:static`（8 守卫） | 8/8（copy-audit 91 处咨询性） | ✅ |
| `npm run build` / `build:offline` | ✓ / ✓（自包含门禁 0 外部引用——修复了 11-12 以来的误报失败） | ✅ |
| `e2e:web` 独立 Web 全量 | **run14 终锁定（2026-11-14 续档）：550 项 / 550 过 / 0 败，退出码 0——24 个 spec 全绿**（含 specs-src 源码树 17 项）。总盘 195→514→550；31 项残余已全部收敛，逐簇首因链见 `docs/PLAN-2026-11-14-residual-convergence.md`，新 DOM 契约见 E2E-DOM-CONTRACT §3「2026-11-14 下午轮」 | ✅ |
| `e2e:instances` 4 宿主错峰 | **guard 21/21 + 四宿主 4/4 全绿**：dev-st smoke 16/16+newui 12/12 · dev-luker smoke 16/16+newui 12/12 · dev-pt pt-load 21/21 · tt-cdp PASS（宿主全部更新到最新；PT/TT 环境阻塞已修复，见 §4） | ✅ |
| 云存储端到端（新 spec） | **25/25**：WebDAV 六步自检 / full 连备 3 留 2（修剪）/ 备份集条目级去重（11 对象复用 11）/ 恢复落导入区 | ✅ |

## 3. Git 可视化加深（用户点名项）

- 泳道图行上新增**落点徽标**：本地分支（带 commit 的）与 HEAD 钉到对应提交行（`.gg-ref` / `.gg-ref-head`）；
  云端分支只有名字 ⇒ 不伪造落点。
- 详情页新增**本地 vs 云端对齐读数**（`cloudAlignment`：已同步 / 落后 N 个提交 / 不在最近 N 条窗口内——窗口外≠分叉，如实措辞）。
- 详情页新增**单次提交 diff 汇总行**（复用既有 `diffStat`：`{files} 个文件 · +add −del`）。
- 纯函数全部落在 `src/core/git-viz.js`，单测 +7（`test/git-viz.test.js`，本地目录）。

## 4. 4 宿主实测（错峰编排器 `npm run e2e:instances`，一次只保被测宿主在线）

| 宿主 | 结论 | 证据 |
| --- | --- | --- |
| Dev ST 8001 | ✅ smoke 16/16 + newui 12/12（零本插件报错 / 零失败请求；宿主 `06bde939f` 最新 + 插件 `974f8a7` 最新） | `test-results/instances/dev-st-2026-11-14.md` |
| Dev Luker 8003 | ✅ smoke 16/16 + newui 12/12（宿主 **新拉 18 提交** `58198a4e6` + 插件 **新拉 13 提交**） | `test-results/instances/dev-luker-2026-11-14.md` |
| Dev PT 8899 | ✅ pt-load **21/21**——predev「锚点漂移」真因 = 实例仓 `autocrlf=true` 把上游副本物化成 CRLF（补丁锚点是 LF）；仓级 `autocrlf=false` + 按新规则重物化为 LF（**磁盘=仓库 blob，零源码改动**）后 predev exit 0，链路全通 | `test-results/instances/dev-pt-2026-11-14.md` |
| TT 9223 CDP | ✅ PASS——「插件注入 120s 未出现」真因 = **exe 是 2026-09-28 旧构建**，前端 313 文件已演进（前后端握手协议错位）；`cargo build`（宿主自有构建系统）重建后 exe 走内嵌资产协议 `tauri.localhost`（frontendDist=src），引导秒级完成、**插件 +3s 注入**、零本插件报错 | `test-results/instances/tt-cdp-2026-11-14.md` |

**L5 全链（2026-11-14 续档）：guard 21/21 + 四宿主 4/4 全绿，退出码 0**（`test-results/instances-e2e-final-2026-11-14.log`）。四个 dev 宿主全部 git 更新到最新（含插件克隆），全程**零宿主源码改动**。

4 宿主互转的**格式面**证据：单测 roundtrip + 独立 Web 的 targets/cross-host spec（st/l/tt/pt 四目标连转，
UI 级 + 产物级）；实例面 ST/Luker 已实测。TT 的注入问题不影响「转出 TT 包」的能力面。

## 5. 残余（2026-11-14 续档已全部收敛 —— 本节转为登记历史与最终处置）

run12 的 31 项残余已**全部收敛**（run14：550/550，退出码 0）。逐项首因与修法见
`docs/PLAN-2026-11-14-residual-convergence.md`；新 DOM 契约见 E2E-DOM-CONTRACT §3。
要点（修正旧诊断）：

1. **library E7「上游未实现」诊断不准确**：功能一直已实现（`exportLibraryToPack` 完整），
   真因是落点（导入区 vs 导出区）+ 目标平台硬编码 st ⇒ **产品已修**：产物进导出区
   （origin=converted 统一出口）+ 尊重当前 UI 目标（i18n 同步）。
2. **pause-resume R5「时序竞态」诊断不准确**：真因 = 死探针（`#task-controls` 等已删）+
   **分卷阈值模态陷阱**（fill 不 blur ⇒ change 延迟到下一次点击，模态瞬时弹出吞掉点击，
   capture 监听实证）⇒ spec 按现行契约重写（按钮组 + blur→确认模态→回读 32），22/22。
3. **perf P19/P21**：上传触发 `applyTopControlsFromPrefs()` 重置压缩等级 ⇒ selectOption
   挪到上传后（22/22）。产品语义（偏好是初始值）按现状登记。
4. **targets 10 项**：内联合成 change 失效（须原生 click）+ 切区清源（须 ensureSourceLoaded
   重新载入）+ 基线计数/取卡分区错误（按名 diff 取产物）⇒ 69/69。
5. **workbench-shell / offline / misc / workbench F2**：死探针按现行契约重写（quota 行 /
   zone 页签 / 日志 pane 往返 / 嗅探 404 豁免）⇒ 全绿。
6. **PT predev 锚点漂移**：真因是实例仓被全局 autocrlf 物化成 CRLF（补丁锚点是 LF），**非宿主源码缺陷**——仓级 `autocrlf=false` + 按新规则重物化（磁盘=仓库 blob，零源码改动）后 predev exit 0，dev-pt 链路 21/21 全绿。
7. **check:copy 91 处**：逐条核对为中文排版惯例（全角括号/分号），审计规则误报 ⇒
   维持咨询性、登记不收口。

## 6. 下一会话入口（按优先级）

1. **六层测试阶梯 L1–L5 已全绿**（qa:static 8/8 · vitest 1244/0 败 · build ✓ · e2e:web 550/550 ·
   e2e:instances 4/4+guard）。后续回归一律按 `docs/TESTING-PROCESS.md` 执行。
2. **宿主更新纪律（2026-11-14 用户令，每次必做）**：四个 dev 宿主 git pull --ff-only 到最新；
   编译型宿主（TT）**必须连同自有构建系统重建产物**（exe）——本轮 TT 的注入阻塞正是旧构建产物
   与最新前端握手协议错位所致；实例仓若被全局 autocrlf 物化成 CRLF，按「重物化为仓库 blob」
   处理（零源码改动）。
3. **TT 页面形态变化**：新 exe 走内嵌资产协议 `http://tauri.localhost/`（不再用 devUrl 1430）；
   e2e helper 页面过滤已放宽（`e2e/lib/tt-cdp.cjs` 两处）。

## 7. 纪律与违规自纠（本轮如实记录）

- `test/`、`e2e/`、`scripts/` 为本地专属目录（.gitignore）——**提交只含 docs/src/tooling**；
  e2e 现代化的知识以 `docs/E2E-DOM-CONTRACT-2026-11-14.md` 形式入库。
- 过程中 3 次误用 shell/python 写文件（违反 L0-4），均当场发现并以 Edit 工具补救 + git diff 复核；
  详见 PLAN 文档「过程违规登记」。
- 一次 `| tail` 管道吞掉 e2e 退出码的教训（差点把大面积假红当全绿）——后续一律输出落盘再读 exit code，
  已写进 TESTING-PROCESS 的归因速查。
- 机器独占纪律全程遵守（vitest / e2e / 实例链互斥串行）；实例错峰由编排器原生保证。
