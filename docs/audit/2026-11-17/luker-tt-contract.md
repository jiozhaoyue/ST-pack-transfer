# Luker ↔ TauriTavern 数据格式映射契约审计

> 审计日期：2026-11-17 ｜ 审计员：数据格式审计员（opencode/hy4-flash-free）
> 只读审计。未修改任何产品代码、测试、fixture、package.json；未启动实例；未提交 Git。
> 证据分级：**〔已证实〕**＝本次真实解包/源码逐行核对；**〔待验证〕**＝无样本或需实机验证，已写明验证方法。

---

## 0. 审计范围、样本与方法

### 0.1 样本清单（全部为真实文件，非估算）

| 用途 | 路径 | 布局 | 条目数 | 体积（字节） |
| --- | --- | --- | --- | --- |
| L 源（干净） | `out/probe.zip` | l | 4315 | 586542058 |
| L 源（原始全量） | `data-zip/default-user-2026-08-25-172056.zip` | l | 4416 | 1032582042 |
| TT 源 | `data-zip/tauritavern-data-20260825-100035.zip` | tt | 705 | 162225194 |
| L→TT 产物（陈旧） | `out/real-l-to-tt.zip` | tt | 4315 | 586759059 |
| TT→L 产物（陈旧） | `out/real-tt-to-l.zip` | l | 650 | 77296540 |
| 小夹具 L | `fixtures/fixture-l.zip` | l | 12 | 2782 |
| 小夹具 TT | `fixtures/fixture-tt.zip` | tt | 14 | 3554 |
| L→TT 报告 | `out/real-l-to-tt.json` | — | — | 16874 |
| TT→L 报告 | `out/real-tt-to-l.json` | — | — | 9228 |

条目数与布局由 `zipIo.openReader` + `detectFromReader` 实测（`src/core/zip-io.js:121-186`、`src/core/detect.js:18-72`）。

### 0.2 方法

1. **静态法**：逐行读 `src/core/transform.js`（1406 行）、`detect.js`、`plan-preview.js`、`inspect.js`、`zip-io.js`、`test/real-samples.test.js` 与 `.trellis/spec/guides/tavern-datapack-formats.md`。
2. **动态法（真实解包）**：用 `node --input-type=module -e` 内联调用项目自身 `zipIo` 读取中央目录（只读，不写文件），取得 `fileName / crc32 / uncompressedSize`。
3. **映射核对法**：对源每条路径套用 `routeSource()` + `targetEntryPath()`（`transform.js:907-990`、`997-1056`）求期望路径，与产物路径集合求差集。
4. **字节核算法**：对每条成功映射的条目比对源与产物的 `crc32` 与 `uncompressedSize`。`crc32` 相等 = 解压后字节全等（`zip-io.js:150`）。
5. **当前代码复现法**：利用 `convert()` 的 `io` 注入接缝（`transform.js:296-300, 331-333`），挂载「只记录路径、不落盘」的 writer，得到**当前代码**的确切映射与丢弃原因，规避陈旧产物干扰。

---

## 1. 双方目录/文件契约

### 1.1 Luker（布局码 `l`）〔已证实〕

判定：zip 根有 `manifest.json` 且含 `schemaVersion` + `selection` → `LAYOUTS.L`（`src/core/detect.js:58-60`）；与 ST 同属摊平用户目录（`detect.js:4-6`）。

`fixtures/fixture-l.zip` 全部 12 条（真实解包）：

```
manifest.json
characters/Fixture Character.png
chats/Fixture Character/2026-09-01.jsonl
worlds/fixture-world.json
OpenAI Settings/fixture-preset.json
settings.json
secrets.json
User Avatars/fixture-avatar.png
extensions/test-extension/manifest.json
extensions/test-extension/index.js
thumbnails/fixture-avatar.png
backups/auto-2026.json
```

