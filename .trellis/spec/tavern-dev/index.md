# 本项目分层规范入口（tavern-dev）

> 本文件是基石规则块「规范入口」指向的路径，聚合本仓全部分层规范索引。
> 基石 `rules_sync.py` 生成的 `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` 均引用本路径。
> 本文件只是索引，不放条文；规则唯一真源见下方「规则真源」一节。

---

## 规则真源

一次性读完，动手前先读，收尾前跑 `npm run verify:rules`。

- `.trellis/spec/guides/rule-catalog.md` —— 30 条规则判据（唯一真源）
- `.trellis/spec/guides/rule-details.md` —— 94 条技术细则（逐条挂规则 + 原文证据）
- `.trellis/spec/guides/iron-rules.md` —— 40 条会话注入铁律
- `.trellis/spec/guides/rule-triggers.md` —— 触发词索引（提到什么 → 读哪份规范）

---

## 分层规范索引

按本次改动所处的层，只读对应索引，不必通读全仓。

- `.trellis/spec/frontend/index.md` —— UI 层（组件、模板、样式、状态、宿主注入）
- `.trellis/spec/backend/index.md` —— 核心层（转换、检测、存储、宿主注入桥）
- `.trellis/spec/guides/index.md` —— 跨层指南（协作、测试、窗口、端口纪律）

---

## 使用方式

1. 先读「规则真源」四件套，建立判据与铁律的约束面。
2. 再按改动所处层读对应「分层规范索引」，顺着其中的表格进入具体规范文件。
3. 跨层 / 多宿主 / 实例测试类任务，额外读跨层指南索引。
4. 引用任何规范路径前先核实文件存在；声称完成前跑 `npm run verify:rules`，失败即未完成。

> 单一事实只在一处权威表述；同一路径的指针以本页为准，条文以规则真源为准。
