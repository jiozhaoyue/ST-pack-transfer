# ST-pack-transfer · 数据包转运

在 **SillyTavern / Luker / TauriTavern / PureTavern** 之间互转、搬运和恢复用户数据包。

纯前端，装进酒馆就是一个面板；也能当独立网页用，不需要服务端。

[在线使用](https://jiozhaoyue.github.io/ST-pack-transfer/) · [作为扩展安装](#1-装进酒馆推荐) · [本地部署](#2-本地部署)

---

## 什么是「四酒馆数据包」

四款酒馆都把用户数据（角色卡、聊天、世界书、预设、背景图、扩展……）放在各自的目录结构里，
导出的 zip 只有对应酒馆认得：

| 平台 | 导出包形态 | 怎么导入 |
| :-- | :-- | :-- |
| **SillyTavern**（ST） | 用户目录摊平在根 | 解压覆盖到 `data/<用户>/`，或用本工具一键写回 |
| **Luker**（L） | 目录摊平 + `manifest.json` | 同上；支持增量合并写入 |
| **TauriTavern**（TT） | `data/default-user/` 结构 | 桌面端导入 |
| **PureTavern**（PT） | 与 TT 相近 + 扩展来源记录 | 导入时选 TT 迁移包 |

于是换酒馆、备份迁移、把旧包搬给新设备时，常常「包是对的，但那边打不开」。
本工具就是把这一步做掉：**任意一方的包 → 任意一方的包**，尽量不丢东西。

## 能做什么

- **四个方向互转**，包括部分酒馆用非标准压缩（Zstd / Method 93）的包。
- **细粒度勾选**：角色卡、聊天、世界书、预设、资产、设置、密钥、扩展，逐项选。
- **从宿主直接拉取**：不手动下载，工具向当前酒馆要数据，可一步直出成目标平台格式。
- **恢复写入宿主**：合并（只补缺失/更新同名）或覆盖（二次确认）。
- **大包友好**：分卷导出、断点续传（暂停后接着跑，不重做）。
- **扩展打包二选一**：轻量清单（恢复时联网装回）或完整离线包（含扩展代码）。
- **可选后端增强**：装了 [Authority](https://github.com/jiozhaoyue/ST-Delegation-of-authority) 时产物可服务端托管；没装就静默走浏览器本地，功能不缺。

## 优点

- **零依赖安装**：插件形态经 Git URL 克隆即可用，不需要 `npm install`，不需要 CDN。
- **数据不出本机**：转换全程在浏览器里完成，没有上传。
- **同一份界面三处可跑**：酒馆插件、独立网页、Node 测试环境共用一套核心逻辑。

## 使用

### 1. 装进酒馆（推荐）

扩展管理 → 从 URL 安装，粘贴：

```
https://github.com/jiozhaoyue/ST-pack-transfer.git
```

或手动克隆到 `public/scripts/extensions/third-party/`。
刷新页面后，在扩展列表里展开 **「数据包转运」** → **「打开面板」**。

### 2. 本地部署

```bash
git clone https://github.com/jiozhaoyue/ST-pack-transfer.git
cd ST-pack-transfer
npm install
npm run dev
```

打开 `http://127.0.0.1:3040`。

构建静态站点：

```bash
npm run build        # 产出 dist/
npm run preview      # 本地预览 dist（4173）
```

> 不要直接双击 `index.html`：浏览器禁止 `file://` 下加载 ES Module，双击只会看到一句说明。
> 独立形态必须经 HTTP(S) 提供（`npm run dev`、`npm run preview` 或任意静态服务器）。

### 3. 在线使用

无需安装：<https://jiozhaoyue.github.io/ST-pack-transfer/>

想部署自己的站点，Fork 仓库后在 **Settings → Pages** 把 Source 设为 **GitHub Actions** 即可，
后续每次推送自动发布。

## 质量

```bash
npm test                      # 单元测试（纯逻辑层无 DOM 依赖）
npm run e2e:web               # 独立 Web / 云部署形态，不需要实例
npm run e2e                   # 实例侧冒烟与功能矩阵（需要 Dev 实例）
npm run check:css-scope check:dom-injection check:template-source check:dom-scope check:control-consumer
```

静态守卫覆盖 CSS 作用域、宿主 DOM 写入范围、单一模板源、死控件；测试只锁不变量，不锁耗时。

## 许可证

GNU General Public License v3.0 or later（GPL-3.0-or-later）。
完整条款见 [LICENSE](LICENSE)。

Copyright (C) 2026 jiozhaoyue
