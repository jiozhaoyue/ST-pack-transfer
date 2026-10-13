# 插件驱动产包 与 写入前三道守卫

> **适用**：把「实例数据」搬进别的实例时的**产包**与**写入前**两段。
> 来源：任务 `09-27-plugin-driven-instance-sync`（2026-10-13 实测收口）。
> 相关页：[Instance E2E And Data Sync](./instance-e2e-and-data-sync.md)（端口/协议纪律、四宿主导出导入通道、覆盖率判定三口径）。

**为什么单开一页**：`instance-e2e-and-data-sync.md` 已 **47 602 字节 > 32 768**（该页顶部自记「会被静默截断」）。
本页承载「插件产包链 + 写入前守卫」，不再往那页加。

---

## 1. 生产链（U-2 的实质改动）

**数据产生由插件承担，搬运由脚本承担。**

| 段 | 装置 | 说明 |
| --- | --- | --- |
| 产包 | `scripts/instance-sync/produce-via-plugin.cjs` | **驱动插件工作台的真实控件**（宿主拉取路径），产物由插件的**待导出区**下载出来 |
| 搬运/灌入 | `restore-luker.cjs` / `import-st.cjs` / `import-pt.cjs` | 复用既有通道，**不改语义** |
| 交叉核对 | `build-packs.cjs`（**不删**） | 一步直出与它的产物做条目级比对（`diff-packs.cjs`） |

**判定依据（AC-A1）**：产物由**实例页面的插件 UI 触发并落盘**。
**不得**用 Node 侧直调 `POST /api/users/backup` 冒充 —— 那是 `export-backups.cjs` 的活儿，两者互为对照组。

### 1.1 一步直出（OQ-2，2026-09-29 采纳）

`--layout st|tt|l` 直接产出目标布局包，`build-packs.cjs` 退为交叉核对装置。

⚠️ **「等价」有前提，必须照抄**：一步直出与 `build-packs` **在取数口径相同时**才字节级等价。
两侧口径由 `selection` 决定 —— 插件**可以**要全局扩展（`globalExtensions:true`），
而宿主原生备份这条路**拿不到**它们。⇒ 别写成「两条链路等价」。

### 1.2 selection 口径：清初态 + 钉死（2026-09-29 修订）

| 步 | 做法 | 为什么 |
| --- | --- | --- |
| **清初态** | 删 `workspace` store 的 `active_session` → **重载页面** | 本工具与 **E2E 共用同一持久化档案**；E2E 留下的夹具源包 + 收窄后的 selection 会被 `index.js` 的 `setSelectionState(savedState.selection)` 恢复，**静默改写产物的 selection 口径** |
| **定口径** | 默认**不喂夹具**；仅当 `--deselect` 非空才喂 | 喂夹具会用**夹具的** `count === 0` 把缺失类目置 false（那是**夹具的**可用性，不是宿主源的） |
| **取证** | 读插件**自报**的 `勾选类目:` 日志行 | 「插件到底发了什么」的直接观测 |

⚠️ **`STANDARD_KEYS` 不含 `backups` / `cache` / `appPrivate`**（它们由 `includeBackups` 旋钮与模块默认各自决定）
⇒ `--deselect backups` **不生效**（2026-10-13 实测：自报 selection 里 `backups` 仍在），
且因为触发了喂夹具而**丢掉 `globalExtensions` / `vectors`**。**别用它**。

---

## 2. 产包器的三条契约（2026-10-13 实测补全）

### 2.1 端口纪律的**分层**（不是两份端口表）

`e2e/lib/instances.cjs` 的登记表是**所有**实例的唯一定义点。
`e2e/lib/guard.cjs` 的白名单 `{8001, 8003, 8899}` 是 **E2E 的**使用限制 —— 产包器是**另一个消费者**，
源是 Real Luker（`:8004`）⇒ 若走守卫会被自己拦下。产包器**继承守卫的三条精神**但不调用它：
`--source` 必填且必须在登记表内（无兜底值）、启动即断言、禁止因端口被占而回退到别的实例、拒绝 `8000`。

### 2.2 R-20 做进产包器（硬门禁，不是提醒）

第 3 步读**实例插件版本** vs **工作区 HEAD**，不一致即**拒绝执行**并提示先 `git pull`。
2026-10-13 实测：工作区 `4cada1f`，四实例 `git pull` 后全部跟上。
**实例插件目录只走 `git pull`**（动的是**代码目录**，不是用户数据）。

### 2.3 产物出口：**按目标布局前缀挑条目**

