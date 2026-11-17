# 文档站同步基线（2026-11-17 用户要求，待实现）

> **状态：⏳ 待实现。** 目标：README / docs 中英 / 截图 / 教程 / 开发者指南一条线同步，CI 可验证，禁止只改一半。

## 1. 唯一基线

- `docs-sync.manifest.json`（入库）：
  - `pairs`：每个中文用户页 ↔ 对应 `*.en.md`（`DEVELOPER-GUIDE.md` 允许 `translation: pending`）。
  - `screenshots`：每个含截图的页面 ↔ `docs/assets/shots/*.png`。
  - `files`：源/派生物的 sha256 + `updatedAt`。
- `tooling/docs-sync.mjs`：
  - `--verify`：缺失译文/截图、源变了但译文/截图没变 → 失败并列出。
  - `--update`：人工确认后刷新基线；**CI 不自动 update**。
- `package.json`：`docs:verify` / `docs:update` / `docs:shots`（截图脚本已有 `tooling/capture-docs-shots.cjs`）。

## 2. CI / 部署

- `.github/workflows/checks.yml` 加 `npm run docs:verify`。
- `.github/workflows/deploy.yml` 在 Jekyll 构建前加 `npm run docs:verify`。
- **当前 docs 布局白名单会拒绝 `.en.md` / `docs.js` / `assets/`**：
  `checks.yml` 的 `allowed` 循环必须放行 `docs.js`、`*.en.md`、`assets` 目录，否则 CI 必红。
- `docs/_config.yml` 已 exclude `PLAN-*` / `plans` / `.trellis` / `node_modules`；新增文件不得绕过。

## 3. 文档落点

- `README.md`「开发与质量」加 `npm run docs:verify`。
- `docs/DEVELOPER-GUIDE.md` 增加「文档同步发布检查表」：
  代码 → 教程 → README → docs 中/英 → 截图 → 基线 → 测试。
- 本页即规范；后续如需拆分，保持单文件 < 32768 字节。

## 4. 验收

- `npm run docs:verify` 通过；故意改一个中文页但不改英文页/截图 → 必须失败。
- CI 与 deploy 均执行 verify；Jekyll 构建通过。
- `docs/` 只含公开用户文档，不含 PLAN/HANDOFF/research/交接。
