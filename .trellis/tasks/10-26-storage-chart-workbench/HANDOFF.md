# 存储图表工作台 · 交接（2026-10-26，2026-10-27 评审后更新）

## 一、当前状态

- 父任务：`10-26-storage-chart-workbench`（planning，0/6 子任务完成）
- 子任务：`naming-injection` / `storage-chart` / `zones-flow` / `package-cards-vault` / `tutorial-copy` / `ui-demo`（全部 planning）
- 规划产物：`prd.md`（R1–R8 + 2026-10-27 补充 R9–R12 + AC-1–AC-19）、`design.md`（§10–13 为评审轮增补）、`implement.md`
- UI demo：`deliverables/ui-demo.html`（单文件离线；**评审轮已按用户逐条反馈改到 2026-10-27 版本**）
- 产品代码：零改动；任务未 `task.py start`
- 截图证据：`test-results/ui4/*.png`（gitignored，不入库）
- 校验方式：Playwright 打开 `file://` 截图 + 控制台零错误；脚本在 `test-results/tmp/shot-demo.cjs`

> ⚠️ 本文件可能落后于 `prd.md`；验收以 `prd.md` 为准。

## 二、本轮锁定的关键决策

| 主题 | 决策 |
| --- | --- |
| 命名 | `ST-pack-transfer` / 中文「数据包转运」；禁止出现 tavern |
| 目标平台 | 只有四酒馆英文全称；当前宿主用徽标；删除 `native` |
| 打开入口 | 扩展列表内联下拉 + 账号弹层/管理面板原生备份按钮旁 + Luker 备份管理器行；顶栏魔方棒不注入 |
| 图表 | 唯一图表；配额表头 + 树主体；大类折叠到文件；颜色 + 图例 + 悬浮；勾选按宿主 + 包记忆 |
| 差量 | 图表顶部「覆盖 / 增量」，不设独立区 |
| 扩展 | 一级节点，含完整/仅列表、Git 保留、构建配置；全部正向复选框 |
| 私有配置 | 一级节点；随包同行；目标宿主匹配时原生完整还原；ST/Luker 走 `/api/files/upload` → `user/files` |
| 类型体系 | 插件自建类型表；不出现「其他」；未识别显式；非酒馆 ZIP 允许导入并标未识别 |
| 分区 | 导入/导出单向；复制后解耦；导出区只读可复制回；按钮「生成导出包」 |
| 多选 | 按所在区限定操作；合并同名即停 |
| 分卷 | 仅 MB；浏览器暂存后执行；每卷独立可导入 |
| 包名 | 默认 `{target}_{user}_{part}_{datetime}.zip`；完整占位符集合；`{target}` 输出英文全称 |
| 教程 | 基础 7 步首次自动弹一次 + 进阶教程 |
| 文案 | 日志只记事实；问号全部修好 |
| 设置 | 导出后保留（可改删除 + 二次确认）、流量提示、基础教程自动打开 |

完整条文见 `prd.md`。

## 三、四宿主能力矩阵

| 宿主 | 清单来源 | 粒度 | 云存储 |
| --- | --- | --- | --- |
| Luker | `POST /api/users/storage/inspect` | 逐文件（`canDrill`/`isLeaf`/`breadcrumbs`） | `/api/files/upload` → `user/files`；`/api/users/restore-backup` |
| PureTavern | Dexie `pure-tavern-modular-dev`（`records`/`blobs`） | `module/collection/id` + blob 体积 | 同源 IndexedDB |
| TauriTavern | `window.__TAURI__.fs.readDir/stat`，根 `%APPDATA%/com.tauritavern.client/data` | 逐文件 | `fs` 写回；`/api/users/backup` |
| SillyTavern | 无清单端点 | — | `/api/files/upload`；`/api/users/restore` |

- ST 图表**置灰**，不新增 ST 专用后端。
- TT 需在 Dev 实例实测 `fs` 作用域；被拒则降级「整包备份反推」并标注低精度。
- ST/Luker 的 `/api/files/upload`：base64 JSON，body 上限 500MB，`.zip` 不在禁用扩展名里，文件名限 `[a-zA-Z0-9_-.]`。

## 四、启动实现前必须做

