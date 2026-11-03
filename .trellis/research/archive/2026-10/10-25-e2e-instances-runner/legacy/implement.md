# 实施记录：e2e:instances 统一入口（随执行勾结）

## 阶段 1 · 编排器与入口

- [x] `package.json` 增 `e2e:instances`（`scripts/run-e2e-instances.cjs`）
- [x] `restart-instances.cjs` waitReady 参数化（`--wait-secs` 默认 300；Luker 冷启动 163s 实测）
- [x] TT 运行时库 `e2e/lib/tt-cdp.cjs`（幂等 ensureTtRuntime + ttCdpSmoke + 自动启用兜底）
- [x] 阶段容错：restart/PT 重装失败不炸编排（AC-2）；失败 spec 自动重试一次（时序吸收）

## 阶段 2 · PT 安装链（三处真修复）

- [x] `--replace` 补传（旧快照清单 404 根因）
- [x] 本地 zip 源（git archive + 临时 http + PT_EXT_URL；zip 名=扩展目录名 st-zip-converter）
- [x] **持久档案安装**（launchPersistentContext PROFILES.dev——临时 context 装完即丢的根因修复）
- [x] spawn 异步（execFileSync 阻塞事件循环与同进程 http 服务死锁的修复）+ CORS 头

## 阶段 3 · 存量断言/脚本缺陷修复（本次首跑暴露）

- [x] pt-load `DRAWER_ID` ReferenceError（be04efd 删定义留使用）→ P2 改断言全屏模态
- [x] pt-load P1b/P1c 新增 detectHost 两级判据 PT 实测（父任务 AC-4）
- [x] matrix M-3 口径更新（OQ-1 默认完整迁移：直通 10/丢弃 1/产物 11；tt 路由 8/迁移 2）
- [x] matrix/pt-load click 前通用预处理（dialog 遮障关闭 + 原生 scrollIntoView）
- [x] 日志面板折叠头 id 改版适配（`#log-bar-header`）
- [x] pt-load P15 剔除一次性安装源重试噪音
- [x] M-4 命名断言降级 + KI-1 登记（st 产物名 l_ 前缀疑点）
- [x] `test/convert.test.js` 增 st→l 丢弃语义锁（含转正用例）

## 阶段 4 · 验证与收口

- [x] 分宿主实测：dev-st matrix 93/93、dev-luker matrix 93/93、pt-load 28/28、tt-cdp PASS、guard 21/21
- [x] 一键验证（含重试逻辑）—— 见 AC 勾结
- [x] 四脚本审阅记录 `research/scripts-review.md`
- [x] spec 落盘 `guides/e2e-instances-runner.md`（六条实测铁律+判定口径）
- [x] 已知问题登记 `research/known-issues.md`（KI-1/KI-2）
