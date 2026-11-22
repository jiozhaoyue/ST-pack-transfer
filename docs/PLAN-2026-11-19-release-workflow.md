# 计划：发版改为 tag + Release，offline HTML 移出版本控制

记录时间：2026-11-19
状态：待执行（用户已裁定）

## 用户裁定（2026-11-19）

| 决策项 | 结论 |
| --- | --- |
| 发版方式 | 新建独立 `release.yml`；push `v*` tag 时构建单文件 HTML、创建 Release、上传 asset |
| Pages 部署 | `deploy.yml` 保持不变 |
| offline html | **从版本控制移除**，`.gitignore` 加入 `download/`，只走 Release asset |
| 按需克隆（sparse-checkout） | **不做此功能** |

## 背景（覆盖既有裁定）

`deploy.yml:4` 原文：

> 2026-11-17 用户裁定：发布只打 tag，不创建 GitHub Release，因此改为 tag push 触发。

2026-11-19 用户改为：每次 tag **同时**发 Release 并附 HTML。
需在同一次提交里更新该注释与相关文档，避免文档与实现再次漂移。

## 一、现状实测

| 项 | 事实 |
| --- | --- |
| `download/ST-pack-transfer-offline.html` | **3.83 MB**，已被 git 跟踪 |
| `.gitignore` | 只忽略 `dist-offline/`（第 24 行），未忽略 `download/` |
| workflow | `checks.yml`（push/PR）、`deploy.yml`（`v*` tag + 手动） |
| Release 能力 | **无** |
| 插件实际安装体积 | **约 4.2 MB**（`src/` 3.9M + `index.js` 120K + `style.css` 200K + manifest/README） |
| 不入插件的大目录 | `download/` 3.7M、`dist-offline/` 7.4M、`test/` 1.3M、`docs/` 2.2M、`zip/` 200M、`data-zip/` 1.2G |

结论：插件安装体积本就只有 4.2MB，`download/` 与 `dist-offline/` 是纯发布产物，
不属于插件运行必需。移出版本控制即可解决 clone 膨胀，**无需 sparse-checkout**。

## 二、实施步骤

### 1. 新建 `.github/workflows/release.yml`

- 触发：`push: tags: ['v*']`；另加 `workflow_dispatch` 便于补发
- 权限：`contents: write`（创建 Release + 上传 asset）
- 步骤：
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4`（node 22，cache npm）
  3. `npm ci`
  4. `npm test`（发版门槛，铁律 13）
  5. `npm run build:offline`
  6. 校验产物存在且非空：`dist-offline/ST-pack-transfer-offline.html`
  7. `gh release create` 或 `softprops/action-gh-release`
     - asset：`dist-offline/ST-pack-transfer-offline.html`
     - `generate_release_notes: true`
     - 若 Release 已存在则上传覆盖（`fail_on_unmatched_files: true`）

### 2. 移出 offline html

- `.gitignore` 增加 `download/`
- `git rm --cached download/ST-pack-transfer-offline.html`（保留本地文件）
- 注意：`build:offline` 仍会写入 `download/`，故该目录必须被忽略
- 复用授权：这是「删除/移出版本控制」操作，需用户已授权 → 已获得裁定

### 3. 文档链接改为 Release asset

需同步更新（每处都查实际文案）：
- `docs/index.md`（「离线单文件 HTML」表格行）
- `docs/install.md`
- `docs/DEVELOPER-GUIDE.md`（`download/ST-pack-transfer-offline.html` 三处）
- `README.md`、`README.en.md`

新链接格式：
`https://github.com/jiozhaoyue/ST-pack-transfer/releases/latest/download/ST-pack-transfer-offline.html`

### 4. 更新 deploy.yml 注释

把第 3–4 行注释改为与新策略一致（Pages 与 Release 分工说明）。

## 三、验收标准

- [ ] `.github/workflows/release.yml` 存在，YAML 合法
- [ ] 本地 `git check-ignore download` 有输出
- [ ] `git ls-files download` 为空
- [ ] `npm run build:offline` 仍能在本地生成 `download/ST-pack-transfer-offline.html`
- [ ] 文档四处链接均指向 `releases/latest/download/...`
- [ ] `deploy.yml` 注释与新策略一致
- [ ] push `v*` tag 后 Release 页面出现 asset（需真实 tag 才能验证，标注为「待实机验证」）
- [ ] `npm test` 全绿

## 四、风险

| 风险 | 处理 |
| --- | --- |
| 首次 Release 需要 tag | 文档写明：打 tag 才会生成 |
| `releases/latest/download` 在无 Release 时 404 | 首次发布前文档标注「需 v1 之后可用」 |
| `git rm --cached` 会影响他人工作区 | 保留本地文件，仅取消跟踪；在提交信息说明 |
| 旧 tag 无 Release | 不回填历史，只保证新 tag 起生效 |
