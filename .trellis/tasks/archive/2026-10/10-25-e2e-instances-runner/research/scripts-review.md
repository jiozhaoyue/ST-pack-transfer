# scripts/ 四脚本审阅记录（任务 10-25-e2e-instances-runner · R5 / AC-4）

> 审阅时点：2026-10-25（四脚本已于 Session 48 入库 `f793e6c`；本任务对 restart-instances
> 另有 wait 参数化改动）。审阅维度：头注释与行为一致性 / 端口写死处（L0-16 段位）/
> 白名单与 D-12 域名纪律一致性 / 在 `e2e:instances` 自动链中的角色。

## 1. `scripts/restart-instances.cjs`（运维脚本，自动链阶段 1 调用）

- **端口表**：8001-8004（实例段✓）+ 8899/8900（PT 已登记段✓）；无 8000/3000 ✓。
- **Real 侧边界**：脚本登记六个实例（含 real-*）——属**运维管理面**（人工全量重启）；
  `e2e:instances` 编排器**只传 `--only dev-st,dev-luker,dev-pt`**，自动链永不触 Real ✓。
- **本任务改动**：`--wait-secs`（默认 300，原 90）——吸收 Dev Luker 冷启动 163s 实测
  （服务端插件自动更新逐个 SSL 超时拖住监听）；头注释已同步补实测依据 ✓。
- 头注释与行为一致 ✓（junction 校验/PT 快照重装语义均有注释对应）。

## 2. `scripts/install-pt-extension.cjs`（自动链阶段 1b 调用）

- **端口表**：8899 dev-pt / 8900 real-pt（已登记段✓）；URL 一律域名形式（`dev-pt.localhost`）✓。
- **Real 边界**：默认目标含 real-pt——编排器**显式 `--only dev-pt`** ✓。
- 来源 `EXT_URL` 默认 GitHub 公开仓（或本地 zip 覆盖）——无凭据 ✓。
- 头注释取证链完整（PT legacy 路由 `/api/extensions/install`）✓。

## 3. `scripts/probe-instance-console.cjs`（人工探针，自动链不调用）

- 头注释自述「用户手测报问题时取证浏览器侧」——**人工排障用途**；URL 为必填参数、
  无默认值、不过 guard（人工自担目标合规）。
- 用法示例全部是域名形式（dev-st/dev-luker/dev-pt）✓；PT `--headed` 硬约束已注明 ✓。
- **与自动链的关系**：`e2e:instances` 不调用它；保留原状。

## 4. `scripts/probe-ext-row.cjs`（人工探针，自动链不调用）

- 头注释「临时验证：宿主扩展行打开入口」——同上，人工探针。
- 无端口写死（URL 参数化）；示例域名形式 ✓。

## 结论

- 四脚本头注释、端口段位、Real/Dev 边界全部过堂，**无违规项**；
- 自动链（`run-e2e-instances.cjs`）只依赖 restart + install-pt（均显式 dev-only）
  与 `e2e/run.cjs`（内置 guard 域名强制）；两个人工探针不进自动链；
- 唯一改动：restart 的就绪等待参数化（163s 实测驱动，向后兼容默认值变化 90→300）。
