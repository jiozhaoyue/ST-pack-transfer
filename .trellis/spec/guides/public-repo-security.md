# 公开仓安全边界与历史清理（2026-11-17）

> 适用：ST-pack-transfer 公开仓。本页是 durable contract。
> `.trellis/spec/` 与 `.trellis/scripts/` 脱敏后**随公开仓分发**；`.trellis/research/`、`.trellis/workspace/`、`.trellis/tasks/` 仍只留本地。

## 1. 公开仓跟踪白名单

**允许**：产品源码（`src/`、`index.js`、`index.html`、`style.css`、`manifest.json`、`vite.config.js`、`package*.json`）、公开文档（`docs/` 下 19 个用户页面）、测试（`test/`）、构建与 CI（`.github/workflows`、`tooling/`）、**规范与校验器（`.trellis/spec/`、`.trellis/scripts/`）**、`LICENSE` / `README.md` / `SECURITY.md`。

**禁止**：`.trellis/research/**`、`.trellis/workspace/**`、`.trellis/tasks/**`、`docs/PLAN-*`、`docs/HANDOFF-*`、`docs/research/**`、`docs/superpowers/**`、`e2e/`、`scripts/`、`fixtures/`、`dist/`、`.unipi/`、`.private/`、真实数据包、本机绝对路径、Windows 用户名、本地邮箱、任何凭据。

## 2. 可执行判据

- `git ls-files .trellis/research .trellis/workspace .trellis/tasks` 必须为空。
- `git ls-files .trellis/spec` 必须非空（规范是交付物）。
- `git grep -I -F '<windows-user>' HEAD`、`'<PATH>'`、`'<USER>@local'` 必须无输出。
- 对象级：遍历 `git cat-file --batch-all-objects --batch` 的全部 blob，上述模式零命中。
- `git log --all -S '<pattern>' --oneline` 必须为空。
- `git rev-list --objects --all` 不得出现 `.trellis/research` / `.trellis/workspace` / `docs/PLAN` / `docs/HANDOFF` / `docs/research` / `docs/superpowers` / `e2e/` / `scripts/` / `fixtures/` / `dist/` / `.unipi`。

## 3. 历史重写流程（2026-11-17 已执行）

1. 备份：`git clone --mirror` 到仓外 + `git bundle create --all` + `robocopy .trellis`。
2. 重写：`git filter-repo --invert-paths --path ... --replace-text <file> --mailmap <file>`。
3. 验证：敏感串零命中；产品文件零丢失（原 HEAD 文件清单与 blob 对比，仅 `AGENTS.md` / `CLAUDE.md` 因路径替换变化）；每个 tag 树无禁路径。
4. 远端：删库重建（`gh repo delete` + `gh repo create --source . --push`）；重建后必须手动创建 Pages 站点。
5. 本地：`git fetch --prune --tags --force` → 删旧 tag / `refs/pi-checkpoints/*` / `refs/pi-rewind/store` / stash → `git reset --hard origin/main` → 从备份恢复 `.trellis` → `git reflog expire --expire=now --all` + `git gc --prune=now --aggressive`。
6. 部署：`gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow` → `gh workflow run deploy.yml --ref main`。

## 4. 发版纪律

- 全部改动完成前不打任何 tag；旧 tag 全部丢弃，不继承。
- `v0.5.0` 在全部改动完成后创建。
- 发版前必须：`npm test` 全绿、`npm run build` 成功、`npm run check:docs-privacy` 通过。

## 5. 本次证据

- 历史 293 commits；对象库 3240 objects / 3.14 MiB；1766 blobs 扫描零命中。
- 产品文件：原 HEAD 1227 → 377，缺失 0 / 多余 0；仅 `AGENTS.md`、`CLAUDE.md` 因路径替换变化。
- 测试：139 files passed / 1 skipped；1304 tests passed / 2 skipped。
- 构建：`vite build` 成功（1.77s）。
- 线上：`/` 200、`/docs/` 200、旧 PLAN 页 404、旧提交 404。
- 备份：仓外 `_backups/ST-pack-transfer-2026-11-17.git` / `.bundle` / `.trellis` 副本。
