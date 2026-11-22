# PLAN 2026-11-21 凌晨全量质量会战（分支归一 + 测试 + 四宿主 + 多模态）

> 主人指令：继续 trellis；全部自动化测试；全部规范化；功能正常；4 宿主测；遵循铁律；
> 10+ 子代理并发；主代理多模态验证 + 全部截图；全部同步更新；改动全部到 main；
> 其他分支合并进 main 后删除，禁止任何其他分支；做到 09:30 收尾交接。

## 验收标准（不得留空）

- [x] A1 `git branch -a` 仅剩 `main`（本地+远程），`rules/zcode-session-iron-rules` 已合并并删除。（02:30 完成）
- [x] A2 `npm test` 全绿：**1699 passed / 14 skipped / 0 failed（1713 用例 / 172 文件）**；css-scope / dom-injection / template-source 全绿。（02:59 实测）
- [x] A3 四份审计报告产出，发现项全部处置：verify-core（9 VULN 矩阵→全修）/ verify-rules（HIGH 守卫盲区→scout-P 封堵）/ verify-docs（6 缺漏→R3 全修）/ verify-ui-redteam（P0×2→R4 修复）；红队终审交叉证伪再修一轮。
- [x] A4 四宿主探测报告产出：ST✅ Luker✅ 端点差异核实；TT❌PT❌ 实例环境问题已留档待主人裁定（修复触实例目录红线）。
- [x] A5 多模态截图：18 张全场景 + 17 张修复导航后重拍 + 6 张对外审核（好包），ui-multimodal-judge 两轮分块判读。
- [x] A6 判读问题处置：P1-2/P1-3 确认修复勾销；体检弹窗 P0×2 修复；6 张采集失效→scout-Q 导航修复重拍；P1-4 等登记待办。
- [x] A7 文档同步：DEVELOPER-GUIDE/README.en/privacy 中英/AGENTS.md/新 HANDOFF 全部落盘并于同批提交。
- [x] A8 提交 `dd6c255` 推送 origin/main（27 文件 +993/-92）；`git status` 干净；verify:rules 全部 MUST 通过。
- [x] A9 交接文档 docs/HANDOFF-2026-11-21-quality-pass.md（git add -f）落盘推送；mini-trellis 会话记录完成。

## 任务清单（实时勾选）

- [x] T0 态势勘察：时间/分支/角色名册/规则真源（02:24 完成）
- [x] T1 分支归一：merge rules/zcode-session-iron-rules → main，删本地+远程分支，推送（02:30 完成，ff 合并 5 提交/157 文件）
- [x] T2 落盘本计划文件（本文件）
- [x] T3 蜂群第一轮并发派发（02:35，13 个并发：8 只读审计 + 5 独占写手 scout-A~E）——**03:00 全部 13/13 回收**
  - 审计：verify-test（1699 passed/14 skipped/0 failed，172 文件）/ verify-core（待回收）/ verify-rules（CRITICAL×2 已被写手修复、HIGH=Vue scoped 守卫盲区）/ verify-docs / verify-ui-redteam（P0×2 体检弹窗）/ host-probe（ST✅ Luker✅ TT❌ PT❌）/ pack-forensics（vendor 零改动✅）/ repo-cartographer（disposeSettingsPanel 漏接发现者）
  - 写手分区全绿回收：issue-report.js(VULN-03/07/08)✅ / logger.js(VULN-01/02, 30 passed)✅ / index.js(前置勾选兜底+死代码, 51 passed)✅ / test/issue-report-security.test.js(新, 14+1skip)✅ / 规则口径(.cursor+rule-catalog, 95 条核实)✅