`out/probe.zip` 顶级目录分布（4315 条，真实解包）：
`extensions` 3769、`user` 186、`chats` 90、`OpenAI Settings` 61、`instruct` 41、`context` 37、`TextGen Settings` 36、`KoboldAI Settings` 28、`NovelAI Settings` 24、`sysprompt` 14、`worlds` 6、`themes` 5、`reasoning` 5、`characters` 5、`User Avatars` 2、`QuickReplies` 2、`settings.json` 1、`secrets.json` 1、`movingUI` 1、`manifest.json` 1。

L 恢复类目白名单镜像（`test/real-samples.test.js:39-56`）：
- 文件：`settings.json`、`secrets.json`
- 目录：`backups`、`characters`、`User Avatars`、`backgrounds`、`chats`、`groups`、`group chats`、`worlds`、四类 AI Settings、`instruct`、`context`、`QuickReplies`、`themes`、`movingUI`、`sysprompt`、`reasoning`、`assets`、`user/files|images|workflows`、`extensions`、`vectors`
- 全局扩展别名：`public/scripts/extensions/third-party`、`scripts/extensions/third-party`、`extensions/third-party`、`third-party`
- **不在任何类目**：`image-metadata.json` → L 目标丢弃（`transform.js:694-700`；规范 `.trellis/spec/guides/tavern-datapack-formats.md:35-38`）

### 1.2 TauriTavern（布局码 `tt`）〔已证实〕

判定：存在 `data/default-user/` 或 `data/_tauritavern/` 前缀 → `LAYOUTS.TT`（`src/core/detect.js:31-39, 63-65`）。

`fixtures/fixture-tt.zip` 全部 14 条（真实解包）：

```
data/default-user/characters/Fixture Character.png
data/default-user/chats/Fixture Character/2026-09-01.jsonl
data/default-user/worlds/fixture-world.json
data/default-user/OpenAI Settings/fixture-preset.json
data/default-user/settings.json
data/default-user/secrets.json
data/default-user/User Avatars/fixture-avatar.png
data/default-user/thumbnails/fixture-avatar.png
data/default-user/backups/auto-2026.json
data/extensions/third-party/test-extension/manifest.json
data/extensions/third-party/test-extension/index.js
data/_tauritavern/extension-sources/global/test-extension.json
data/_cache/derived.bin
data/content.log
```

TT 私有/派生前缀常量（`transform.js:79-99`）：
- 用户根 `data/default-user/`
- 全局扩展 `data/extensions/third-party/`
- 来源记录 `data/_tauritavern/extension-sources/`
- 应用级私有 `data/_tauritavern/`（window-state / mcp / skills / extension-store）、`data/default-user/tauritavern-settings.json`、`data/default-user/user/lan-sync/`
- 私有缓存 `data/_cache/`、`data/_css/`、`data/_errors/`、`data/content.log`、`data/content.log.1`
- 派生 `thumbnails/`、`vectors/`

TT 源实测（`data-zip/tauritavern-data-20260825-100035.zip`，705 条）按 `routeSource` 分类：
`user` 377、`extension-pkg` 306、`tt-private` 10、`tt-app-private` 9、`extension-source` 2。

---

## 2. 逐项映射表

操作类型定义：`直接复制`＝字节不变仅加减前缀；`改名`＝路径改写、内容字节不变；`结构转换`＝布局/作用域重构；`丢弃`＝不进产物；`新增`＝转换器合成；`冲突`＝同名导致一方被跳过。

### 2.1 Luker → TauriTavern（target=`tt`）