1. 用户评审 demo；若要改 UI，先改 demo 再动代码。
2. 子任务 `prd.md` 目前仍是模板 seed（19 行）；启动前按父 PRD 的对应 R 节拆分回填，不允许 TBD。
3. 回填 `implement.jsonl` / `check.jsonl` 至少各一条真实 `{file,reason}`（当前为空；`task.py start` 会校验）。
4. 逐个 `task.py start` 子任务；建议顺序：`naming-injection` → `storage-chart` → `zones-flow` → `package-cards-vault` → `tutorial-copy` → `ui-demo`。
5. 每阶段按 `implement.md` 的质量门跑命令。
6. 收口时把规范落 `.trellis/spec/`（任务目录不是持久载体）。

## 五、风险与待验

1. TT `fs` scope：`fs:default`/`fs:allow-read` 是否覆盖 `$APPDATA/data`；被拒则降级。
2. ST 与 Luker 的 `logo.svg` 同源；正式实现按格式注册表分别内置图标，包卡用宿主色 + `ST/L/TT/PT` 角标。
3. 私有配置容器建议 `.zip` 兼容 `/api/files/upload` 与宿主文件浏览器；内部 `_private/manifest.json`。
4. 复制解耦会让同一包占两份字节；包卡显示副本标记，必要时提供「移动」选项。
5. 大包数千文件：默认折叠 + 超阈值虚拟滚动 + rAF 合帧。
6. ST 无清单端点，不做假数据。

## 六、如何打开 demo

双击 `deliverables/ui-demo.html`。顶部「演示控制」可切宿主/视图/主题、重放教程、入口预览、重置；面板之外的元素不属于插件 UI。

## 七、与旧任务的关系

- 旧 `10-14-workbench-overhaul`（planning，0/3）与 `10-24-ui-orchestration-r2`（planning，4/4）未动，本计划不依赖它们。
- 旧 `10-01-safe-migration-productization`（planning，12/12）仍是上一阶段总任务。

## 八、2026-10-27 评审轮改动（已落到 demo）

| 用户反馈 | 处理 |
| --- | --- |
| 目标平台配色要按图标取色 | ST `#a11b1b`、PT `#584078`、TT 浅黄 `#f8c034`、Luker 纯黑剪影；均写入 token 并只用于标识 |
| Luker 图标错用了 ST 的 | 取证 `apple-icon-512x512.png`（提交 `d44656a6b`），换成真图标并垫浅底 |
| 背景要随酒馆主题、不要独立配色 | 面板/文字/边框/强调全部改为 `--SmartTheme*` 派生；demo 增加「酒馆主题」深浅切换 |
| 面板外要有明显轮廓 | 轮廓改由 BodyColor 派生（宿主 BorderColor 默认是全黑，深底不可见） |
| 「在图表中查看」按钮与点卡重复 | 删除按钮；点卡即切换图表 |
| 包名旁 `包·Luker_搬家包…` 太长 | 改为两区独立序号：图表组头 `导入05`，包卡只显示两位数字于图标角 |
| 分卷要上下限、要显示 MB | 32–2048 MB，框旁 `MB`，越界提示、失焦钳制 |
| 分卷后要变多张标准图表 | 每卷一张标准图表卡（卷号 + 本卷容量 + 整包容量），可下钻到子项装卷 |
| 多选包批量改、移动端怎么办 | 桌面网格多组图表 + 批量条；移动端单列折叠，默认只展开第一卷 |
| 图表树不精确到文件 | 按真实备份包重写整棵树（chats/角色/聊天、私有边车、user/files、backups…） |
| 「宿主·Luker」与「当前宿主 Luker」重复 | 两处都删；顶栏徽标改为「宿主英文名 + 插件 / GitHub + Web」 |
| 包名框要占满且可拖角 | 改为 textarea，满宽 + `resize:vertical` |
| 日志显示不全 / 执行显示不全 | 日志移进顶栏弹窗；右栏面板改为「执行贴底、数据包占余量」 |
| 桌面要能拖分隔条 | 加左右 8px 竖向 + 右栏横向分隔条，交叉点十字手柄可同时调两者 |
| 数据包筛选行要固定 | 选择数据包/格式/排序固定，只有包卡列表滚动 |
| 包名换行出现残句 | Canvas 量宽判定：折行尾段 ≥45% 才折两行，否则单行省略 |
| 不允许重复 UI / 落单文字 | 删除导出区说明句、`共 N 个` 等旁注；说明只进「?」浮层 |

**遗留待确认**：无。下一轮若要动产品代码，按 §四 顺序 `task.py start` 子任务，并把 demo 当作唯一 UI 基准。

