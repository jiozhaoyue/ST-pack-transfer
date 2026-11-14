# 规范化测试流程（TESTING-PROCESS）

> 本仓**唯一权威**的测试流程说明（2026-11-14 建立）。发版/交接前按本页自上而下逐层执行，全绿才算完成。
> 与 `DEVELOPER-GUIDE.md` §四（命令速查）互补：那边是「有什么命令」，这边是「**按什么顺序跑、每层过什么判据、红了怎么处置**」。

## 0. 总原则

1. **分层把关，下层全绿才进上层**：静态 → 单测 → 构建 → 独立 E2E → 实例 E2E → 真机专项。
2. **机器独占**：墙钟敏感用例（实例矩阵 / 分卷 / 暂停窗口）运行期间**禁止**并发跑 vitest / build / 大批量脚本
   （负载型假红，见 `instance-e2e-and-data-sync.md` §11.6）。
3. **红了先归因，再改码**：负载（换机器状态重跑即绿）≠ 陈旧状态（清初态重跑）≠ 别人的弹窗（错误文案点名
   intercepts）≠ 断言写错（对照现行契约）≠ 产品缺陷（修码 + 补负例）。
4. **产物一律落 `test-results/`**（.gitignore 覆盖，不入库）；严禁写 `Instance/**`；
   Real 端口（8002/8004）出现即拒（`e2e/lib/guard.cjs` 白名单 8001/8003/8899）。
5. **一次只跑一个 dev 实例**（2026-11-14 用户裁定）：实例类测试按 `--instance` 拆单实例轮次串行执行；
   8899（PT web）也算一个 dev 实例位。插件自己的静态服务器（4173 preview）不占实例位。
6. **读数落盘**：每轮跑完把读数（passed/failed、断言数、耗时）记进当轮 PLAN 文档，不许凭记忆。

## 1. 六层测试阶梯

| 层 | 命令 | 覆盖 | 通过判据 | 预期耗时 |
| --- | --- | --- | --- | --- |
| L1 静态守卫 | `npm run qa:static`（串跑 8 条） | CSS 作用域 / DOM 注入 / 单一模板源 / DOM 写入作用域 / 控件消费点 / 禁打包器专有语法 / i18n / 拷贝审计 | 8 条全过，无输出即过 | <10 s |
| L2 单元/组件 | `npm test` | 全部纯逻辑 + 组件测试（当前 127 文件 / 1229 例） | 0 failed；2 skipped 为已知跳过 | ~1–2 min |
| L3 构建 | `npm run build`（改动离线产物时加 `npm run build:offline`） | 产物可构建、产物一致性 | 退出码 0 | ~30 s |
| L4 独立 Web E2E | `npm run e2e:web`（源码**删过文件**时加 `-- --rebuild`，mtime 判据看不见删除） | 无宿主全功能：上传/计划/转换/下载/云子路径/file:// 离线 | 退出码 0，读数落 `test-results/` | 数分钟 |
| L5 实例 E2E | **`npm run e2e:instances`（权威入口）**：错峰逐宿主（dev-st → dev-luker → dev-pt → tt-cdp），**同一时刻只保被测宿主在线**、收尾默认全停；单宿主失败不阻断其余、失败 spec 重试一次 | 四宿主加载冒烟 + 功能矩阵 + TT CDP | 退出码 0；读数落 `test-results/instances/<host>-<date>.md` | 全程 ~30–60 min |
| L6 真机专项 | 见 §3 | WebDAV/S3 真机、备份集修剪、PT 导入 | 按专项判据 | 专项定 |

**L5 前置清单**（缺一不跑）：

- `Get-CimInstance Win32_Process` 扫一遍没有别人的 `vitest` / `e2e/run.cjs` / `test-*.js`（跨会话独占，P-18）；
- 编排器自己处理：幂等启动（端口已在线就复用）、就绪有界等待（Luker 冷启动最长 300 s）、
  错峰互斥（HTTP 三家互斥 + TT 与全部 HTTP 互斥）、PT 扩展从 `git archive HEAD` 现装、收尾全停；
- 夹具由 spec 现场生成到 `test-results/fixtures/`，不需要预置；
- 断言一律**增量口径**（持久化 profile 跨轮不净）；跑之前别同时跑 `npm test`（负载纪律）。

