---
title: 安装与部署
---

# 安装与部署

## 一、装进酒馆（推荐）

扩展管理 → 从 URL 安装，粘贴：

```
https://github.com/jiozhaoyue/ST-pack-transfer.git
```

或手动克隆到 `public/scripts/extensions/third-party/`。

刷新页面后，在扩展列表里展开 **「数据包转运」** → **「打开面板」**。

> Luker 的用户私有扩展要平铺在 `data/<user>/extensions/<name>/`，**不要再套一层 `third-party`**——
> 嵌套会让该目录下所有子插件失效。

## 二、本地部署

```bash
git clone https://github.com/jiozhaoyue/ST-pack-transfer.git
cd ST-pack-transfer
npm install
npm run dev
```

构建静态站点：

```bash
npm run build        # 产出 dist/（GitHub Pages 形态）
npm run preview      # 本地预览 dist（4173）
npm run build:offline # 产出 file:// 可双击的单文件
```

> 不要直接双击 `index.html`：浏览器禁止 `file://` 下加载 ES Module，双击只会看到一句说明。
> 独立形态必须经 HTTP(S) 提供。

## 三、在线使用

无需安装：<https://jiozhaoyue.github.io/ST-pack-transfer/>

想部署自己的站点：Fork 仓库后，在 **Settings → Pages** 把 Source 设为 **GitHub Actions**，
此后每次发版自动发布插件本体与本站文档。

## 四、安装后先做什么

1. 打开面板会先进入 [教程演示模式](tutorial.md)，在占位数据上熟悉流程，全程不写真实数据。
2. 想导出当前酒馆的数据时，按 [从宿主拉取](host-pull.md) 的提示走原生备份界面。
3. 要装私有仓库扩展，先看 [隐私与凭据](privacy.md)。
