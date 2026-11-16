/**
 * 本插件自身的版本与发布提交。
 *
 * - 构建期：`vite.config.js` 通过 define 注入 `__APP_VERSION__` / `__APP_COMMIT__`，
 *   standalone 构建显示真实 HEAD；
 * - 宿主直装：没有构建步骤，`typeof` 回退到下面的发布常量。
 *   发布时同步更新这两个常量（与 tag 指向的提交保持一致）。
 */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.5.3';
export const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'v0.5.3';
