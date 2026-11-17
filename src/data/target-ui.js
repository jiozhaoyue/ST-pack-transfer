/**
 * 目标平台 UI 配色（唯一真源）。
 *
 * 用户 2026-11-17 裁定：
 * - 目标平台所有按钮/区域统一使用同一鲜艳色；
 * - 按钮内文字始终白色，不随主题或目标平台切换；
 * - 不要在 CSS 里写死这些值；改本文件即可整体调整。
 */
export const TARGET_UI = Object.freeze({
  accent: '#6c5ce7',
  accentStrong: '#5a4bd1',
  accentSoft: 'rgba(108, 92, 231, 0.20)',
  ink: '#ffffff',
  inkSoft: 'rgba(255, 255, 255, 0.86)',
  border: 'rgba(255, 255, 255, 0.55)',
});
