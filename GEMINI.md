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

---

项目完整工程规则见同目录 `AGENTS.md`（本文件只承载上述铁律 0，避免依赖符号链接或 `@` 引用）。

<!-- TAVERN-RULES:START v3.0.0 -->
<!-- 本块由 tavern-harness/scripts/modules/rules_sync.py 自动生成，请勿手动编辑 -->
<!-- 真源: tavern-harness · registry/rules.json · 类别 dev · v3.0.0 -->
<!-- 同步时间: 2026-11-19T12:58:50Z -->
<!-- 内容哈希: sha256:b6c5455c7a9f3b115aa0dc7a47e21df547a63715ece8813657661a4b0e397333（仅覆盖规则正文，不含头部与项目覆盖） -->
# 统一开发规则（v3.0.0 · 酒馆开发）

> 本块由 tavern-harness 生成，请勿手改正文。
> 规范全文在 `.trellis/spec/`；项目特例写文末「项目覆盖」。

## 通用红线

- **G-01** 需要用户决策时用问答工具，一次聚合多个问题；重大设计多轮问答。
- **G-02** 任何工具调用前先输出可见短汇报；禁止无文本直接调工具。
- **G-03** 多项改动先落计划文件；验收标准不得 TBD；执行中实时勾选。
- **G-04** 用文件实时记录进度与交接；丢弃 AI IDE 上下文后可续跑。
- **G-05** 独立任务并行发起；命令非阻塞；禁止空等与轮询。
- **G-06** 子代理任务自包含；模型与并发由用户裁定；阻塞宿主不开子代理。
- **G-07** 删除、覆盖、装依赖、大重构、对外写操作前必须显式授权。
- **G-08** 删除一律走回收站或归档；禁止用命令直接删除。
- **G-09** 变更用 diff 与块级编辑；禁整文件覆盖与 shell 重定向写源码。
- **G-10** Git 只用显式 pathspec；提交前校验暂存区；完成即推 origin。
- **G-11** 交付物零凭据、零隐私、零真实数据、零本机绝对路径。
- **G-12** 先检索复用；UI 复用设计系统；DB 复用 schema 与迁移；不自造。
- **G-13** 运行时零 CDN 与网络引用；无法本地化须说明并隔离。
- **G-14** 脚本禁硬编码业务数据；路径、端口、URL、阈值一律读配置。
- **G-15** 一仓一份脚本目录；模块登记；中控统一派发；禁一次性脚本。
- **G-16** UI 文案短；禁长句、合并连词、分隔符、括号说明、说明性副标题。
- **G-17** UI 布局紧凑；禁大间隔、大空白、横竖颠倒；改动必须截图检查。
- **G-18** UI 区域用阴影或色差区分；禁线条分割、边框滥用、卡片套卡片、中控台风格。
- **G-19** 异步等待必须有界；Worker 终止后置空；高频 DOM 更新用 rAF 合帧。
- **G-20** 耗时操作有进度与结果；失败不静默、不整体中断。
- **G-21** 发版前测试全绿、零回归；未验证项不得写成已验证。
- **G-22** 改前读 spec；复杂功能先写设计再写代码。
- **G-23** 文档、注释、回复用中文；代码标识符与专有名词除外。
- **G-24** 工作流改动覆盖 skills、MCP、agent、配置文件与 TDD，并留验证证据。
- **G-25** 单一真源；禁散落规则与副本；规范入 spec，注入只留短摘要。
- **G-26** 任何完成声明必须有可复现证据；未验证项如实标注。
- **G-27** 多事项物理分行；禁连词、分隔符、括号合并；单项断言独立成行。
- **G-28** 对话正文不贴完整文件内容；落地文件，只给可点击路径。
- **G-29** opencode/workbuddy 会话必须用子代理多并行推进；禁止主代理单干。
- **G-30** 子代理必须使用免费模型；调用前实时查询注册表并确认 cost 输入输出均为 0；禁止误用付费模型。
- **G-31** 输出与工具调用禁止简写；禁止把用户简写直接当作具体模型、工具、仓库或路径名。
- **G-32** 禁用 checkout --/restore/reset --hard/clean -fd 回滚未提交改动；回滚前先 stash 或备份并报备路径。（来源 ST-pack-transfer/iron-rules#40）
- **G-33** dev server 等长驻服务用系统命令起独立进程（Start-Process/nohup/setsid），禁用 agent 内置后台 shell。（来源 ST-pack-transfer/iron-rules#38）
- **G-34** 读数/体积/进度同源实时可复核；读不到显示「未提供」，禁假 0/假缓存/假成功。（来源 ST-pack-transfer/iron-rules#5）
- **G-35** 禁重复造轮子：通用算法/格式/API 封装优先用三方库或仓内去重，自写仅限业务逻辑。（来源 ST-pack-transfer/quality-guidelines 三方库规范）
- **G-36** 主代理只兜底：全局调配、仲裁、进度勘察、多模态复核；子代理不可用时才亲自实现。（来源 ST-pack-transfer/subagent-collaboration#G-8）
- **G-37** 派发角色按内置→仓内专用→主代理亲自三级顺序选，不跳级；亲自做须记降级原因。（来源 ST-pack-transfer/subagent-collaboration#G-10）
- **G-38** 仓内专用角色统一入库（.zcode/agents/*.md）、纳入 git、随时可调用；禁散落临时目录。（来源 ST-pack-transfer/subagent-collaboration#G-11）
- **G-39** 每个子代理独占产出文件；同一文件同一时刻只有一个写者；只读角色只给读工具。（来源 ST-pack-transfer/subagent-collaboration#G-12）
- **G-40** 一轮并发派发多角色子代理成蜂群，主代理同轮推进自身工作；禁串行接力、禁 wait/轮询空等。（来源 ST-pack-transfer/subagent-collaboration#G-9）

## 酒馆开发红线

- **D-01** 宿主差异只进单一 host-bridge；业务层禁宿主名判断。
- **D-02** 注入样式双前缀；禁全局选择器；配色继承宿主变量。
- **D-03** 纯前端主路径闭环；后端只作可选增强，适配器加特性检测加静默降级。
- **D-04** 跨宿主插件禁用宿主补丁桥；只用可移植子集并标注可用性。
- **D-05** API 事实以官方文档为准；禁翻宿主源码找内部 API。
- **D-06** UI 落点只认官方文档；设置页只放设置；复杂 UI 用官方 Popup 与 RENDERED。
- **D-07** 安装后即可用；第三方库本地 vendor；不得要求用户构建。
- **D-08** 插件可独立运行；无后端、离线、卸载后仍可用。
- **D-09** 发版前跑项目测试与产物校验；E2E 只对 Dev 实例。
- **D-10** 开源基线：零隐私、零凭据、真实数据隔离；提交用隐私邮箱。
- **D-11** 扩展目录按宿主约定；Luker 用户扩展平铺，禁嵌套 third-party。
- **D-12** 前端性能有预算；交互反馈、首屏、拉取时间在 Dev 复测并留数字。
- **D-13** 动手前先盘点宿主原生能力（拉取/上传/下载/扩展管理/存储/通知），原生已实现的不在插件内重造，并发时宿主优先。（来源 ST-pack-transfer/iron-rules#28）
- **D-14** 同一作者/仓库只允许一个安装 URL；禁本地链接，一律 remote link；私有仓提示需登录。（来源 ST-pack-transfer/iron-rules#32）

## 规范入口

- `.trellis/spec/tavern-dev/index.md`

## 技能策略

- 允许 pack：dev, upstream
- 禁止 pack：card, infra

## 项目覆盖
（本仓自有内容，同步器保留；无则留空。）

- 规范入口覆盖：基石「规范入口」指向的 spec 根在本仓未随基石同步落地；本仓实际分层规范索引为
  `.trellis/spec/frontend/index.md` / `.trellis/spec/backend/index.md`，规则判据为 `.trellis/spec/guides/rule-catalog.md`。

<!-- TAVERN-RULES:END -->

<!-- AGY-SWARM-PROTOCOL:START v1 (2026-11-18 用户明令·AGY专属协议) -->
## AGY 专属多智能体协同与模型隔离协议 (AGY-ONLY)

> 本协议仅供 Google Antigravity (AGY) harness 读取与执行；与其他 agent harness 严格隔离。
> 真源规范遵循 `.trellis/spec/guides/subagent-collaboration.md`。

### 1. 免费轻量模型强硬绑定 (MUST)
- AGY 内派生多智能体时，必须显式绑定平台免费轻量模型：`model: "agb-b0fb137c-high"`（Display Name: `opencodego/hy4-flash-free (High)`）。
- 派生前查验 `swarm(action="models", all=true)`，严禁调用未授权的付费大模型。

### 2. 身份分立与红队交叉找茬机制 (MUST)
- **主代理（Coordinator）职责**：专职全局调度、流程编排、以及**多模态分块截图深度兜底审查**；非必要不下场编写细节业务逻辑。
- **子代理必须身份分明**：
  1. `auditor`（审计专员）：全量普查相关代码与界面清单，禁止空泛遍历。
  2. `packmod` / 功能专员：负责专项功能或弹窗重构实施。
  3. `reporter` / 结果专员：负责报告、日志与结果反馈界面的优化。
  4. `nitpicker`（红队质检员）：专门反向挑刺，审查破坏性场景、极端小屏溢出、全局样式污染、内存与超时风险，对其他专员方案进行交叉证伪。
- 严禁单一代理自说自话，重大改动必须经过红队找茬交叉验证。

### 3. 宿主与独立 Web 扩展更新二分法 (MUST)
- **宿主环境**：能用宿主就用宿主，一律经 `host-bridge.js` 调用宿主原生扩展安装/更新端点。
- **独立 Web 模式**：扩展更新与补全必须走内置纯前端 Git 抓取链路（`src/core/repo-files.js` 的 `downloadRepoFiles` 递归树拉取），严禁在 Web 模式假死或要求用户自装环境。
- **弹窗短名红线**：操作按钮严守 G-16 规范，严禁长名按钮（如“清单转 Git 拉取打包”必须精简为“拉取清单”等 4 字以内极简文案），辅助说明收敛至 tooltip。
<!-- AGY-SWARM-PROTOCOL:END -->
