# UI / 功能审计总览（2026-11-17）

> 用户指令：禁止整块填充色底；全部 UI 多视口视觉检测（16:9 / 带鱼屏 / 电脑 / 平板 / 手机 / Duo）；
> 全部功能检查（要「好用」，不是「能开」）；全部持久化记录并深化规则。

## 文件

| 文件 | 内容 | 状态 |
| --- | --- | --- |
| `function-audit.md` | 功能/可用性审计（Hy4 flash Free），8 条：P0 0 / P1 5 / P2 3 | 已交付 |
| `perf-audit.md` | 性能审计（Hy4 flash Free），10 条：P0 0 / P1 3 / P2 7 | 已交付 |
| `ui-visual-audit.md` | 全视口视觉审计（GLM-5.3），17 条：P0 1 / P1 4 / P2 11 + 3 复核通过 | 已交付（基于整改前截图，逐条复核见下） |
| `cloud-core-e2e.md` | 本机 S3/WebDAV 全流程：上传→下载→sha256；大包 25,169,946 B | 已交付，实测通过 |
| `instance-availability.md` | PureTavern / TauriTavern 能否参与跨宿主实测 | 已交付：PT 有条件、TT 不可浏览器自动化 |
| `luker-tt-roundtrip.md` | Luker↔TauriTavern 往返保真（最高价值路径） | 固定夹具通过；真实大包运行中 |
| `luker-tt-contract.md` | Luker↔TT 格式契约逐项映射 | 已交付：6 条缺陷候选（D1~D6） |

## Luker ↔ TauriTavern（最高价值路径）

| 样本 | 方向 | 关键项 | 计数 | 结论 |
| --- | --- | --- | --- | --- |
| `fixture-l.zip` | L→TT→L | 角色/聊天/世界书/设置/secrets/扩展 全在 | 角色 1、聊天 1、消息 2、世界书 1 | 通过，关键丢失 0 |
| `fixture-tt.zip` | TT→L→TT | 同上 | 同上 | 通过，关键丢失 0 |
| `real-l-to-tt.zip`（586 MB） | 往返 | 待补 | 待补 | 运行中 |
| `real-tt-to-l.zip`（77 MB） | 往返 | 待补 | 待补 | 运行中 |

- 角色卡 PNG 往返 `Buffer.compare == 0`（字节恒等）。
- 预期丢弃：备份快照、缩略图、TT 派生缓存、重合成的 manifest。
- 契约候选：D1 同名扩展全局副本去重（已裁决必须显式提醒）、D3 TT 设置丢弃（已裁决修入 `_compat/tt/`）、D2/D4/D5/D6 见报告。

## 自动化测试资产（持久化、可复用）

| 资产 | 命令 | 覆盖 | 实测 |
| --- | --- | --- | --- |
| 本机 S3 服务器 | `npm run cloud:serve:s3` | PUT/GET/Range/HEAD/DELETE/ListV2/multipart（无鉴权，仅测试） | 冒烟 200/206/204 |
| 本机 WebDAV 服务器 | `npm run cloud:serve:webdav` | OPTIONS/PROPFIND/PUT/GET/HEAD/DELETE/MKCOL | 冒烟 207/201/409 |
| 云契约测试 | `npm run test:local-cloud` | 真实 HTTP + Range + multipart + 路径穿越 + Authorization | 7 passed |
| 核心云全流程 | `npm run e2e:cloud-core` | 真实 zip → S3/WebDAV → 下载 → sha256 | S3 上行 75.663 MB/s、下行 141.252 MB/s；WebDAV 上行 116.541 MB/s、下行 144.402 MB/s（25.17 MB 包） |
| 实例成对启动 | `npm run e2e:instance-pair -- dev-st dev-luker` | 最多两个实例、就绪探测、退出清理端口 | 单实例冒烟 PASS（8001 释放） |
| UI 多分辨率流程 | 待 GLM-5.3-flash **free** 额度恢复 | 1920/820/390/280 关键路径 | 脚本未交付：免费额度耗尽 |
| ST↔Luker 跨宿主互传 | 待 GLM-5.3-flash **free** 额度恢复 | 两实例 WebRTC 实测 | 脚本未交付：免费额度耗尽 |

> 实例纪律：同一时刻最多两个酒馆实例；脚本启动前扫描 8001–8004/8899，超出即中止。
> PT：依赖已装、纯前端 IndexedDB，但插件只能远程安装，且 8899 与本仓 3040 端口规则冲突，需授权后再纳入。
> TT：无 HTTP dev server（只有桌面 Tauri 窗口），本机双实例自动化不可行，维持人工交付。

