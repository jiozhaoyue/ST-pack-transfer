# 宿主直装失败事故与防复发（2026-11-11）

## 1. 现象

宿主（Luker 桌面版，`https://127.0.0.1:8060`）报：

```
扩展 "数据包转运" 加载失败：Failed to fetch dynamically imported module:
https://127.0.0.1:8060/scripts/extensions/third-party/st-pack-transfer/index.js
```

扩展目录是**正常 git clone**，文件都在，服务器对 `index.js` 也返回 200。

## 2. 根因

引入提交：`9b91f3f feat(ui): P1 ... + 占位数据读文件`（2026-11-11 16:51）。

```js
// src/ui/workbench-view.js（事故版本）
import demoExtensionsData from '../data/demo-extensions.json';
```

- 酒馆插件是 **git clone 直装**：浏览器直接加载 ESM，中间**没有 Vite/Webpack 转换**。
- 浏览器不支持「无导入属性的 JSON 模块静态导入」；缺少 `with { type: 'json' }` 时，
  **整张依赖图在实例化阶段失败**。
- 宿主/浏览器把它统一报成 `Failed to fetch dynamically imported module`，看起来像网络或路径问题。
- 本地 `npm run dev` / `npm run build` 正常，因为 Vite 会自动把 JSON 转成 JS —— 这就是为什么
  「开发全绿、装进酒馆就炸」。

### 取证

- 对该扩展的 80 个模块逐个 HTTP 拉取：全部 200，唯一非 JS 模块就是
  `src/data/demo-extensions.json`。
- 纯静态服务器（无打包器）打开 `index.html`：
  - 修复前：模块图失败；
  - 修复后：200、`#app` 渲染 6 个子节点、控制台无该错误。

## 3. 修复

- 数据迁移为纯 ESM：`src/data/demo-extensions.js`；删除 `src/data/demo-extensions.json`。
- 新增静态守卫：`tooling/no-bundler-only.js`（`npm run check:no-bundler-only`）。

## 4. 防复发（治本）

1. **入库的静态守卫**（不是本地脚本）：扫描 `index.js` 与 `src/**/*.js`，拦截
   - 相对路径 `.json` 静态导入（除非显式 `with { type: 'json' }`）；
   - 静态导入 `node:*`；
   - 静态导入裸包名；
   - Vite 专有查询后缀（`?raw` / `?url` / ...）与 `import.meta.env` / `import.meta.glob`。
2. **CI 门禁**：`.github/workflows/checks.yml` 在每次 push/PR 先跑守卫，再构建。
3. **文档契约**：`.trellis/spec/frontend/extension-git-manager.md` §14 记录宿主直装与加载顺序事实。
4. **本地运行期取证**（不加油漆）：`tmp/static-server.cjs` + Playwright 的纯静态加载验证；
   该脚本属临时诊断，不入库。

## 5. 已知盲区（如实记录）

- 守卫只做**静态字面量**判定：模板字符串拼接的动态导入、`import.meta.resolve` 不在覆盖范围。
- CI 无法运行本地专属 `test/`（仓库有意排除），因此 CI 只跑守卫 + 构建；单元测试仍在本地跑。
- 浏览器兼容性（旧版 Chrome 是否支持某个语法）不在守卫能力内；这类问题只能靠真实宿主冒烟。
