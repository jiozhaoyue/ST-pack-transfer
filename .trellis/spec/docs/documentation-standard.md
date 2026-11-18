# 文档规范（入库版）

适用范围：仓库根目录 `README.md`、`README.en.md`、`docs/` 下全部 Markdown，以及 `package.json` 中脚本的文档映射。本规范为入库强制条款，每条给出「必须 / 禁止 + 判据 + 违反示例」。判据命令均可在仓库根目录（Git Bash）直接运行；`grep -P` 需 GNU grep（Git Bash 默认满足）。

当前状态（供对照，非规范正文）：`README.md` 与 `README.en.md` 均已精简至 103 行、各 8 个二级标题、无标题 emoji；截图全部引用 `docs/assets/shots/` 且经 `test -f` 验证；`docs/` 内无内部计划文件（`PLAN-*` 已移至 `.trellis/workspace/`）。规范的判据脚本应长期保持可执行为 0 告警。

---

## 1. README 结构与长度

**必须**
- 首段给出一句话定位（本项目做什么、给谁用），位于任何二级标题之前。
- 依次包含六个区块：截图区、核心功能、安装与启动、隐私说明、许可，以及在线使用入口。
- 正文总行数 ≤ 150 行；超出部分必须拆到 `docs/` 并在对应位置给出链接。

**禁止**
- 禁止在标题中使用 emoji 或其它装饰符号。
- 禁止自夸词，例如「100% 健壮」「完美支持」「业界领先」「无懈可击」。
- 禁止无信息量的营销段落（只有情绪、没有功能/限制/命令的段落）。

**判据**
```bash
test "$(wc -l < README.md)" -le 150 || echo "README 超过 150 行，必须拆分"
for kw in '截图' '核心功能' '安装' '隐私' '许可'; do grep -q "$kw" README.md || echo "缺少区块: $kw"; done
grep -rnE '100% 健壮|完美支持|业界领先|无懈可击' README.md
node -e 'const fs=require("fs");const s=fs.readFileSync("README.md","utf8").split(/\r?\n/);const re=/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]/;s.forEach((l,i)=>{if(/^#{1,6}\s/.test(l)&&re.test(l))console.log("标题含装饰符 README.md:"+(i+1))})'
```

**违反示例**
- `README.md:1` `## 📸 界面实拍` —— 标题含 emoji。
- `README.md` 266 行 —— 超长且未拆分。
- 写「完美支持全部四端，绝无兼容问题」—— 自夸且无信息量。

---

## 2. 多语言 README

**必须**
- `README.md`（中文）与 `README.en.md`（英文）成对存在。
- 两版二级标题数量相等且顺序、语义一一对应。
- 两版顶部各放一条语言切换链接，指向对方文件。
- 代码块、命令、路径、参数名逐字一致，不得翻译。

**禁止**
- 禁止只有单语 README。
- 禁止两版章节数或顺序不一致。
- 禁止翻译命令、路径、配置项（如把 `npm run docs:shots` 改写为其它形式）。

**判据**
```bash
test -f README.md && test -f README.en.md || echo "README 未成对"
[ "$(grep -c '^## ' README.md)" = "$(grep -c '^## ' README.en.md)" ] || echo "章节数不一致"
grep -q 'README.en.md' README.md || echo "中文版缺语言切换链接"
grep -q 'README.md' README.en.md || echo "英文版缺语言切换链接"
```

**违反示例**
- 当前仓库仅有 `README.md`，无 `README.en.md` —— 单语违规。
- 中文版 11 个二级标题、英文版 9 个 —— 章节数不等。

---

## 3. 截图规则

**必须**
- README 只能引用 `docs/assets/` 下的正式资产。
- 截图由教程演示模式生成（`npm run docs:shots`），不得包含真实用户数据。
- 每张图片必须有非空替代文本（alt）。

**禁止**
- 禁止引用 `review-shots/`、`test-results/`、`tmp/` 等临时目录。
- 禁止引用真实用户数据截图或带本机绝对路径的图片。

**判据**
```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("README.md","utf8");const re=/!\[([^\]]*)\]\(([^)]+)\)/g;let m,bad=0;while((m=re.exec(s))){const alt=m[1].trim(),p=m[2].trim().split(/\s+/)[0];if(!alt){console.log("无 alt: "+p);bad++}if(!p.startsWith("docs/assets/")){console.log("非正式资产: "+p);bad++}else if(!fs.existsSync(p)){console.log("文件不存在: "+p);bad++}}console.log(bad?("截图违规 "+bad+" 处"):"截图检查通过")'
```

**违反示例**
- `README.md:21` `![...](review-shots/04-desktop-workbench-full.png)` —— 引用临时目录。
- `README.md:25` `![...](review-shots/03-desktop-ext-package-single-line.png)` —— 同上。
- `![](docs/assets/shots/x.png)` —— alt 为空。

