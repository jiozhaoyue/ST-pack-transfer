/**
 * 导出模式常量（纯数据，无副作用）。
 *
 * 单独成文件，避免 `chart-model` / UI 为了拿两个枚举而把整个 `transform.js`
 * （zip 管线）拖进主包，也避免循环依赖。
 */

export const EXTENSION_MODES = Object.freeze({
  MANIFEST: 'manifest', // 轻量清单：不打包扩展实体与 Git 对象，改用官方索引在线安装
  FULL: 'full',         // 完整离线包：打包扩展代码
});

export const GIT_MODES = Object.freeze({
  KEEP: 'keep',       // 原样保留全部 .git 条目（默认）
  STRIP: 'strip',     // 剔除整个 .git/
  MINIMAL: 'minimal', // 只保留识别与更新所需最小集 + 合成 .git/objects/.keep
});