| Luker 源路径/字段 | TT 目标路径 | 操作 | 证据 |
| --- | --- | --- | --- |
| `manifest.json` | （无） | 丢弃 | `transform.js:613-619`；`out/real-l-to-tt.json` meta.dropped=1 |
| `settings.json` | `data/default-user/settings.json` | 改名 | `transform.js:1052-1054`；fixture 对照；CRC 全等 |
| `secrets.json` | `data/default-user/secrets.json` | 改名 | 同上 |
| `stats.json` / `macros.json` | `data/default-user/_compat/luker/{stats,macros}.json` | 结构转换（跨平台沙箱） | `transform.js:1014-1023`；纯函数实测 `targetEntryPath('stats.json','tt')` 返回该值 |
| `characters/<n>.png` | `data/default-user/characters/<n>.png` | 改名 | `transform.js:1052-1054`；L→TT 5 条角色卡 CRC 全等 |
| `chats/<owner>/<file>.jsonl` | `data/default-user/chats/<owner>/<file>.jsonl` | 改名 | 同上；18 条 jsonl CRC 全等 |
| `worlds/<n>.json` | `data/default-user/worlds/<n>.json` | 改名 | 同上；6 条 CRC 全等 |
| `OpenAI Settings/`、`instruct/`、`context/`、`sysprompt/`、`reasoning/`、`themes/` 等预设目录 | `data/default-user/<同名目录>/…` | 改名 | `inspect.js:68-88`；254 条 CRC 全等 |
| `User Avatars/`、`backgrounds/`、`assets/`、`user/`、`audio/` 等素材 | `data/default-user/<同名>/…` | 改名 | `inspect.js:89-108`；188 条 CRC 全等 |
| `image-metadata.json` | `data/default-user/image-metadata.json` | 直接复制（仅 TT 目标保留） | `transform.js:694-700`（仅 target=L 丢弃） |
| `extensions/<n>/**（用户级）` | `data/default-user/extensions/<n>/**` | 改名（保留 local 作用域） | `transform.js:986-988, 1043-1047` |
| `public/scripts/extensions/third-party/<n>/**`、`extensions/third-party/<n>/**（全局）` | `data/extensions/third-party/<n>/**` | 结构转换（归一 hub 再分流） | `transform.js:968-970, 982-985, 1043-1046` |
| `public/scripts/extensions/<内置>/**` | （无） | 丢弃 | `transform.js:972-981, 685-692` |
| `extensions/` 根散文件（如 `.gitkeep`） | （无） | 丢弃 | `transform.js:716-721`；L→TT 实测丢 `extensions/third-party/.gitkeep` |
| 同名全局副本（存在用户级时） | （无，仅留用户级） | 丢弃（冲突） | `transform.js:723-733`；当前代码丢弃 285 条（见 §5 D1） |
| 扩展内 `manifest.json` | 对应扩展目录下 `manifest.json` | 直接复制 | `transform.js:745-757` |
| 扩展 `.git/**` | 依 `gitMode` 保留/丢弃 | 直接复制或丢弃 | `transform.js:708-839`；本次产物 `gitMode=keep` 默认 |
| `backups/**`、聊天备份文件 | （默认无） | 丢弃 | `inspect.js:137-174`；`transform.js:588-595` |
| `thumbnails/`、`vectors/` | （默认无） | 丢弃（派生） | `transform.js:84, 666-678` |
| `_engine_dump.bin`、`_engine_meta.json` | （无，仅 L 目标透传） | 丢弃 | `transform.js:626-640` |
| `data/_tauritavern/extension-sources/…`（TT 源专有） | 见 §2.2 | — | `transform.js:930-943` |
| （合成） | `data/_tauritavern/extension-sources/{global\|local}/<n>.json` | 新增 | `transform.js:1323-1328, 1347-1384`；当前代码为 probe.zip 合成 **30** 条 |

### 2.2 TauriTavern → Luker（target=`l`）

