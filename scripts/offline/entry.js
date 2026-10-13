/**
 * 离线单文件构建的入口（**只被 `scripts/build-offline.mjs` 使用**）。
 *
 * 为什么要单独一个入口：`build.lib` 模式没有 HTML，Vite 只从**模块图**里收集 CSS。
 * 正常形态下 `style.css` 与 Font Awesome 都是由 `index.html` 的 `<link>` 引入的
 * （不进模块图），所以这里显式 import，让样式与图标字体都进包、被内联进单文件。
 */
import '../../src/vendor/fontawesome/css/all.min.css';
import '../../style.css';
import '../../index.js';
