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
| `e2e:web` 独立 Web 全量 | **300 项 / 261 过 / 39 败**（从 63 败修到 39；核心重写区全绿，残余见 §5） | ⚠ 残余 |
| `e2e:instances` 4 宿主错峰 | guard 21/21；**Dev ST smoke 16/16 + newui 12/12**；**Dev Luker smoke 16/16 + newui 12/12**；PT/TT 环境阻塞（§4） | ✅(2/4)+⚠(2/4 环境) |
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
| Dev ST 8001 | ✅ smoke 16/16 + newui 12/12（零本插件报错 / 零失败请求） | `test-results/instances/dev-st-2026-11-13.md` |
| Dev Luker 8003 | ✅ smoke 16/16 + newui 12/12 | `test-results/instances/dev-luker-2026-11-13.md` |
| Dev PT 8899 | ⛔ **实例仓环境阻塞**：`apps/web` 的 predev（prepare-legacy-runtime.mjs）锚点漂移「expected exactly one anchor, found 0」——宿主源码问题，按 L0-1 禁改，**如实登记不动** | `test-results/instances-e2e-2026-11-14.log` |
| TT 9223 CDP | ⚠ 环境修到最后一层：pnpm workspace 依赖装好后 dev-server(:1430) + tauritavern.exe + CDP(:9223) 全部拉起，但插件注入 120s 未出现（`hasTauriTavernGlobal:false` 等）——TT 运行时侧排查，见 §6 | `test-results/instances/tt-cdp-2026-11-13.md` + 截图 |

4 宿主互转的**格式面**证据：单测 roundtrip + 独立 Web 的 targets/cross-host spec（st/l/tt/pt 四目标连转，
UI 级 + 产物级）；实例面 ST/Luker 已实测。TT 的注入问题不影响「转出 TT 包」的能力面。

## 5. 残余（如实登记，未修完）

1. **e2e:web 39 项残余**：最大簇 = cross-host 16 路径矩阵的转换段（selectTarget 已通、转换未出产物，
   需带 `#log-lines` 倾当面查）；其余为 library-export E7、split G4、offline O14/O15、s1 H3 等次级断言。
   全部映射与口径见 `docs/E2E-DOM-CONTRACT-2026-11-14.md` §3。
2. **PT 宿主 predev 锚点漂移**（实例仓源码，禁改域）；**TT 插件注入**（运行时侧）。
3. `check:copy` 91 处文案待收口（咨询性，不阻塞门禁）。

## 6. 下一会话入口（按优先级）

1. cross-host 转换链：`node e2e/standalone/run.cjs --only cross-host --no-build`，在 per-target 循环倾倒
   `#log-lines`，先看 C-st->st 一条为什么不出产物（convert 报错会进日志面板）。
2. TT 注入：CDP 已通；对照 `e2e/lib/tt-cdp.cjs` 的 `ensureInstalled`（插件拷到 APPDATA
   `com.tauritavern.client/data/default-user/extensions/ST-pack-transfer`）与 TT debug exe 实际加载目录；
   截图在 `test-results/instances/tt-cdp-2026-11-13.png`（用户令：不读，留给有视觉判断需求的人）。
3. PT 宿主：锚点漂移需 PT 仓侧修复（上游或本地补丁），修复后 `npm run e2e:instances --only dev-pt` 与
   `npm run shots:instances --only pt-web` 即可补齐。
4. e2e:web 残余 39 项按 §5 逐条收敛。

## 7. 纪律与违规自纠（本轮如实记录）

- `test/`、`e2e/`、`scripts/` 为本地专属目录（.gitignore）——**提交只含 docs/src/tooling**；
  e2e 现代化的知识以 `docs/E2E-DOM-CONTRACT-2026-11-14.md` 形式入库。
- 过程中 3 次误用 shell/python 写文件（违反 L0-4），均当场发现并以 Edit 工具补救 + git diff 复核；
  详见 PLAN 文档「过程违规登记」。
- 一次 `| tail` 管道吞掉 e2e 退出码的教训（差点把大面积假红当全绿）——后续一律输出落盘再读 exit code，
  已写进 TESTING-PROCESS 的归因速查。
- 机器独占纪律全程遵守（vitest / e2e / 实例链互斥串行）；实例错峰由编排器原生保证。