⚠️ **不能取「待导出区末条」**（2026-10-13 实测回归）：S2 的「源端三类交付」之后，
一次宿主导出会往待导出区放 **3 条** ——
`<宿主平台>-<handle>_源备份.zip`、`<目标布局>_<user>_<part>_<date>.zip`、`<宿主平台>-<user>_报告.txt`。
取末条 ⇒ 拿到**报告 `.txt`** ⇒ 下载后按 zip 读 ⇒ `End of central directory not found`
（**产物明明已经产出，却被判失败**）。
判据：`pickTargetRow(names, prefix)` —— 名字以 `.zip` 结尾**且**以目标布局前缀（`--raw` 时 `raw-`）开头。

### 2.4 OPFS 残留必须每次清（**退化型故障**）

插件把拉取流**直写 OPFS**（`fetch-<ts>.zip`），成功时自删、**中断时不删** ⇒ 残留累积。
2026-10-13 实测 `.pw-profile/Default/File System` 达 **5.2 GB**，现象是**退化的**：
**第一次能跑完，之后每次都在 ~1.3 GB 处停滞**。
⇒ `clearStaleOpfsTemps(page)`：每跑前只删名字匹配 `fetch-*.zip` 的条目（不碰其它 OPFS 内容）。

### 2.5 「浏览器路径停滞」先看机器负载，别先怀疑代码

真源（1.66 GB）的浏览器拉取**会**停滞，但**可恢复**：
同一命令在**机器空闲**时 4 分钟内跑完（拉取 1655.9 MB），在机器被别的会话占满时
可在 `~1.3 GB` 处停顿数十秒乃至 >400 s。
⚠️ **判存活只认页内心跳**（阶段 + 已接收字节 + 速率）—— OPFS 是**惰性落盘**的，**体积不能当进度表**
（曾据 OPFS 体积误杀一个其实在正常推进的进程）。

---

## 3. 写入前三道守卫（**必须在任何写入之前全部生效**）

顺序铁律：**`产包 → 备份 → 只读快照 → 灌入 → 核对`**。**不得**让任何写入跑在备份前面。

装置：`scripts/instance-sync/prewrite-guards.cjs`（读数 → `research/pre-write-guards.json`）。

| 守卫 | 判据 | 失败语义 |
| --- | --- | --- |
| **链接子树** | `lib/link-guard.cjs` 的 `findLinkedRoots` 扫写入根 | **报告**（写入时默认逐条跳过 / 前置拒绝），非中止 |
| **宿主源码禁改** | 写入根下的**子路径探针**必须被实例仓 `.gitignore` 覆盖（`git check-ignore -v` **有输出**） | **中止**（落在源码面 = 改宿主源码，`L0-1` 红线） |
| **`.git/objects` 只读冲突** | 产物内 `extensions/<扩展>/.git/objects/...` 对应的目标文件若**已存在且带 ReadOnly** | **中止**（先决定处置，不得先写再撞 `EPERM`） |

### 3.1 源码面断言**必须用「子路径探针」**

2026-10-13 实测：`git check-ignore -v data/default-user` **命中**（`.gitignore` 的 `/data`），
而 `git check-ignore -v public/scripts/extensions/third-party` **不命中**（该目录自身的规则不返回匹配），
但其**子路径**返回命中。
⇒ 探针取 `<写入根>/__prewrite_guard_probe__` —— 对「根自身命中」与「仅子路径命中」两种形态都成立
（gitignore 语义：忽略目录即忽略其全部内容）。

### 3.2 写入根（覆盖全部落点，别漏）

| 宿主 | 写入根 |
| --- | --- |
| ST | `data/default-user` + `public/scripts/extensions/third-party` |
| Luker | `data/default-user` |

依据：`import-st.cjs` 的 `RAW_WRITE_ROUTES`（`extensions` → `public/scripts/extensions/third-party`，
其余裸落盘类目 → `userDir/<key>`）+ 端点类目（宿主服务端写在 `userDir` 下）+ Luker 原生整包恢复（写在 `userDir` 下）。

### 3.3 链接子树：**门禁必须「产物感知」**

用户 2026-09-26 裁决「默认跳过链接子树」。但**原生整包恢复是服务端一把写完的**，客户端没法逐条跳过
⇒ 只能「发现即拒绝」，除非 `--allow-links`。

⚠️ **「目录下有链接即拒绝」过宽**（2026-10-13 实测踩到）：即使产物里**根本没有**那条子树的条目也拒绝，
把「先按前缀过滤产物、再灌入」这条**安全**路径堵死。
**正确判据**：**只有产物真的会写入该链接子树时才拒绝** —— 存在包内条目以 `<链接相对路径>/` 开头。

配套装置 `filter-pack.cjs`（按前缀剔除条目产出新包，**只改产物、不碰实例**）。

