/**
 * 离线单文件构建的虚拟入口（只供 tooling/build-offline.mjs 使用）。
 *
 * 为什么需要这个入口：`build.lib` 模式没有 HTML，Vite 只从模块图收集 CSS。
 * 独立的 `style.css` 与 Font Awesome 字体都通过 `index.html` 的 `<link>` 加载，
 * 不在模块图里。这里把它们显式 import，让样式与字体都进入构建产物。
 */
import '../../src/vendor/fontawesome/css/all.min.css';
import '../../style.css';
import '../../index.js';