| TT 源路径/字段 | L 目标路径 | 操作 | 证据 |
| --- | --- | --- | --- |
| `data/default-user/settings.json` | `settings.json` | 改名（去前缀） | `transform.js:909-924, 1052-1055`；CRC 全等 |
| `data/default-user/secrets.json` | `secrets.json` | 改名 | 同上 |
| `data/default-user/characters/…` | `characters/…` | 改名 | CRC 全等；34 条 |
| `data/default-user/chats/…` | `chats/…` | 改名 | CRC 全等；18 条 |
| `data/default-user/worlds/…` | `worlds/…` | 改名 | CRC 全等；7 条 |
| 预设/素材各目录 | 同名摊平目录 | 改名 | 254+28 条 CRC 全等 |
| `data/default-user/extensions/<n>/**（local）` | `extensions/<n>/**` | 改名 | `transform.js:911-914, 1043-1051` |
| `data/extensions/third-party/<n>/**（global）` | `extensions/<n>/**（当前代码拉平）` | 结构转换＋冲突 | `transform.js:926-929, 1043-1051, 723-733`；当前 294 条拉平；陈旧产物为 `extensions/third-party/<n>/`（见 D2） |
| `data/_tauritavern/extension-sources/**` | （无，解析后不写出） | 丢弃 | `transform.js:620-624, 1323-1328`（仅 PT/TT 目标产出来源记录） |
| `data/_tauritavern/**`（其他：window-state/mcp/skills/extension-store） | （无） | 丢弃 | `transform.js:944-947, 654-665` |
| `data/default-user/tauritavern-settings.json`、`user/lan-sync/**` | （无，未进 `_compat/tt/`） | 丢弃 | `transform.js:918-920, 654-665`；见 D3 |
| `data/_cache/`、`_css/`、`_errors/`、`content.log`、`user/cache/` | （无） | 丢弃 | `transform.js:921-923, 948-951, 641-652` |
| `thumbnails/`、`vectors/` | （无） | 丢弃（派生） | `transform.js:84, 666-678` |
| `data/default-user/backups/**` | （默认无） | 丢弃 | `transform.js:588-595` |
| `data/default-user/image-metadata.json` | （无） | 丢弃 | `transform.js:694-700` |
| `data/default-user/_compat/tt/<file>` | `_compat/tt/<file>`（保持沙箱） | 直接复制 | `transform.js:998-1012` |
| （合成） | `manifest.json`（`schemaVersion:1` + 10 类 selection） | 新增 | `transform.js:1164-1184`；产物实测内容见 §3.3 |
| （合成） | `_convert/extensions-manifest.json` | 新增 | `transform.js:1237-1264` |
| （合成） | `_convert/INSTALL.md`、`_convert/meta.json`（仅 ST 目标） | — | `transform.js:1330-1339` |

> 注：TT 源 **没有** `manifest.json`；L 的 manifest 是转换器合成的元数据，非 TT 字段迁移。

---

## 3. 样本核对结果

### 3.1 L→TT：`out/probe.zip` → `out/real-l-to-tt.zip`〔已证实〕

- 源 4315 条，产物 4315 条。按 `routeSource`+`targetEntryPath` 求期望路径集合大小 = 4315，与实际产物路径集合**完全一致**。
- 差集仅 2 条丢弃：`manifest.json`（kind=manifest）、`extensions/third-party/.gitkeep`（扩展根散文件）；合成 2 条：`data/_tauritavern/extension-sources/global/Extension-VideoBackgroundLoader.json`、`…/st-chatu8.json`。守恒：4315 − 2 + 2 = 4315。
- **字节核算**：对 4313 条成功映射条目逐一比对 CRC32 与未压缩大小 → `ok=4313, crcBad=0, sizeBad=0`。即**每条被复制条目解压后字节全等**。
- 产物 `TOP` 全部为 `data`（4315 条），无跨宿主垃圾路径（`stats.json`、`macros.json`、`_engine_*`、`content.log`、`thumbnails/`、`vectors/` 命中数均为 0；34 个 `manifest.json` 全在扩展目录内，属合法扩展清单）。

### 3.2 TT→L：`data-zip/tauritavern-data-20260825-100035.zip` → `out/real-tt-to-l.zip`〔已证实，产物陈旧〕

- 源 705 条，产物 650 条。报告（`out/real-tt-to-l.json`）：copied 649、dropped 54、synthesized 1 → 649+1=650。
- **字节核算**：649 条 CRC32 与大小全等（`crcBad=0, sizeBad=0`）。其中 306 条经「旧 third-party 路径」回退匹配（产物为 `extensions/third-party/<n>/`，当前代码为 `extensions/<n>/`）。
- 34 条未匹配全部为设计丢弃：`backups/` 1、`image-metadata.json` 1、`thumbnails/` 派生 32（真实文件名见 §打印清单，含中文角色名 PNG/JPG）。
- 产物无 `data/` 前缀残留、无 `_tauritavern` 残留、无 `tauritavern-settings.json`、无 `content.log`、无 `extension-sources`；顶层为摊平 L 结构 + 根 `manifest.json`。

