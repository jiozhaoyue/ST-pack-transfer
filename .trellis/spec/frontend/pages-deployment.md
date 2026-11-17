# 两个云端 Page：定义与部署规则

> 用户裁定（2026-11-17）：“两个 page”只指 **GitHub Pages 的云端页面**，与本地 dev/preview/酒馆实例页面无关。

## 一、两个 Page 是什么

| # | 页面 | URL | 内容 |
| --- | --- | --- | --- |
| 1 | 插件 Web 页 | `https://jiozhaoyue.github.io/ST-pack-transfer/` | 根路径，`dist/` 生产构建 |
| 2 | 文档站 | `https://jiozhaoyue.github.io/ST-pack-transfer/docs/` | `docs/` 经 Jekyll 构建 |

两者由**同一个** `Deploy to GitHub Pages` 工作流一次部署：
根 = 插件构建产物，`/docs/` = 文档站。只存在这两个页面，不新建第二个 Pages 站点。

**术语纪律**：说“两个 page”时只能指上表两项；不得用来指本地 3040、酒馆实例页（8001–8005/8899）或其他预览。

## 二、更新规则（MUST）

1. 任何影响插件运行或 `docs/` 内容的提交，合并到 `main` 后**必须重新部署**：
   - 手动触发：`gh workflow run "Deploy to GitHub Pages" --ref main`；或
   - 打 `v*` tag 触发（工作流仅在 tag push 与手动触发时运行）。
2. 部署后必须验证**两个 URL 都返回 200**，且页面内容包含本次改动；只验证根或只验证 `/docs/` 均视为未完成。
3. 部署失败必须记录 run id、失败步骤与日志；不得用“已推送”代替“已上线”。
4. 只保留这两个云端页面；不得新增 Pages 站点、不得把预览站当产品页。
5. **必须恰好两条 active deployment，各占一个 environment**（2026-11-17 用户裁定）：
   - `github-pages` → 本体 Web 页，URL `https://jiozhaoyue.github.io/ST-pack-transfer/`；
   - `github-pages-docs` → 文档站，URL `…/docs/`。
   同一 environment 同一时刻只允许一条 active，所以两个 page 必须用**两个不同 environment**；
   若都塞进 `github-pages`，后一条会把前一条挤成 inactive，部署页只剩一个（实测事故）。
6. **零历史**：任何时刻 `github-pages` 与 `github-pages-docs` 两个环境的 deployment **总数各为 1**。
   每次重新部署由 workflow 的 `build` job 先删光这两个环境的旧 deployment，再由 `deploy` job 各建一条 active。
   **严禁手动 `gh api POST /deployments` 造记录**——手工记录不带真实产物、且破坏自动化与零历史。
7. **完全自动化**：上述清理 + 建两条 deployment 全部写在 `.github/workflows/deploy.yml` 的
   `Clear old deployments`（build job）与 `Publish two active deployments`（deploy job）两步里；
   `permissions` 含 `deployments: write`。**任何重新部署（tag push 或 workflow_dispatch）都必须自动得到
   两条 active、零历史**；不得靠人工补建/补删。部署后验证：两个 environment 各 1 条 deployment 且状态 success、
   两个 URL 都 200。
8. 本地服务（3040 等）不属于“两个 page”，不得混用该词汇报。

## 三、验证命令

```bash
gh workflow run "Deploy to GitHub Pages" --ref main
gh run list --workflow "Deploy to GitHub Pages" --limit 3
curl -I https://jiozhaoyue.github.io/ST-pack-transfer/
curl -I https://jiozhaoyue.github.io/ST-pack-transfer/docs/
```

## 四、落点

- 工作流：`.github/workflows/deploy.yml`
- 文档源：`docs/`
- 插件构建：`npm run build -- --base=./`
