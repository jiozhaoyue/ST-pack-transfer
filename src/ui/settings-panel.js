/**
 * 设置面板（唯一源）
 *
 * 只承载「面板行为」类开关；打包选项（压缩/扩展/Git/构建/backups/缓存/私有/原生资产）
 * 属于图表选择面，不得回到这里。
 */
import { t } from '../i18n/index.js';

/** 设置默认值。新增项必须同步 zh-CN / en-US 文案与测试。 */
export const SETTINGS_DEFAULTS = Object.freeze({
  keepExport: true,
  trafficPrompt: true,
  autoTutorial: true,
  defaultExtensionMode: 'full',
  defaultGitMode: 'minimal',
  defaultKeepDev: false,
});

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS_DEFAULTS));

/** 白名单归一：只保留已知键，非法/缺省回默认。 */
export function normalizeSettings(input) {
  const out = { ...SETTINGS_DEFAULTS };
  if (input && typeof input === 'object') {
    if (typeof input.keepExport === 'boolean') out.keepExport = input.keepExport;
    if (typeof input.trafficPrompt === 'boolean') out.trafficPrompt = input.trafficPrompt;
    if (typeof input.autoTutorial === 'boolean') out.autoTutorial = input.autoTutorial;
    if (['full', 'manifest'].includes(input.defaultExtensionMode)) out.defaultExtensionMode = input.defaultExtensionMode;
    if (['keep', 'minimal', 'strip'].includes(input.defaultGitMode)) out.defaultGitMode = input.defaultGitMode;
    if (typeof input.defaultKeepDev === 'boolean') out.defaultKeepDev = input.defaultKeepDev;
  }
  return out;
}

function setting(id, key, label, checked) {
  return `<label class="check"><input type="checkbox" id="${id}" data-setting="${key}"${checked ? ' checked' : ''}> ${label}</label>`;
}

/** 设置弹窗正文。 */
export function buildSettingsHtml(settings = {}) {
  const s = normalizeSettings(settings);
  const isFull = s.defaultExtensionMode !== 'manifest';
  return '<div class="settings-grid">'
    + setting('set-keep-export', 'keepExport', t('settings.keepExport'), s.keepExport)
    + setting('set-traffic', 'trafficPrompt', t('settings.trafficPrompt'), s.trafficPrompt)
    + setting('set-auto-tutorial', 'autoTutorial', t('settings.autoTutorial'), s.autoTutorial)
    + '<hr class="settings-divider">'
    + '<div class="settings-subhead">' + t('settings.exportDefaults') + '</div>'
    + '<div class="extension-tools settings-ext-tools" data-exttools="1">'
      + '<span class="et-label">' + t('settings.defaultExtMode') + '</span>'
      + '<div class="segmented et-mode">'
        + '<button type="button" class="seg-btn' + (isFull ? ' active' : '') + '" data-setting-extmode="full">' + t('extension.full') + '</button>'
        + '<button type="button" class="seg-btn' + (isFull ? '' : ' active') + '" data-setting-extmode="manifest">' + t('extension.manifest') + '</button>'
      + '</div>'
      + '<label class="et-git"><span>' + t('settings.defaultGitMode') + '</span><select class="text_pole" data-setting-gitmode>'
        + '<option value="keep"' + (s.defaultGitMode === 'keep' ? ' selected' : '') + '>' + t('extension.gitKeep') + '</option>'
        + '<option value="minimal"' + (s.defaultGitMode === 'minimal' ? ' selected' : '') + '>' + t('extension.gitMinimal') + '</option>'
        + '<option value="strip"' + (s.defaultGitMode === 'strip' ? ' selected' : '') + '>' + t('extension.gitStrip') + '</option>'
      + '</select></label>'
      + '<label class="check et-keepdev"><input type="checkbox" data-setting="defaultKeepDev"' + (s.defaultKeepDev ? ' checked' : '') + '> ' + t('extension.keepDev') + '</label>'
    + '</div>'
    + '</div>';
}

/** 从弹窗 DOM 读回开关与选项；缺失项保持默认。 */
export function readSettings(root) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!root) return out;
  const keepExportEl = root.querySelector?.('[data-setting="keepExport"]');
  if (keepExportEl && typeof keepExportEl.checked === 'boolean') out.keepExport = keepExportEl.checked;
  const trafficEl = root.querySelector?.('[data-setting="trafficPrompt"]');
  if (trafficEl && typeof trafficEl.checked === 'boolean') out.trafficPrompt = trafficEl.checked;
  const tutorialEl = root.querySelector?.('[data-setting="autoTutorial"]');
  if (tutorialEl && typeof tutorialEl.checked === 'boolean') out.autoTutorial = tutorialEl.checked;

  const activeExt = root.querySelector?.('[data-setting-extmode].active');
  if (activeExt?.dataset?.settingExtmode) out.defaultExtensionMode = activeExt.dataset.settingExtmode;

  const gitEl = root.querySelector?.('[data-setting-gitmode]');
  if (gitEl?.value) out.defaultGitMode = gitEl.value;

  const keepDevEl = root.querySelector?.('[data-setting="defaultKeepDev"]');
  if (keepDevEl && typeof keepDevEl.checked === 'boolean') out.defaultKeepDev = keepDevEl.checked;

  return normalizeSettings(out);
}