**实例（2026-10-13）**：`dev-luker` 的 `data/default-user/extensions/ST-BgLoader` 是指向工作区仓
`My-repo/ST-BgLoader` 的 **junction**（`P-19` 那条），产物里有 **1090 条** `extensions/ST-BgLoader/**`。
处置：过滤产物（保留 6289 / 剔除 1090）→ 灌入（`restoredCount 6287`）→ **穿透零发生**
（复核：junction 仍在、`git -C My-repo/ST-BgLoader status --short` 为空）。
被剔除的 1090 条按「单列不判」登记。

---

## 4. 可重跑性判据（AC-A2）——**别让它变成假红或假绿**

**同一源连续两次产包**，并**同时记录源的 mtime 快照**（`snapshot-manifest.cjs` 的
`{files: {path: [size, mtimeMs]}}` 形态）：

- 两次快照**一致**而产物不一致 ⇒ **真缺陷**，须修；
- 快照**不一致** ⇒ 读数**标注「源在期间变动」**，**不算失败**。

**可判定的不变量**：**同路径条目 `crc32` 全等** + **差异条目在源快照上同期变动**。

**实例（2026-10-13）**：`l` 连续两次 —— run1 511.7 MB / **7379 条目** / sha256 `8a8bb282…`；
run2 同条目数、体积差 **+294 B**。`diff-packs.cjs` 逐条判：**7375/7379 同路径同 `crc32`**，
4 条内容不同（`settings.json`、`chats/…Branch #8.jsonl`(+3379 B)、`…chat_sync.json`、`usb_global_achievements_*.json`）。
源 mtime 快照 **18 条变动**，**恰好包含那 4 条**，另有新增的宿主自动备份
（`backups/chat_____3_…_20261013-{142026,143154,143934,143944}.jsonl` 等）
⇒ **真源当时正被另一个会话使用**（约每 10 分钟落一份备份）⇒ 判为**「源在期间变动」**。
⚠️ **不得**据此声称「产物完全确定」；**也不得**因 294 B 判为缺陷。

---

## 5. 覆盖率核对的两个**口径陷阱**（2026-10-13 实测）

### 5.1 ST 目标**必须传 `--extra-root`**

`extensions/` 的原生位置在 `userDir` **之外**（`<inst>/public/scripts/extensions/third-party/`）。
`diff-report.cjs --extra-root '<绝对路径>:extensions/'` 才把它并入扫描面。
**漏传时覆盖率会假报 `26.749%`**（1973/7376）—— 补传后并入 6131 / 5650 条、回到 **99.986%**。
⚠️ 路径要写 **Windows 形态**（`D:\...`）；写 `/d/...` 会被判「额外根不存在」而静默跳过。

### 5.2 「这两个数字量的是同一件事吗？」（本仓已栽 5 次）

2026-10-13 本条**当场兑现两次**：源 `chats/<角色>/` **目录 23** vs PT `characters` **25 records**；
源 `chats/` **文件条目 1029** vs PT `chats` **471 records**。**两次都没有强行判等**，而是登记口径差。
（另：`26.749%` 那条假红也是同一族 —— **扫描面**不同，不是内容不同。）

### 5.3 单列不判项**必须显式列出**

合成元数据（`_convert/**`、根 `manifest.json`）、Luker 私有状态（`characters/*.state.*.json`）、
链接子树内条目、宿主自管缓存（Luker `backups/` 轮换、ST `thumbnails/` 失效重建）——
四类都**显式列出、不参与判定**，**不得静默算作已覆盖**。
2026-10-13 四目标**各缺 1 条且都是同一条** `public/scripts/extensions/third-party/.gitkeep` ——
当场查实为**扫描口径伪影**（该文件在四个目标上**都在**），不是真缺失。

---

## 6. 实例侧 E2E 必须**显式切到高级工作台视图**

S5 第二步起，插件**默认入口是迁移向导**（根容器 `data-wb-view="wizard"`），而向导
**一次只披露当前步的区块** ⇒ 非当前步的控件是 `display:none`，`#target-select` 恒 `0×0`
⇒ 直接点它必然以「element is not visible」超时。

- **standalone 运行器**早有 `e2e/standalone/lib/common.cjs` 的 `useAdvancedView(page)`；
- **实例侧规格此前未适配**（`matrix` / `pt-load` / `library-inject`）⇒ 2026-10-13 实测 `npm run e2e` **17 项红**。
- 修法：`e2e/lib/harness.cjs` 新增并导出 `useAdvancedView(page)`，各规格在**打开抽屉之后、可见性验收之前**调用。
  实现用**页内 `btn.click()`**（不做命中测试，免疫 splash / 第三方模态 `<dialog>` 拦截指针事件），
  视图根按 `document.querySelector('[data-wb-view]')` 定位（抽屉态不是 `#app`）。
