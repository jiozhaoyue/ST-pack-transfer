/**
 * 设置面板（唯一源）
 *
 * 只承载「面板行为」类开关；打包选项（压缩/扩展/Git/构建/backups/缓存/私有/原生资产）
 * 属于图表选择面，不得回到这里。
 */

/** 设置默认值。只允许布尔开关；新增项必须同步 zh-CN / en-US 文案与测试。 */
export const SETTINGS_DEFAULTS = Object.freeze({
  keepExport: true,
  trafficPrompt: true,
  autoTutorial: true,
});

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS_DEFAULTS));

/** 白名单归一：只保留已知布尔键，非法/缺省回默认。 */
export function normalizeSettings(input) {
  const out = { ...SETTINGS_DEFAULTS };
  if (input && typeof input === 'object') {
    for (const key of SETTING_KEYS) {
      if (typeof input[key] === 'boolean') out[key] = input[key];
    }
  }
  return out;
}

function setting(id, key, label, checked) {
  return `<label class="check"><input type="checkbox" id="${id}" data-setting="${key}"${checked ? ' checked' : ''}> ${label}</label>`;
}

/** 设置弹窗正文（单列，恰好 3 项）。 */
export function buildSettingsHtml(settings = {}) {
  const s = normalizeSettings(settings);
  return '<div class="settings-grid">'
    + setting('set-keep-export', 'keepExport', '导出后在导出区保留包', s.keepExport)
    + setting('set-traffic', 'trafficPrompt', '后端上下传流量提示', s.trafficPrompt)
    + setting('set-auto-tutorial', 'autoTutorial', '基础教程自动打开', s.autoTutorial)
    + '</div>';
}

/** 从弹窗 DOM 读回 3 个开关；缺失项保持默认。 */
export function readSettings(root) {
  const out = { ...SETTINGS_DEFAULTS };
  for (const key of SETTING_KEYS) {
    const el = root?.querySelector?.(`[data-setting="${key}"]`);
    if (el && typeof el.checked === 'boolean') out[key] = el.checked;
  }
  return out;
}
