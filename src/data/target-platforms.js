/**
 * 目标平台 UI 元数据（唯一真源）。
 *
 * 用户 2026-11-17 裁定：目标平台的名称、顺序、图标宿主码不得散落在 UI/核心代码里；
 * 改这里即可调整。颜色见 ./target-ui.js。
 *
 * code：转换/布局码（st|l|tt|pt）
 * host：UI/图标/宿主码（st|luker|tt|pt）
 * name：选择器显示名，同时作为状态里的目标值
 */
export const TARGET_PLATFORMS = Object.freeze([
  { code: 'st', host: 'st', name: 'SillyTavern' },
  { code: 'l', host: 'luker', name: 'Luker' },
  { code: 'tt', host: 'tt', name: 'TauriTavern' },
  { code: 'pt', host: 'pt', name: 'PureTavern' },
]);
