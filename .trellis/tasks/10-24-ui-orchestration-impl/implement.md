# 执行计划：UI 编排实施（A 线）

> 复选框随执行实时勾选（L0-2）。基线：`npm test` 865 passed / 2 skipped / 0 failed（2026-10-24）。

- [x] 1. R-A4 detectHost 注册表 + tt/pt 接入 + 消费点过堂 + 单测 —— 2026-10-24 完成
  （HOST_REGISTRY 数据化；`detect-host.test.js` 30/30，含 tt/pt/跨族冲突/alien→unknown）
- [x] 2. R-A1 分组列表 —— 完成：`groupStashFiles`/`groupQueueItems` 纯函数 + 组头三态 +
  `groupBy=null` 回退 + CSS；列表测试 30/30（排序 rank 修正：数字+字符串拼接 NaN 坑）
- [x] 3. R-A2 帮助层 —— 完成：`src/ui/help-topics.js`（HELP_TOPICS 8 主题 + mountSectionHelp
  幂等注入，认 .wb-sec-head 与 .inline-drawer-header 两种标题栏）；守卫 `help-topics.test.js` 5/5
- [x] 4. R-A3 铁律 —— 完成：`ui-orchestration-rules.md`（布局/控件/文案/帮助四节 + 动词封闭集）
  + index 登记 + `ui-verb-table.test.js`（模板面+模块生成面，符号豁免）
- [x] 5. R-A5 拉取前预览 —— 完成：`describeHostFetchPlan` 纯函数 + 模板预览行 +
  index.js 确认步（续传跳过）+ 登记（template-source 54 节点 / control-consumer 46 条）+ 单测 4 项
- [x] 6. R-A6 纯本地 IO 审计 —— 完成：`research/local-io-audit.md`（回退链逐路径 +
  唯一高危缺口=拉取内存回退 + 3 项优化登记）
- [x] 7. E2E —— 完成：`s1-remedies.e2e.cjs` 扩至 **25/25**（帮助层 F/预览行 G/分组 H1-H7）；
  **连带抓出真缺陷**：done 门控藏打包区 ⇒ 首转后无法换目标连转（`workbench-layout.js` 修正，
  done 保留 options）；顺带复活 targets/cross-host 两个陈旧 spec（radio→枚举下拉，默认值变更如实断言）
- [ ] 8. 收口：`npm test` 零回归 + 五守卫 + `e2e:web` 全绿 + 截图 + flash 子代理视觉复审 + 提交推送
  - [x] `npm test` 全绿：**892 passed / 2 skipped / 0 failed**（基线 865，+27 新增）
  - [x] 五守卫全绿（css-scope / dom-injection / template-source / control-consumer / dom-scope）
  - [x] 全量 `e2e:web` exit 0（含复活的 targets 四目标连转 / cross-host）+ s1-remedies 25/25
  - [x] flash 视觉复审 —— 2026-10-24 完成（第 3 次派发成功；前两次撞用户级并发上限）。
    **高危三条处置**：① 长页背景上下断层＝**fullPage 截图下 fixed 伪元素只按视口合成的拼接伪象**
    （真实滚动恒铺满）——仍修掉：独立态容器自身也铺 `--bg-primary`（同色双保险，打印/截图场景不再露
    body 白底），修后复验整页统一 `#1A1B1F`；② 行菜单"右下锯齿轮廓"＝dropzone 虚线边框误报 +
    菜单本体低对比（继承主题令牌的既有形态，E2E 已证几何正确）——登记不改；③ 320px 包名输入截断＝
    input 内容超宽的正常行为（可滚动），类目省略号与置灰行偏暗＝既有低优先级打磨项，登记不阻塞。
  - [x] 提交推送

## 风险文件

- `src/ui/stash-list.js` / `export-queue.js`（多消费点共享，改前 grep 消费面）
- `src/ui/host-bridge.js`（detectHost 返回集扩大后，所有 switch/if 消费点）
- 回滚点：每个 R 独立提交；`groupBy=null` 是分组开关内置回退。