**单实例手工轮次**（编排器之上的细粒度调试用法）：

```bash
node scripts/run-e2e-instances.cjs --only dev-st     # 只跑一个宿主
npm run e2e -- --only matrix --instance dev-luker    # 只跑一个 spec 的一台实例
```

## 2. 失败归因速查（先看这条再动码）

| 症状 | 先查 | 判据 |
| --- | --- | --- |
| 矩阵某段红、另一实例同段绿 | 负载 | 单跑该实例即绿 ⇒ 负载，非代码 |
| `#env-badge` 等全缺 | 加载期 | 宿主 `#extensions-settings-button` 在而插件徽标不在 ⇒ 冷启动没挂载，先热身 |
| 点击超时 + 文案含 `intercepts pointer events` | 别人的弹窗 | ChatFilesys 入库提醒；守卫 `installChatFilesysPromptGuard` 应已装 |
| `page.fill` 后读数为空 | 静默不写入 | 一律回读 + 程序化赋值兜底（`fillNumber`） |
| 断言期望的路径/文案不存在 | 断言过时 | 对照 `DEVELOPER-GUIDE.md` 现行契约（例：TT 扩展作用域 2026-11-12 改造） |
| 同一用例跨轮次结果不同 | 陈旧初态 | 清 `workspace` store 的 `active_session` + 重载；断言改增量口径 |
| spec 卡死在**有界等待**上（超时机制没兜住） | 上轮杀进程残留 | `chrome-headless-shell` 孤儿进程 / 4173 监听没清 ⇒ 下一轮 openSite 挂死（2026-11-14 实测）。杀 run 后：`Get-Process chrome-headless-shell` 清干净 + `netstat :4173` 确认无 LISTENING 再重跑 |
| 「功能没跑」但无任何报错/toast | 模态惰性化 | `<dialog open>`（top-layer）会吞掉页面所有点击（capture 监听实证 clicks=[]）。分卷阈值的确认模态在 **blur 才弹出**（Playwright fill 不 blur ⇒ 读回的值是「还没提交」的假象）——先 `blur()` + 等模态 + `confirmActiveModal` |

## 3. 真机专项判据

| 专项 | 入口 | 判据 |
| --- | --- | --- |
| WebDAV 真机 | 迁移与备份 → 公网 → WebDAV →「测试连接」 | 六步自检全绿（OPTIONS/PROPFIND/MKCOL/PUT/GET/DELETE；PROPFIND 可降级为 ⚠ 参考项）；控制面 20 s / 数据面 120 s 两套超时 |
| 备份集 + 修剪 | 公网 → 一键备份（set 模式）+ `#cloud-retention` | 连续备份 N+1 次后远端保留数 == N，且删的是**最旧**版本；恢复任一保留版可得完整快照 |
| PT 导入 | `node scripts/instance-sync/import-pt.cjs --report` | 模块读数与源包对得上；>100 MB 需显式 `--allow-large` |
| 宿主拉取 | 实例矩阵 M-* | Luker 用 selection 压量（**绝不勾 settings**）；ST 只走快档 |

## 4. 截图存档纪律（2026-11-14 用户裁定）

- UI 验收读数与截图**一律落盘**：`test-results/screenshots/<日期>-<场景>.png`（.gitignore 覆盖）。
- 截图**只存不读**：不做人工判读、不派视觉审查 agent；判收靠**程序化断言**（DOM 状态 / 控制台错误 / 请求数），
  截图仅作存档证据。
- 实例页截图与独立页截图分目录：`screenshots/instances/` 与 `screenshots/web/`。

## 5. 门禁汇总（发版/交接 checklist）

```bash
npm run qa:static        # L1：8 条静态守卫
npm test                 # L2：全量单测
npm run build            # L3：构建
npm run e2e:web          # L4：独立 Web E2E（改了被引用文件记得 --rebuild）
# L5：按「一次一个实例」逐台跑矩阵（8001 → 8003 → 8899），跑完关实例
# L6：按需跑真机专项
```

全绿 + 当轮 PLAN 文档读数齐全 ⇒ 才允许提交推送（显式 pathspec，禁 `git add -A`）。