---

## 4. docs/ 目录信息架构

**必须**
- 入口页 `docs/index.md` 必须能链接到每一篇文档（含英文版入口）。
- 每篇 `X.md` 必须有对应 `X.en.md`（front matter 双语例外需在 index 显式说明）。
- 文件名只用小写字母、数字与连字符。

**禁止**
- 禁止孤立文档（无任何入口链接）。
- 禁止中文文件名、大写字母文件名、下划线文件名。

**判据**
```bash
node -e 'const fs=require("fs"),cp=require("child_process");const idx=fs.readFileSync("docs/index.md","utf8");const files=cp.execSync("git ls-files \"docs/*.md\"").toString().trim().split(/\r?\n/);for(const f of files){const b=f.replace(/^docs\//,"");if(/\.en\.md$/.test(b))continue;if(!fs.existsSync(f.replace(/\.md$/,".en.md")))console.log("缺英文版: "+f);const n=b.replace(/\.md$/,"");if(!idx.includes("("+n+".md")&&!idx.includes("("+n+".html"))console.log("孤立文档: "+f);if(/[A-Z_\u4e00-\u9fff]/.test(n))console.log("命名违规: "+f)}'
```

**违反示例**
- 新增 `docs/new-feature.md` 却未加入 `docs/index.md` —— 孤立文档。
- 文件名为 `docs/使用说明.md` 或 `docs/How_To.md` —— 命名违规。

---

## 5. Markdown 排版硬规则

**必须（六条）**
- 标题层级不跳级：只能 h2→h3，禁止 h2→h4。
- 代码围栏必须标语言（```js、```bash 等）。
- 表格各行列数一致（管道符数量相同）。
- 中文与英文/数字之间加空格。
- 中文正文用中文标点：，。；：（）。
- 行尾无空格。

**禁止（六条）**
- 禁止标题跳级；禁止裸围栏；禁止表格列数不齐。
- 禁止中英文粘连（如「使用npm命令」）。
- 禁止中文句子使用半角 , . ; : ( ) 。
- 禁止行尾空白字符。

**判据**
```bash
# 行尾空格
grep -rnE '[[:blank:]]+$' --include='*.md' README.md docs/
# 中英文之间缺空格
grep -rnP '[\x{4e00}-\x{9fff}][A-Za-z0-9]|[A-Za-z0-9][\x{4e00}-\x{9fff}]' --include='*.md' README.md docs/
# 中文句内半角标点（启发式，命中后人工确认是否在代码块内）
grep -rnP '[\x{4e00}-\x{9fff}][^()]*[,;:()][^()]*[\x{4e00}-\x{9fff}]' --include='*.md' README.md docs/
# 标题跳级 / 裸围栏 / 表格列数
node -e 'const fs=require("fs"),cp=require("child_process");const B=String.fromCharCode(96);const files=cp.execSync("git ls-files \"*.md\"").toString().trim().split(/\r?\n/);for(const f of files){let prev=0,open=false,n=0;fs.readFileSync(f,"utf8").split(/\r?\n/).forEach((s,i)=>{const h=s.match(/^(#{1,6})\s/);if(h){const lv=h[1].length;if(lv>prev+1)console.log(f+":"+(i+1)+" 标题跳级 h"+prev+"→h"+lv);prev=lv}const fence=s.match(new RegExp("^"+B+"{3,}(.*)"));if(fence){if(!open&&!fence[1].trim())console.log(f+":"+(i+1)+" 围栏缺语言");open=!open}if(/^\s*\|/.test(s)){const c=(s.match(/\|/g)||[]).length;if(!n)n=c;else if(c!==n)console.log(f+":"+(i+1)+" 表格列数 "+c+"≠"+n)}else n=0})}'
```