- [x] T4 主代理：起 dev server（独立进程，端口 3040，探活 200）
- [x] T5 主代理：浏览器多模态截图（≥5 张）——18 张全场景有效（dist 02:31 vite build 真成功）✅；**对外 review-shots 6 张判无效重拍中**（build:offline 02:41 实为崩溃被 `| tail -3` 管道掩盖 exit 0，download/ 停留 Nov 20 旧文件，已 03:15 重跑全量留档）
- [x] T6 派 ui-multimodal-judge 判读截图（03:30 回收）：**P1-3 教程气泡遮挡确认已修复**✅ / P1-4 桌面留白仍存在（P2）/ P1-2 Unverified / **截图管线失效 P1**：06/07/08 三图 MD5 相同、09 缺问题报告表单入镜、12/13 误捕迁移页——scout-Q 修复采集导航中
- [x] T6b judge 复判读完成 ✅：**P1-2 最终判定已修复**（17-mobile-extmgr 操作栏横排单行）→ PLAN-2026-11-20 P1-2 勾销；13-settings 表单排版正常解除 Unverified；三个文案疑点经 grep 全部澄清为判读分辨率误读（零笔误）；新增仅 2 条 NOTE（低对比禁用态，倾向非缺陷）。红队终审完成 ✅（交叉证伪）：**P0-1 PEM ENCRYPTED 缺失+多行主体泄露（必修）**、P1-1 Error.cause 栈溢出、P1-2 语义色绑宿主随机令牌、P2×6；大量方面获「未发现问题」背书（JWT/路径正则/单一出口/dispose 链/emits 链/表格注入面）；**P0-2 新用户无 PAT 录入入口→转主人裁定**（上一会话「不放令牌框」明令的既有设计，非本会话回归）→ 蜂群第六轮 4 写手并发修复中（scout-R PEM+cause / S 语义色 / T splitCells+title / U define注释+normalize）
- [x] T7 蜂群第二轮并发派发（02:45，5 写手 + 判读员）：R1 no-bundler 白名单 ✅（守卫 exit 0 / 8 passed）/ R2 GEMINI.md 对齐 ✅（根因 CRLF/LF，tavern-block PASS）/ R3 文档同步大包 ✅（docs-privacy + docs:verify 全 PASS）/ R4 体检弹窗 P0×2+P1（跑）/ R5 UI P2 三连（跑）
- [x] T7a 蜂群第三轮并发派发（03:05，3 写手）：K1 logger JWT/PEM ✅（31 passed）/ K2 环境块围栏转义 ✅（65 passed）/ K3 provenance 真实性 ✅（14 passed，连带 issue-report.js:462 黑名单缺口已由主代理单行补齐）
- [x] T7b 蜂群第四轮：scout-N 修复 build-offline.mjs 崩溃 ✅（+4 行接 plugin-vue，NODE_EXIT=0）；**连锁白屏 P0 主代理修复**：新包 file:// 整页白屏（诊断脚本实证 ReferenceError: process is not defined，306 处 process.env.NODE_ENV 未替换），build-offline define 补 'production' 后复建复诊中
- [x] T7c 蜂群第五轮：R4 体检弹窗 P0×2+P1 ✅（双报告互斥/z-index 10050/11 令牌，7 passed）+ scout-O index.js 同源统一 ✅（composeIssueReport 单一出口，51 passed，空 catch NO_RESIDUAL）+ scout-P css-scope 扩展 .vue 扫描 ✅（scoped 合法/非 scoped 按铁律 7，25 选择器全绿，20 passed）——守卫盲区封堵
- [x] T7d scout-Q 截图采集导航修复 ✅（shotWhenReady 断言机制；07/08 MD5 互异、13-settings 表单入镜、17-mobile-extmgr 真到达；06 host 态采集环境不可达按设计 WARN 跳过；附带发现 11/12-transfer 同 MD5 登记待办）
- [ ] T7b 蜂群第三轮预案：css-scope 扩展 .vue 扫描 + index.js 预览/提交同源统一 + 空 catch 清理（等 R4 退场防冲突）
- [x] T8 复测：npm test + 守卫复跑，数字回填——**终版 1727 passed / 15 skipped / 173 文件全绿（TEST_EXIT=0）**；守卫 10 项 PASS；verify:rules 全部 MUST 通过（tests-tracked 提交后清零）
- [x] T9 文档同步（DEVELOPER-GUIDE / README / privacy 中英 / README.en 特性 / AGENTS.md 数字）+ 提交推送——**dd6c255 已推 origin/main（27 文件 +993/-92）**
- [x] T10 收尾：交接文档 docs/HANDOFF-2026-11-21-quality-pass.md + mini-trellis 记录

## 时间盒

- 02:24 开工 → 09:30 收尾交接；08:45 后不再开新修复面，只收口验证与文档。

## 硬约束（全员）

- 单命令 ≤10 秒；全量测试后台跑只看末行；禁 shell 写源码；禁整文件覆盖；
  删除走回收站/归档；UI 改动必须截图核验；一切产出进 main。