## 采集矩阵（可复跑）

```bash
# 前置：dev 服务在 3040（strictPort）
node tooling/ui-audit/matrix.cjs --url http://localhost:3040
# 产物：test-results/audit/<stamp>/shots/<viewport>/*.png + probe.json + summary.md
```

视口：1920×1080、2560×1440、3440×1440（21:9）、1440×900、1180×820、820×1180、768×1024、
1114×705（Duo 展开）、540×720（Duo 折叠）、390×844、360×640、320×568、280×653。

度量项：横向溢出、元素出界、功能性文字裁切、纵向不可达裁切、触控目标、功能字号、
图标按钮可访问名、滚动容器计数、对比度、同名按钮重复。

### 最新一轮结果（176 状态）

| 指标 | 首轮 | 整改后 |
| --- | --- | --- |
| 横向溢出 / 元素出界 / 功能文字裁切 | 0 / 0 / 0 | 0 / 0 / 0 |
| 对比度低于 WCAG | 147 | **0** |
| 纵向不可达裁切 | 9 | **1**（抽屉展开时被冻结的扩展面板，非用户可见） |
| 触控目标 <24px（去重） | 240 | **4**（教程演示态 3 + 扫码链接 1，已记录） |
| 手机双纵向滚动 | 16 | **0**（仅 Duo 展开的桌面双栏，属设计允许） |
| 图表区被压到 2px | 有 | **0** |

## 本轮已修复（含实测）

| 问题 | 修法 | 实测 |
| --- | --- | --- |
| 目标平台按钮整块品牌实色（截图中的 SillyTavern 红块同型） | 品牌浅染 + 品牌描边 + 品牌色文字；选中项加左侧 2px 色条 | 计算样式 `rgba(255,90,79,.18)`；元素截图复核通过 |
| `.btn.accent` 白字压强调色实底 | 20% 浅染 + 62% 描边 + 强调色文字 | 对比度 2.67:1 → 约 4.85:1（按合成底色计算） |
| 危险操作按钮内联 `background:var(--drop)` | 改为 `--drop-bg` 浅染 + `--drop` 描边 | 代码守卫断言 |
| `.mini:hover` 铺满强调色 | 改为浅染 + 强调描边 | 代码守卫断言 |
| 教程主按钮 / 文档按钮 hover 实色 | 改为浅染 + 强调文字 | 同上 |
| 包平台小标签 `pkg-host-tag` 实色 + 7.5px | 浅染 + 环色描边；字号 7.5 → 8.5px | 计算样式复核 |
| 手机 320/360 宽 `.app-main` 被全局 `overflow-y:hidden` 裁掉 18px | 仅传输/扩展视图禁外滚，其余恢复 `.app-main` 唯一纵向滚动 | 360×640：`overflowY:auto` |
| 触屏走桌面布局时折叠箭头 16px | `@media (pointer: coarse)` 抬到 24px，紧凑按钮 ≥28px | 守卫断言 |
| 数据包抽屉展开时 app-main 与 zone-body 双滚动 | 抽屉展开期间冻结 `.app-main`，抽屉自身成为唯一滚动容器 | 守卫断言 |
| 280 宽页头右侧按钮被裁出屏幕（内容 295 > 容器 242） | ≤340px 页头换行 + 动作行再换行；空态改单列 | 实测 `scrollWidth 242 = clientWidth`，按钮右缘 247 < 280 |
| 3440 带鱼屏空态两张小卡悬在巨大空白 | ≥2200px 空态引导放大到 860px、内边距与图标同步放大 | 实测引导宽 860、在图表列居中 |
| 备份集名可拼 `../` 造成远端目录穿越（功能 F-03） | 新增 `src/core/path-safety.js`，S3/WebDAV 路径编码前做段级净化 | 新增 `test/path-safety.test.js`（4 用例） |
| 预估压缩包 `约 4.6 MB` 违反 R-05 | 移除 `~` 前缀（中英两套） | 文案键 `chart.estZip` / `chart.selected` |
| 320 扩展动作行只露半枚按钮（GLM UI-05） | 手机端 `.ext-unified-actions` 改 `flex-wrap:wrap`，取消无暗示横滚 | 守卫断言 |
| 未识别徽章文字 56% 透明度对比度 3.43（UI-06） | `--unknown` 从 `--muted-2` 改为 `--muted` | 守卫断言 |
| 手机 toast 出现时盖住页头控件（UI-02 修正版） | toast 本身 `pointer-events:none` 不拦点击；手机改落到底部 | 守卫断言 |
| 3440 树行「标签→徽章」千像素空白（UI-13） | ≥2200px 树内容限宽 1200px 居中 | CSS 实测 |
| 体积读数 `≈` 估算符号（UI-16） | 中英文案移除 `≈`，仅保留「预计 / Est.」语义 | i18n 键 `pkg.estHost` / `zones.estHostTotal` |
| 注入宿主弹窗危险/成功按钮整块实色 + 硬编码色（UI-09） | 改浅染 + 描边；告警文字走 `--SmartThemeQuoteColor` 回退 | `host-bridge.js` 三处 |