### 3.3 合成清单内容核对〔已证实〕

TT→L 产物根 `manifest.json` 实际内容（`out/real-tt-to-l.zip`）：

```json
{
  "schemaVersion": 1,
  "createdAt": "2020-01-01T00:00:00.000Z",
  "handle": "default-user",
  "selection": {
    "settings": true, "secrets": true, "characters": true, "chats": true,
    "lorebooks": true, "presets": true, "assets": true,
    "extensions": true, "globalExtensions": true, "vectors": true
  }
}
```

与 `transform.js:1176-1182` 及 `L_SELECTION`（`transform.js:206-217`）逐字段一致；`handle` 缺省 `default-user`（`detect.js:33` 实测一致）。

L→TT 来源记录：当前代码为 probe.zip 合成 30 条（`2` 条 global + `28` 条 local），字段完整，例如：

```json
{
  "remote_url": "https://github.com/SillyTavern/Extension-VideoBackgroundLoader",
  "reference": "main",
  "installed_commit": "86abce5b1f6d942840c137772af096c68f223e39"
}
```

陈旧产物中的同名记录 `reference`/`installed_commit` 为空字符串——这是**旧版产物字段较旧**，当前代码已从 `.git/config` / `.git/HEAD` / `refs/heads/*` 提取完整 branch 与 40 位 commit（`transform.js:759-830, 1363-1374`）。不算当前缺陷。

### 3.4 当前代码复现（规避陈旧产物）〔已证实〕

通过 `io` 注入的只读 writer 实测：

| 方向 | 源 | 目标 | 产物条数 | copied | dropped | synthesized |
| --- | --- | --- | --- | --- | --- | --- |
| TT→L | tauritavern 705 | l | **639** | 637 | 66 | 2 |
| L→TT | probe 4315 | tt | **3408** | 3378 | 937 | 30 |

当前 TT→L 丢弃原因分布：派生缓存 32、开发/构建冗余 12、TT 私有 11、TT 应用私有 9、备份 1、`image-metadata.json` 1；警告「拉平 294 个扩展条目」。

当前 L→TT 丢弃原因分布：开发/构建冗余 **650**、同名全局副本 **260 + 25 = 285**、扩展根散文件 1、源 manifest 1；同名扩展为 `st-chatu8` 与 `Extension-VideoBackgroundLoader`（已证实两者在 probe.zip 中**同时存在 user 与 global 两种作用域**）。

> 差异解释：陈旧产物用旧代码+旧过滤选项生成（报告显示 L→TT 源 4416 条、丢 103；TT→L 源 705 条、丢 54），当前代码默认过滤更严，故条数不同。**不能用陈旧产物校验当前代码路径语义**。

---

## 4. 重点风险逐项结论

