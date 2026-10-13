# 规划依据与授权记录

## 来源

- 最新 Claude 原始会话：ef2e5dab-7304-4d9d-88ad-d3ad7e7f4a2f，2026-09-29 20:57（Asia/Shanghai）。本轮由项目范围 trellis mem list 定位，再读取 JSONL 文本与真实问答结果。
- 2026-10-01 已逐组记录 18 项产品决定；随后重问的两项明确批准：新建独立产品化任务、仅限规划文档变更。
- 旧父任务 research/2026-10-01-productization-decisions.md 是访谈过程记录，其“最后两题未返回”描述的是批准前时点；本任务是批准后的正式规划承接，不重新改写旧历史。
- 当前产品代码基线 167796d；本轮未重新运行产品测试，也没有实例端操作。

## 两项最终授权

1. 新建独立产品化 planning 任务，旧同步任务及已归档修复保留。
2. 允许修改本项目 .trellis/workflow.md 的规划问答约定与 .trellis/spec/frontend/index.md 的索引，新增任务规划与三份目标规范；不改产品代码、不启动实施、不提交推送。

## 搜索与复用

此前本次规划会话已完成双通道检索，均返回 HTTP 200：
- GitHub API 仓库检索 backup restore browser，命中 https://github.com/emuell/restic-browser 等；仅作为“浏览内容再恢复”的交互参考，未采纳其技术栈，也未完成代码/许可证适配评估。
- https://www.nngroup.com/articles/ten-usability-heuristics/：状态可见、用户控制、错误预防、识别而非记忆、从错误中恢复。

首选复用本仓已有转换引擎、计划扫描、TaskManager、ExportQueue、唯一模板和存储适配，不新增依赖。

## 当前代码证据

| 证据 | 说明 |
| --- | --- |
| src/ui/category-filter.js:22-36 | 既有选择键和默认值，产品化必须区分用户意图与有效选择 |
| src/core/task-manager.js:26-32、89 | 唯一执行状态机与 start 控制面，不新造同类引擎 |
| src/storage/db.js:10-17、338-354 | v2 三 store、active_session 的读写边界 |
| src/core/plan-preview.js:112 | generatePlan 已有扫描/计划能力 |
| src/core/report.js:59 | 既有 Report，不将转换报告直接冒充目标核对证据 |
| src/ui/export-queue.js:89 | 既有交付队列，三类交付可复用 |
| index.html:18-37 | 单一模板与 file:// 提示，不是双击可运行产物 |
| README.md:56-59、98-100 | 纯库接口未落地与离线形态限制已有明确披露 |

## 真实能力与拟定契约的边界

三份迁移 spec 均标注“目标契约、尚未实现”；createMigrationPlan、evaluateWriteGate、assessRetry 及拟新增测试只是规划签名。
本轮不把文档校验通过当作产品功能或宿主兼容通过。具体矩阵/操作证据归后续 S0，不能用助手推断替代。

## 后续只读起点

先细化 implement.md 的 S0 能力/范围/重试证据，再展开 S1 的独立子任务；不直接运行总任务代码计划。
本任务使用 --no-start 创建，旧任务指针保持不变。继续本规划时请显式读取本目录，而不是按旧指针执行实例灌入。

## 本轮规划验证（2026-10-01）

- task.py validate：implement.jsonl 与 check.jsonl 各 7 条真实上下文，通过。
- get_context.py --mode phase --step 1.1：实际输出本项目每轮 2–3 个关联问题约定；planning / planning-inline 两个提示块同步保留评审门。
- 文档静态校验：需求 R-01～R-13 与验收 AC-01～AC-15 齐全；本地链接存在，无占位词或行尾空格；三份新规范各小于 32768 字节，所选上下文与任务三文档合计小于 131072 字节。
- AC-15 仅代表本轮问答工作流文档交付已核验；AC-01～AC-14 和 S0～S7 的产品实施项仍未勾选。
- 已逐项审阅新增文件 diff，以及 workflow.md / frontend/index.md 的块级差异；git diff --check 通过。
- HEAD 仍为 167796d，暂存区为空，产品路径无改动；未运行 npm test/build/E2E，未操作实例、提交或推送。
