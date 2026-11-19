<!-- RULES-POINTER v1 -->
本仓工程规则唯一真源位于 `.trellis/spec/guides/`：`.trellis/spec/guides/rule-catalog.md`（30 条判据）、`.trellis/spec/guides/rule-details.md`（细则）、`.trellis/spec/guides/iron-rules.md`（会话注入铁律）、`.trellis/spec/guides/rule-triggers.md`（触发索引）。动手前先读，收尾前跑 `npm run verify:rules`（用法见 `.trellis/spec/guides/rule-catalog.md`）。
本文件只放指针、不复述真源条文；冲突以真源为准。

<!-- IRON-RULE:REPORT-ALL-WRITES v1 (2026-11-11 用户铁律，禁止删除) -->
# 铁律 0：任何配置写入与工具调用，必须全程出声（不可静默）

1. **禁止静默工具调用**：只要使用工具，同一条回复必须包含可读文本——说明“正在做什么、看到什么、下一步”，不得只发工具调用。
2. **写任何 AGENTS.md / GEMINI.md / harness 配置前**：必须先文字报备**绝对路径**、要改的内容、原因。
3. **写完必须立刻文字汇报**：实际写入结果、关键 diff 摘要，并**读回校验**（grep 到标记）。
4. 适用范围：pi / Codex / Gemini / Cursor / Copilot / OpenCode / DeepSeek 等全部 harness 指令文件；
   不含 Claude 类（CLAUDE.md / ~/.claude/**）。
5. 违反本条视为任务未完成；宁可不改，也不静默改。
<!-- /IRON-RULE:REPORT-ALL-WRITES -->

项目完整工程规则见仓库根 `AGENTS.md`。