| 风险 | 结论 | 证据 |
| --- | --- | --- |
| 同名冲突、覆盖顺序 | **已证实**：四目标统一「用户级优先、全局副本跳过」（`transform.js:723-733`）；L→TT 实测丢弃 285 条全局副本。`zip-io.js:307,341` 的 `written` 集合对同名 `add/addLazy` 静默早返，故「先写先赢」；同名去重是该规则的前置闸。 | `transform.js:723-733`、`zip-io.js:306-363`、§3.4 |
| 二进制资源字节一致 | **已证实**：L→TT 111 个媒体文件（169752531 字节）+ TT→L 60 个（22268085 字节）随全量 CRC 核算零偏差；图片/音频以 `STORE_EXTENSIONS` level 0 直存，不重压缩。 | §3.1/§3.2、`zip-io.js:35-52, 266-276` |
| 聊天消息结构（swipes/extra/变量） | **已证实无损**：真实聊天行键含 `extra`、`swipes`、`swipe_id`、`swipe_info`、`variables`、`variables_initialized`；`chat_metadata` 含 `variables`、`extensions.LittleWhiteBox`、`LWB_SNAP`、`TavernDB_ACU_HotSnapshot`。CRC 全等证明全部字段逐字节保留。 | §0.2 法 4、§3.1、§3.4 聊天解析 |
| 角色卡内嵌世界书/正则/脚本 | **已证实**：角色卡为 `.png` 原字节流式直通（`addLazy`），L→TT 5 张、TT→L 34 张 PNG CRC 全等 ⇒ PNG 内嵌卡块（世界书/正则/脚本）随文件字节完整保留，未被拆解。 | `transform.js:855-857`、`zip-io.js:340-363`、§3.1/§3.2 |
| 扩展目录与第三方资源 | **已证实**：作用域归一 `extensions/<n>`（hub）再按目标分流；TT 保留 local/global 双目录，L 平铺；来源记录仅 PT/TT 目标产出；宿主自带插件整条剥离；`.git` 依 `gitMode` 处理。 | `transform.js:906-990, 997-1056, 1323-1328, 1347-1384`、fixture 对照 |
| 目标平台特有字段误带入对端 | **部分已证实**：产物扫描无跨宿主垃圾路径（§3.1/§3.2）。但 L 私有聊天元数据被**原样带入 TT**（TT 不消费），属透传而非误写；TT 应用私有设置在 TT→L 被丢弃（D3）。 | §3.1/§3.2、`transform.js:654-665` |

---

## 5. 缺陷候选（按严重度）

### D1【高】当前 L→TT 同名去重丢弃全局作用域扩展（285 条）
- **现象**：当前代码从 probe.zip 转 TT 时，因同名去重丢弃 `st-chatu8`（260 条）与 `Extension-VideoBackgroundLoader`（25 条）的**全局副本**；TT 产物里只剩 `data/default-user/extensions/<n>/` 的用户级副本。
- **证据**：`transform.js:723-733` 的同名判断**不区分目标**；`targetEntryPath` 的 TT 分支（`transform.js:1043-1047`）本可把 global 写入 `data/extensions/third-party/<n>/`、local 写入 `data/default-user/extensions/<n>/`，两者路径不同、无碰撞；当前运行 drop reason 实测「同名扩展 … 已有用户级副本，全局副本跳过」260+25；probe.zip 中两扩展均同时存在 user+global 作用域。
- **影响**：TT 侧全局扩展作用域降级为用户级，可能改变可见性/注入范围；285 条源文件被丢弃。虽规范（`tavern-datapack-formats.md:55-62`）明示「同名保留用户级」，但该规则对**存在双目录的 TT 目标**是否仍应生效需产品确认。
- **性质**：设计权衡导致的作用域丢失，非字节损坏。**待产品决策**。

### D2【中】陈旧产物路径与当前代码不一致，不可用于校验当前契约
- **现象**：`out/real-tt-to-l.zip` 中 306 条全局扩展位于 `extensions/third-party/<n>/`，当前代码输出 `extensions/<n>/`（294 条）。
- **证据**：产物 mtime `2026-09-03 23:23`，`transform.js` mtime `2026-11-17 02:20`；扩展作用域重构 commit `5731540`（2026-11-12）；实测当前 `routeSource` 输出 `hubPath=extensions/JS-Slash-Runner/.editorconfig`，`targetEntryPath(...,'l')` 返回同名平铺路径，而产物为 `extensions/third-party/JS-Slash-Runner/.editorconfig`。
- **影响**：任何基于 `out/real-*` 的反向映射结论都会误导；`test/real-samples.test.js` 的镜像断言在该产物上通过，但验证的是旧语义。
- **建议**：以当前代码重新生成产物后再做回归基线。

