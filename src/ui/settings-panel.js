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
  /** 点「从宿主拉取」时是否先提示「去原生界面点拉取」；默认每次提醒。 */
  nativePullNotice: true,
  autoTutorial: true,
  defaultExtensionMode: 'full',
  defaultGitMode: 'minimal',
  defaultKeepDev: false,
  /** 目标平台默认值：auto = 跟随宿主平台。 */
  defaultTarget: 'auto',
  /** 日志上限（条）；0/非法回落默认。 */
  logMaxEntries: 500,
  /** 每次加载插件是否清空上次日志。 */
  clearLogOnLoad: true,
});

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS_DEFAULTS));

/** 白名单归一：只保留已知键，非法/缺省回默认。 */
export function normalizeSettings(input) {
  const out = { ...SETTINGS_DEFAULTS };
  if (input && typeof input === 'object') {
    if (typeof input.keepExport === 'boolean') out.keepExport = input.keepExport;
    if (typeof input.trafficPrompt === 'boolean') out.trafficPrompt = input.trafficPrompt;
    if (typeof input.nativePullNotice === 'boolean') out.nativePullNotice = input.nativePullNotice;
    if (typeof input.autoTutorial === 'boolean') out.autoTutorial = input.autoTutorial;
    if (['full', 'manifest'].includes(input.defaultExtensionMode)) out.defaultExtensionMode = input.defaultExtensionMode;
    if (['keep', 'minimal', 'strip'].includes(input.defaultGitMode)) out.defaultGitMode = input.defaultGitMode;
    if (typeof input.defaultKeepDev === 'boolean') out.defaultKeepDev = input.defaultKeepDev;
    if (['auto', 'st', 'luker', 'tt', 'pt'].includes(input.defaultTarget)) out.defaultTarget = input.defaultTarget;
    const logMax = Number(input.logMaxEntries);
    if (Number.isFinite(logMax)) out.logMaxEntries = Math.max(50, Math.min(5000, Math.round(logMax)));
    if (typeof input.clearLogOnLoad === 'boolean') out.clearLogOnLoad = input.clearLogOnLoad;
  }
  return out;
}

function setting(id, key, label, checked) {
  return `<label class="check"><input type="checkbox" id="${id}" data-setting="${key}"${checked ? ' checked' : ''}> ${label}</label>`;
}

/** 设置弹窗正文：分组可收起，不再全部平铺。 */
export function buildSettingsHtml(settings = {}) {
  const s = normalizeSettings(settings);
  const isFull = s.defaultExtensionMode !== 'manifest';
  const group = (key, title, body, open) => '<details class="set-group" data-group="' + key + '"' + (open ? ' open' : '') + '>'
    + '<summary class="set-group-head">' + title + '</summary>'
    + '<div class="set-group-body">' + body + '</div></details>';

  const behavior = setting('set-keep-export', 'keepExport', t('settings.keepExport'), s.keepExport)
    + setting('set-traffic', 'trafficPrompt', t('settings.trafficPrompt'), s.trafficPrompt)
    + setting('set-native-pull-notice', 'nativePullNotice', t('settings.nativePullNotice'), s.nativePullNotice)
    + setting('set-auto-tutorial', 'autoTutorial', t('settings.autoTutorial'), s.autoTutorial);

  const exportDefaults = '<div class="extension-tools settings-ext-tools" data-exttools="1">'
    + '<span class="et-label">' + t('settings.defaultExtMode') + '</span>'
    + '<div class="segmented et-mode">'
      + '<button type="button" class="seg-btn' + (isFull ? ' active' : '') + '" data-setting-extmode="full">' + t('extension.full') + '</button>'
      + '<button type="button" class="seg-btn' + (isFull ? '' : ' active') + '" data-setting-extmode="manifest">' + t('extension.manifest') + '</button>'
    + '</div>'
    + '<label class="et-git"><span>' + t('settings.defaultTarget') + '</span><select class="text_pole" data-setting-target>'
      + '<option value="auto"' + (s.defaultTarget === 'auto' ? ' selected' : '') + '>' + t('settings.targetAuto') + '</option>'
      + '<option value="st"' + (s.defaultTarget === 'st' ? ' selected' : '') + '>SillyTavern</option>'
      + '<option value="luker"' + (s.defaultTarget === 'luker' ? ' selected' : '') + '>Luker</option>'
      + '<option value="tt"' + (s.defaultTarget === 'tt' ? ' selected' : '') + '>TauriTavern</option>'
      + '<option value="pt"' + (s.defaultTarget === 'pt' ? ' selected' : '') + '>PureTavern</option>'
    + '</select></label>'
    + '<label class="et-git"><span>' + t('settings.defaultGitMode') + '</span><select class="text_pole" data-setting-gitmode>'
      + '<option value="keep"' + (s.defaultGitMode === 'keep' ? ' selected' : '') + '>' + t('extension.gitKeep') + '</option>'
      + '<option value="minimal"' + (s.defaultGitMode === 'minimal' ? ' selected' : '') + '>' + t('extension.gitMinimal') + '</option>'
      + '<option value="strip"' + (s.defaultGitMode === 'strip' ? ' selected' : '') + '>' + t('extension.gitStrip') + '</option>'
    + '</select></label>'
    + '<label class="check et-keepdev"><input type="checkbox" data-setting="defaultKeepDev"' + (s.defaultKeepDev ? ' checked' : '') + '> ' + t('extension.keepDev') + '</label>'
    + '</div>';

  const logging = '<label class="et-git"><span>' + t('settings.logMaxEntries') + '</span>'
    + '<input class="text_pole" type="number" min="50" max="5000" step="50" data-setting="logMaxEntries" value="' + s.logMaxEntries + '"></label>'
    + setting('set-clear-log', 'clearLogOnLoad', t('settings.clearLogOnLoad'), s.clearLogOnLoad);

  return '<div class="settings-grid">'
    + group('behavior', t('settings.groupBehavior'), behavior, true)
    + group('export', t('settings.groupExport'), exportDefaults, true)
    + group('log', t('settings.groupLog'), logging, false)
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
  const nativePullEl = root.querySelector?.('[data-setting="nativePullNotice"]');
  if (nativePullEl && typeof nativePullEl.checked === 'boolean') out.nativePullNotice = nativePullEl.checked;
  const tutorialEl = root.querySelector?.('[data-setting="autoTutorial"]');
  if (tutorialEl && typeof tutorialEl.checked === 'boolean') out.autoTutorial = tutorialEl.checked;

  const activeExt = root.querySelector?.('[data-setting-extmode].active');
  if (activeExt?.dataset?.settingExtmode) out.defaultExtensionMode = activeExt.dataset.settingExtmode;

  const gitEl = root.querySelector?.('[data-setting-gitmode]');
  if (gitEl?.value) out.defaultGitMode = gitEl.value;

  const keepDevEl = root.querySelector?.('[data-setting="defaultKeepDev"]');
  if (keepDevEl && typeof keepDevEl.checked === 'boolean') out.defaultKeepDev = keepDevEl.checked;

  const targetEl = root.querySelector?.('[data-setting-target]');
  if (targetEl?.value) out.defaultTarget = targetEl.value;

  const logMaxEl = root.querySelector?.('[data-setting="logMaxEntries"]');
  if (logMaxEl?.value) out.logMaxEntries = Number(logMaxEl.value);

  const clearLogEl = root.querySelector?.('[data-setting="clearLogOnLoad"]');
  if (clearLogEl && typeof clearLogEl.checked === 'boolean') out.clearLogOnLoad = clearLogEl.checked;

  return normalizeSettings(out);
}
