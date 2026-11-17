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
5. **deployment 只能由工作流产生**：`actions/deploy-pages` 一次部署同时服务根 + `/docs/` 两个 URL，
   对应**一条** active `github-pages` deployment。**严禁手动 `gh api POST /deployments` 造“plugin web / docs”两条记录**——
   GitHub 的 `github-pages` 环境同一时刻只认一条 active，后造的会把先造的挤成 inactive，
   结果 GitHub 部署页只剩一条、看不到本体（2026-11-17 实测事故：手动造两条后 plugin web 变 inactive）。
6. 若出现手动误建的 deployment：删掉它们（`gh api -X DELETE repos/<owner>/<repo>/deployments/<id>`），
   重跑工作流生成一条真实 active 部署，然后验证两个 URL 都 200。
7. 本地服务（3040 等）不属于“两个 page”，不得混用该词汇报。

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