### D3【中】TT 应用私有设置 `tauritavern-settings.json` 在 TT→L 被丢弃，未进 `_compat/tt/`
- **现象**：TT 源含 `data/default-user/tauritavern-settings.json`，TT→L 产物中不存在，也未落在 `_compat/tt/tauritavern-settings.json`。
- **证据**：`routeSource` 将其判为 `tt-app-private`（`transform.js:918-920`），主循环对非 TT 目标直接丢弃（`transform.js:654-665`）；当前运行 drop reason「TT 应用私有设置,仅 TT 目标有意义」9 条含该文件；`targetEntryPath` 虽定义 `_compat/tt/` 分支（`transform.js:1025-1034`），但纯函数实测 `targetEntryPath('tauritavern-settings.json','l')='_compat/tt/tauritavern-settings.json'` 只对**非 TT 源**路径可达，TT 源走不到。
- **影响**：TT 私有配置在迁往 L 时不可逆丢失。
- **建议**：若需保留，应在 `routeSource` 前或 `tt-app-private` 分支将其改写为 `hubPath='_compat/tt/tauritavern-settings.json'` 再走沙箱落点。

### D4【中】TT→L 丢失 `extension-sources`，扩展迁 L 后失去升级/重装来源
- **现象**：TT 源含 2 条 `data/_tauritavern/extension-sources/local/*.json`（`JS-Slash-Runner`、`ST-Prompt-Template`），L 产物 0 条。
- **证据**：`transform.js:620-624` 解析后 `continue`（不写出）；`buildExtensionSources` 仅在 PT/TT 目标产出（`transform.js:1323-1328`）；TT→L 报告 meta.dropped=5、synthesized=1（仅根 manifest）。
- **影响**：迁入 L 的扩展没有 `remote_url/reference/installed_commit`，无法凭包内信息在线更新或按原提交重装。
- **性质**：设计约束（L 无来源记录机制）+ 信息损失。**待产品确认是否需以 `_convert/` 清单形式旁路保留**。

### D5【低】当前默认过滤导致 L→TT 条目数从 4315 骤降至 3408
- **现象**：当前代码丢 937 条（650 条「开发/构建冗余」+ 285 条同名全局 + 1 散文件 + 1 manifest），而陈旧产物为 4315 条全保留。
- **证据**：`isJunkOrDevFile`（`transform.js:127-193`）按 `.map`/`.test.js`/`node_modules` 等剔除；§3.4 drop 计数。
- **影响**：产物内容/体积与历史基线差异巨大；若用户期望「全量迁移」，默认行为可能不符预期。属行为变更而非明确故障。

### D6【低】L 私有聊天元数据原样带入 TT（语义噪声）
- **现象**：L→TT 产物聊天 jsonl 含 `chat_metadata.variables`、`extensions.LittleWhiteBox`、`LWB_SNAP`、`TavernDB_ACU_HotSnapshot` 等 L 扩展私有字段。
- **证据**：真实聊天解析 + CRC 全等（§3.4、§4）。
- **影响**：字节无损，TT 通常忽略未知字段；但存在数据冗余与潜在兼容风险，且 TT→L 反向同样把 TT 侧字段带回 L。
- **建议**：文档明确「聊天内容按字节透传，平台不清理对端私有字段」。

---

## 6. 不可逆项汇总〔已证实〕

以下在对应方向**不可从产物恢复**，需在转换前告知用户：

1. `manifest.json`（L 的 schemaVersion/handle/selection）→ TT 目标丢弃。
2. `tauritavern-settings.json`、`user/lan-sync/**`、`data/_tauritavern/**`（mcp/skills/window-state/extension-store）→ L 目标丢弃（D3）。
3. `extension-sources`（remote_url/reference/commit）→ L 目标丢弃（D4）。
4. `data/_cache/`、`_css/`、`_errors/`、`content.log`、`thumbnails/`、`vectors/` → 对端丢弃（派生可重建，应用私有不可）。
5. `backups/**`、聊天备份快照 → 默认丢弃（`includeBackups`/`keepAll` 可保留）。
6. `image-metadata.json` → L 目标丢弃。
7. 同名全局扩展副本 → 丢弃（D1）。
8. 宿主自带插件、`extensions/` 根散文件、`_engine_dump.bin`/`_engine_meta.json`（非 L 目标）→ 丢弃。
9. `gitMode=strip/minimal` 下的 `.git` 对象存储 → 丢弃（本次样本默认 keep，未触发）。