## 视觉审计（GLM-5.3）逐条复核

> GLM 报告基于整改前截图（13:18），下列为对照当前代码/最新矩阵后的处置。

| ID | GLM 级别 | 当前状态 |
| --- | --- | --- |
| UI-01 | P0 | **已修**：≤340px 页头换行，280 宽 `scrollWidth=clientWidth=242`，设置按钮右缘 247 |
| UI-02 | P1 | **降级 P2**：遮挡源是全站 `#toast`（`pointer-events:none`，不拦点击）；手机已移到底部 |
| UI-03 | P1 | **已修**：最新矩阵纵向不可达仅 1 例（抽屉后面板），360/320/280 统计行可达 |
| UI-04 | P1 | **采集假阳性**：旧矩阵未关更新日志模态；修采集器后 `12-30-settings.png` 正常显示设置页 |
| UI-05 | P1 | **已修**：手机扩展动作行换行，半截按钮消除 |
| UI-06 | P2 | **已修**：未识别徽章改用 `--muted` |
| UI-07 | P2 | **已修**：hover 文字改 `--text`，不再在 32% 浅染上掉对比度 |
| UI-08 | 复核通过 | 保持：`pkg-host-tag` 8.5px，四品牌实算 4.59~8.14 |
| UI-09 | P2 | **已修实色部分**：注入弹窗两枚按钮改浅染+描边；语义色仍为固定值（记录） |
| UI-10 | P2 | 部分修：触屏桌面布局 24/28px；手机包复选框 14→20px；其余小控件保留记录 |
| UI-11 | P2 | 保留记录：功能字号 10px 级为信息密度取舍，均有 title 兜底 |
| UI-12 | P2 | 保留记录：列表行同名按钮需带上下文 aria-label（后续） |
| UI-13 | P2 | **已修**：超宽树内容限宽居中 |
| UI-14 | P2 | 保留记录：手机 LAN 堆叠顺序（接收→方向条→发送）需调整 DOM 顺序 |
| UI-15 | P2 | 保留记录：320 包名断行残句需加尾段检测 |
| UI-16 | P2 | **已修**：移除 `~` 与 `≈` 估算符号 |
| UI-17 | P2 | **复核通过**：`renderViewSwitch` 每枚按钮均带 `aria-label` + `title` |

## 待修（功能审计移交）

| ID | 严重度 | 摘要 | 位置 |
| --- | --- | --- | --- |
| F-01 | P1 | 分卷阈值按未压缩源字节判断，与真实产物体积不同源 | `src/core/splitter.js:184,191,214` |
| F-02 | P1 | 分卷进度分母恒等于当前卷号（假进度） | `src/core/splitter.js:187` |
| F-03 | P1 | 备份集名未净化，可拼 `../` 路径段 | **已修**：`src/core/path-safety.js` + `test/path-safety.test.js` |
| F-04 | P1 | LAN 接收端串行 64KB 写 + digest 整块入内存，真实吞吐未测到 | `lan-transfer-panel.js:550,661` |
| F-05 | P1 | 导出区删除失败被空 catch 静默吞掉 | `export-queue.js:177,184` |
| F-06~F-08 | P2 | ACK 对发送端无效 / 导出区无去重 / 排障日志默认关闭 | 见 `function-audit.md` |

> 待修项未在本轮改动，避免与审计结论互相污染；修完需在 Dev 实例复测后回填本表。

## 规则沉淀

- `test/ui-solid-fill-guard.test.js`：锁实色填充、危险按钮、手机滚动、触屏尺寸。
- `.trellis/spec/frontend/responsive-and-aesthetics.md`：新增第 4、5 节判据。
- `.trellis/spec/guides/rule-details.md`：D-83 ~ D-89。