**违反示例**
- `### 功能` 之后直接 `##### 子项` —— 跳级。
- 裸 ``` 围栏无语言标注。
- 「使用npm运行」—— 中英文无空格；「注意,请确认(重要)」—— 半角标点。

---

## 6. 术语一致性

**必须**
- 全文统一使用下表的「唯一写法」；术语表至少 10 条。
- 「待导出区」与「导出队列」指同一概念，统一写作「待导出区」，禁用「导出队列」（含界面文案、注释、文档）。
- 新术语须先加入本表再使用。

| 术语 | 唯一写法 | 禁用变体 |
| --- | --- | --- |
| Git 可视化 | Git 可视化 | Git 图形化 / Git 图表 / Git 历史图 |
| 数据包 | 数据包 | 备份包 / 转运包 / 数据包文件 |
| 扩展 | 扩展 | 插件包 / 附加组件 |
| 待导出区 | 待导出区 | 导出队列 / 导出区 / 待导出列表 |
| 宿主 | 宿主 | 母酒馆 / 载体 / 宿主环境 |
| 布局码 | 布局码 | 布局编码 / layout code |
| 平台码 | 平台码 | 平台编码 / platform code |
| 酒馆 | 酒馆 | Tavern / 酒馆程序 |
| 云端备份 | 云端备份 | 云备份 / 远程备份 |
| 任务队列 | 任务队列 | 任务列表 / 作业队列 |
| 分卷 | 分卷 | 分片包 / 分割包 |
| 清单模式 | 清单模式 | manifest 模式 / 仅清单 |

**禁止**
- 禁止同一概念混用多个写法。
- 禁止使用表中「禁用变体」列词语。

**判据**
```bash
grep -rnE '导出队列|Git 图形化|Git 图表|备份包|插件包|manifest 模式' --include='*.md' README.md docs/
```

**违反示例**
- 文档中写「导出队列」—— 应改为「待导出区」。
- 同一篇先写「备份包」后写「数据包」—— 术语混用。

---

## 7. 文档与代码一致性

**必须**
- 命令文档与 `package.json` 的 `scripts` 双向对应：文档出现的 `npm run X` 中 X 必须存在；新增脚本必须有文档。
- `docs/DEVELOPER-GUIDE.md` 的目录结构描述必须与 `src/` 真实结构一致。
- 任何行为变更（铁律 22）必须在同一次提交内同步更新 `README.md` 与 `docs/DEVELOPER-GUIDE.md`；只改代码不改文档视为未完成。

**禁止**
- 禁止文档中出现不存在的脚本命令。
- 禁止文档目录结构与 `src/` 不符。
- 禁止改了 `src/` 却不同步两份文档。

**判据**
```bash
node -e 'const fs=require("fs"),cp=require("child_process");const scripts=Object.keys(JSON.parse(fs.readFileSync("package.json","utf8")).scripts);const files=cp.execSync("git ls-files \"README.md\" \"docs/*.md\"").toString().trim().split(/\r?\n/);let bad=0;for(const f of files){const s=fs.readFileSync(f,"utf8");const re=/npm run ([A-Za-z0-9:_-]+)/g;let m;while((m=re.exec(s))){if(!scripts.includes(m[1])){console.log(f+" 未定义脚本: npm run "+m[1]);bad++}}}console.log(bad?("命令不一致 "+bad+" 处"):"命令检查通过")'
find src -maxdepth 1 -mindepth 1 -type d -printf '%f\n' | sort
git diff --name-only -- src/ | grep . && echo "存在 src/ 改动：请核对 README.md 与 docs/DEVELOPER-GUIDE.md 是否同提交更新"
```

**违反示例**
- 文档写 `npm run docs:shotsx` —— `package.json` 无此脚本。
- 改动 `src/ui/workbench-view.js` 却未在 `README.md`、`docs/DEVELOPER-GUIDE.md` 增加对应条目。

---

## 校验脚本清单

每条规范对应一个可执行命令；下表为索引，完整命令见对应章节「判据」段。表格内 `\|` 为转义，实际执行时写成单竖线 `|`。

| 规范 | 可执行命令 |
| --- | --- |
| 1 长度 | `test "$(wc -l < README.md)" -le 150 \|\| echo FAIL` |
| 1 区块 | `for kw in '截图' '核心功能' '安装' '隐私' '许可'; do grep -q "$kw" README.md \|\| echo FAIL; done` |
| 1 自夸/emoji | `grep -rnE '100% 健壮\|完美支持\|业界领先' README.md`；标题 emoji 用第 1 节 node 命令 |
| 2 成对 | `test -f README.md && test -f README.en.md` |
| 2 章节数 | `[ "$(grep -c '^## ' README.md)" = "$(grep -c '^## ' README.en.md)" ]` |
| 3 截图 | 第 3 节 `node -e ...` 命令（检查 alt、`docs/assets/` 前缀、文件存在） |
| 4 入口/成对/命名 | 第 4 节 `node -e ...` 命令 |
| 5 行尾空格 | `grep -rnE '[[:blank:]]+$' --include='*.md' README.md docs/` |
| 5 中英空格 | 第 5 节 `grep -rnP` 命令 |
| 5 标题/围栏/表格 | 第 5 节 `node -e ...` 命令 |
| 6 术语 | `grep -rnE '导出队列\|Git 图形化\|备份包\|manifest 模式' --include='*.md' README.md docs/` |
| 7 脚本对应 | 第 7 节 `node -e ...` 命令 |
| 7 目录结构 | `find src -maxdepth 1 -mindepth 1 -type d -printf '%f\n' \| sort` |
| 7 铁律 22 | `git diff --name-only -- src/` 与 `git diff --name-only -- README.md docs/DEVELOPER-GUIDE.md` 必须同时非空 |