---

## 7. 建议修法（仅建议，不改代码）

1. **D1**：让同名去重按目标分流——TT/PT 目标下 local 与 global 落在不同目录、无路径碰撞，可不丢全局副本；仅 ST/L 平铺目标保留「用户级优先」。或在 UI 明确提示「全局副本将降级/丢弃」，由用户选择。
2. **D2**：以当前代码重新生成 `real-*-to-*.zip` 基线，并让 `test/real-samples.test.js` 的镜像规则随当前布局语义更新（当前 306 条 third-party 路径断言在新产物上应改写）。
3. **D3**：在 `routeSource` 的 `tt-app-private` 分支对 `tauritavern-settings.json` 走 `_compat/tt/` 落点，使其像 `stats.json`/`macros.json` 一样跨宿主可回带。
4. **D4**：TT→L 时把来源记录折算进 `_convert/extensions-manifest.json` 的字段（若 L 侧插件可消费），或至少在报告 warn 中列出被丢弃的来源扩展名。
5. **D5**：提供 `keepDevFiles=true` / 全量选项的显式入口，并在 UI 展示当前将丢弃的条目数与字节数（`Report.toJSON().totals.droppedBytes` 已可支撑）。
6. **D6**：在 README/开发者指南补充「聊天与角色卡为字节级透传，对端私有字段不清理」的明确说明。
7. **通用**：为 L↔TT 增加一条「当前代码产物 vs 源」的 CRC 守恒回归用例（本次已手工验证 4313/649 条零偏差），把字节级结论固化为自动断言。

---

## 8. 已证实 vs 待验证

### 已证实（本报告全部数值与结论）
- 双方目录契约、判定规则、10 大类目映射（`detect.js` / `inspect.js` / `transform.js` 逐行）。
- L→TT 4313 条、TT→L 649 条 CRC32 零偏差。
- 合成 manifest 与 30 条 extension-sources 的字段内容。
- 当前代码两方向的 copied/dropped/synthesized 与丢弃原因分布。
- 陈旧产物与当前代码的路径/条数差异及其时间线。

### 待验证（无样本或需实机）
- **〔待验证〕** TT 实际导入 `data/extensions/third-party/<n>/` 与 `data/default-user/extensions/<n>/` 的加载优先级，是否真如规范所述「local 优先」（规范 `tavern-datapack-formats.md:55-62` 声明，但本机无 TT Rust 工具链，见该文件 `:226-230`）。验证方法：在 Dev TT 实例同时放两份同名扩展，观察实际加载目录。
- **〔待验证〕** TT 是否忽略聊天 jsonl 中 L 私有字段（`LittleWhiteBox`/`TavernDB_ACU_HotSnapshot`）。验证方法：导入 L→TT 产物后打开对应聊天，检查是否报错或字段被清。
- **〔待验证〕** `stats.json`/`macros.json` 经 `_compat/luker/` 沙箱落点后，TT 是否真的不消费、且迁回 L 时能否正确拆包（纯函数已验证路径，实机往返未做）。
- **〔待验证〕** D1 中全局扩展降级为 local 后，TT 的全局注入/可见性是否受影响（需 TT 实机）。

---

## 附录：核对命令（可复现）

所有核对均用 `node --input-type=module -e` 内联调用项目自身 `zipIo`，未写任何文件。核心片段：

```js
import { zipIo } from './src/core/zip-io.js';
import { routeSource, targetEntryPath } from './src/core/transform.js';
import { LAYOUTS } from './src/core/detect.js';
// 读中央目录：openReader → for await (entry of reader.entries()) → {fileName, crc32, uncompressedSize}
// 期望路径：targetEntryPath(routeSource(name, layout).hubPath, target, scope)
// 当前代码产出：convert(src, '__mem__', { target, io: { openReader: zipIo.openReader,
//   createWriter: async () => ({ add, addLazy, waitForRoom, getStoreStats, close, abort }) } })
```

报告完毕。
