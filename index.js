/**
 * 数据包转运 · 控制器（2026-10-27 全面重写）
 *
 * 界面：`src/ui/workbench-view.js` = UI 定稿 demo 的原样搬运。
 * 本文件只做三件事：宿主探测、包仓库读写、把真实动作接到视图的 `actions`。
 */

import { runConversionTask, runPlanTask } from './src/core/worker-client.js';
import { logger } from './src/core/logger.js';
import { zipIo, readZipEntryManifest } from './src/core/zip-io.js';
import { splitArchiveEntries } from './src/core/splitter.js';
import { mergeConvertedBlobs } from './src/core/merge-packages.js';
import {
  ORIGINS, isStorageSupported, saveFile, getFile, deleteFile, listStoredFiles, clearStoredFiles,
} from './src/storage/db.js';
import { buildChartTree, fmtMB, splitLimitOf } from './src/core/chart-model.js';
import { DEFAULT_FILENAME_TEMPLATE, TARGET_PLATFORMS, resolveFilename, namedBlob } from './src/core/naming.js';
import { trustedStaticMarkup } from './src/ui/escape.js';
import { getWorkbenchHtml } from './src/ui/workbench-template.js';
import { createWorkbenchView } from './src/ui/workbench-view.js';
import {
  detectHost, hostLayoutCode, fetchHostBackup, FULL_SELECTION,
  restoreToHost, restoreToLuker,
  confirmDialog, alertDialog, mountExtensionRowButton, closeHostExtensionSurface,
  mountNativeBackupButton, mountLukerBackupManagerButton, mountPtDataManagementButton,
  mountTtDataMigrationButton,
  openNativeBackupUi, readNativeBackupSelection, readPtExportOptions, hostToast, fetchPtBackup,
  isNativeExportBusy, closeNativeBackupUi, watchNativeExportStart,
  uploadUserFile, userFilesSupported, sanitizeUserFileName, verifyUserFiles, deleteUserFile,
  readHostStorageQuota,
  fetchHostStorageInspect, hostStorageInspectCapability, listHostExtensions,
  installExtensionBatch, deleteExtensionViaHost, moveExtensionViaHost,
  readHostIdentity, listServerPlugins, readHostExtensionGit,
  updateExtensionViaHost, setExtensionManifestSink,
  opfsTmpHandle, opfsHandleToFile, opfsTmpCleanup,
} from './src/ui/host-bridge.js';
import { packPrivateContainer } from './src/core/private-container.js';
import { sanitizeEngineDumpForRestore } from './src/core/engine-sanitize.js';
import { loadPrivateFiles, addPrivateFile, removePrivateFile } from './src/ui/private-files-store.js';
import { ORIGIN_ZONE, zoneOfOrigin, copyBackRecord } from './src/core/zone-model.js';
import { exportLibraryToPack, importRestoredChatsIntoLibrary } from './src/ui/chat-store-inject.js';
import { mountLanTransferPanel } from './src/ui/lan-transfer-panel.js';
import { createBrowserStorageProvider } from './src/ui/storage-inspector-browser.js';
import { qr } from './src/ui/qr.js';
import { buildSettingsHtml, readSettings } from './src/ui/settings-panel.js';
import { buildPluginData, applyPluginData, isPluginData, downloadPluginData } from './src/ui/plugin-data.js';
import { loadSettings, saveSettings } from './src/ui/settings-store.js';
import { applyI18n } from './src/i18n/dom.js';
import { getLocale, onLocaleChange, setLocale, t } from './src/i18n/index.js';
import { probeChatStore } from './src/ui/chat-store-bridge.js';
import { mountDebugProbe } from './src/app/task-runtime.js';
import { createConversionRunner, readPausedMarker, clearPausedMarker } from './src/app/conversion-runner.js';
import { beginHostPull, beginNativePull } from './src/app/pull-entry.js';
import { buildAssetList, summarizeExtensions } from './src/core/asset-list.js';
import { deriveExtensionEntry, normalizeManifestEntries } from './src/core/extension-manifest.js';
import { objectKey } from './src/core/s3-client.js';
import { createTransferTarget } from './src/core/transfer-target.js';
import { createTransferRunner } from './src/app/transfer-runner.js';
import { uploadBackupSet, updateSetRegistry } from './src/app/backup-set-runner.js';
import { openEntrySession, safeSegment, timestampName } from './src/core/backup-set.js';
import { parseManifest, chunkKey, manifestKey } from './src/core/transfer-plan.js';
import { ExportQueue } from './src/ui/export-queue.js';
import { reportToHuman } from './src/core/report.js';
import { TaskManager, memoryAdapter } from './src/core/task-manager.js';

export {
  TASK_KINDS, TASK_PREFIX, taskKindOf, partialNameFor, hasRoomForPartial,
  persistPartial, createCheckpointThrottle, resumedNote, convertExitForAbort,
  attachConversionProgress, runBatchItems, batchResumeVerdict, seedEntriesFor,
} from './src/app/task-runtime.js';
export { mountDebugProbe };

const HOST_CODE = { st: 'st', luker: 'luker', l: 'luker', tt: 'tt', pt: 'pt' };
const HOST_LABEL = { st: 'SillyTavern', luker: 'Luker', l: 'Luker', tt: 'TauriTavern', pt: 'PureTavern' };

function targetCodeOf(name) {
  return TARGET_PLATFORMS.find((p) => p.name === name)?.code || 'st';
}

function clockOf(ts) {
  const d = new Date(ts || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let initialized = false;
let modalRefreshHook = null;
/** main() 初始化后赋值；原生界面注入按钮的点击入口（插件加载时就要可点）。 */
let nativePullHook = null;
/** 在途拉取的取消器；宿主原生导出开始时中止插件自己的请求（宿主优先）。 */
let activePullAbort = null;

function ensureConverterModal() {
  let overlay = document.getElementById('st-converter-modal-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'st-converter-modal-overlay';
  overlay.style.display = 'none';
  const app = document.createElement('div');
  app.className = 'app-container';
  app.id = 'app';
  app.innerHTML = trustedStaticMarkup(getWorkbenchHtml({ isModal: true }));
  applyI18n(app);
  overlay.appendChild(app);
  document.body.appendChild(overlay); // dom-scope:allow 自绘全屏模态必须挂 body
  // 插件界面不允许点击面板外区域关闭：关闭只认页头 × 按钮（用户 2026-11-11 裁定）。
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none';
  });
  if (!initialized) { initialized = true; main(app); }
  return overlay;
}

export function openConverterModal() {
  if (typeof document === 'undefined') return;
  ensureConverterModal().style.display = 'flex';
  modalRefreshHook?.();
}

async function main(root) {
  const host = detectHost();
  const hostKey = host.isPlugin ? (HOST_CODE[host.platform] || 'st') : 'st';
  root.dataset.host = hostKey;

  const settings = loadSettings();
  /** 浏览器侧存储审查 provider（只读；与宿主无关，Node/Web/插件三形态同一份）。 */
  const browserStorageProvider = createBrowserStorageProvider();

  const state = {
    packages: [],
    nodesById: new Map(),
    extensionsById: new Map(),
    layoutById: new Map(),
    planCache: new Map(),
    busy: false,
  };

  /** 本次待导出（内存队列）：产物统一出口，不入库直到用户点「存入工作区」。 */
  const exportQueue = new ExportQueue();
  /** 惰性初始化：Node 测试环境不得在 import 期触碰 Authority / OPFS。 */
  let taskManagerPromise = null;
  /** 上次暂停的转换（跨重载经 localStorage 恢复；仅保存 taskId/pkgId/target）。 */
  let pendingResume = readPausedMarker();
  /** @type {ReturnType<typeof createConversionRunner>|null} */
  let conversionRunner = null;

  async function getTaskManager() {
    if (!taskManagerPromise) {
      taskManagerPromise = (async () => {
        let adapter = null;
        try {
          const mod = await import('./src/storage/authority-store.js');
          adapter = (await mod.createCheckpointAdapter?.()) || null;
        } catch { adapter = null; }
        // Authority 不可用时退回内存适配器；跨重载的续传靠 OPFS 半成品 + localStorage 标记。
        return new TaskManager(adapter || memoryAdapter());
      })();
    }
    return taskManagerPromise;
  }

  const pkgById = (id) => state.packages.find((pkg) => pkg.id === id) || null;

  /** 局域网面板在视图构造之后才挂载；用先声明的引用避免 TDZ。 */
  let lanPanel = null;

  async function blobOf(pkg) {
    if (!pkg) return null;
    if (pkg.blob) return pkg.blob;
    const record = await getFile(pkg.id);
    pkg.blob = record?.blob || null;
    return pkg.blob;
  }

  function toPackage(record) {
    const zone = zoneOfOrigin(record.origin);
    const layout = record.layout || state.layoutById.get(record.id) || 'unknown';
    const sizeBytes = record.size || 0;
    return {
      id: record.id,
      zone,
      host: HOST_CODE[layout] || 'unknown',
      name: record.name || record.id,
      size: fmtMB(sizeBytes / (1024 * 1024)),
      mb: sizeBytes / (1024 * 1024),
      ts: record.createdAt || Date.now(),
      time: clockOf(record.createdAt),
      /** 产物声明的目标布局（转换时写入）；用于区分结构相同但平台不同的 TT / PT 包。 */
      declaredLayout: record.layout || '',
      origin: record.origin === ORIGINS.LAN ? t('origin.remote')
        : record.origin === ORIGINS.EXPORT_COPY ? t('origin.exportCopy')
        : record.origin === ORIGINS.SPLIT_PART ? t('origin.split')
          : zone === 'export' ? t('origin.exportCopy')
            : t('origin.local'),
      readonly: zone === 'export',
      unrecognized: layout === 'unknown',
      split: 0,
      nodes: state.nodesById.get(record.id) || [],
      extensions: state.extensionsById.get(record.id) || [],
      blob: null,
    };
  }

  async function syncPackages() {
    if (!isStorageSupported()) { state.packages = []; view.setPackages([]); return; }
    try {
      const records = await listStoredFiles();
      state.packages = records.filter((r) => Object.hasOwn(ORIGIN_ZONE, r.origin)).map(toPackage);
      view.setPackages(state.packages);
    } catch (err) {
      logger.warn(t('log.workspaceReadFailed', { msg: err.message }));
      state.packages = [];
      view.setPackages([]);
    }
    void refreshStorageQuota();
  }

  /** 读取包内 `_convert/extensions-manifest.json`；没有则返回空数组。只解压这一条。 */
  async function readPackageExtensionManifest(blob) {
    if (!blob) return [];
    const reader = await zipIo.openReader(blob);
    try {
      for await (const entry of reader.entries()) {
        const entryName = String(entry.fileName || '').replace(/\\/g, '/');
        if (entryName === '_convert/extensions-manifest.json') {
          const text = new TextDecoder().decode(await entry.read());
          return normalizeManifestEntries(JSON.parse(text));
        }
        try { entry.skip?.(); } catch { /* 目录条目 / 已跳过 */ }
      }
    } catch {
      return [];
    } finally {
      await reader.close();
    }
    return [];
  }

  async function ensurePlan(pkgId, targetName = null) {
    const pkg = pkgById(pkgId);
    if (!pkg) return null;
    const code = targetCodeOf(targetName || view.getState().target);
    const key = `${pkgId}::${code}`;
    // 清单读取不依赖 plan 缓存：即使整包被判定「未识别」，也要能在插件里看到扩展清单。
    if (!pkg.extManifest) {
      const b = await blobOf(pkg);
      if (b) pkg.extManifest = await readPackageExtensionManifest(b).catch(() => []);
    }
    if (state.planCache.has(key)) return state.planCache.get(key);
    const blob = await blobOf(pkg);
    if (!blob) { logger.warn(t('log.scanSkipped', { name: pkg.name })); return null; }
    view.setProgress(6, t('progress.scanning', { name: pkg.name }));
    logger.info(t('log.scanStart', { name: pkg.name, size: (blob.size / 1048576).toFixed(1), target: code.toUpperCase() }));
    try {
      const plan = await runPlanTask({
        source: blob,
        target: code,
        options: {
          selection: {},
          excludedPaths: new Set(),
          // 完整清单：所有可选项都进树；勾选/虚拟节点只在导出时生效（R9）
          includeCache: true,
          includeBackups: true,
          includeAppPrivate: true,
          pruneBuiltinAssets: false,
          keepDevFiles: true,
          extensionMode: 'full',
          gitMode: 'keep',
        },
      });
      const tree = buildChartTree(plan);
      state.planCache.set(key, { plan, tree, target: code });
      state.nodesById.set(pkgId, tree);
      state.extensionsById.set(pkgId, plan.extensions || []);
      if (plan.sourceLayout && !pkgById(pkgId)?.declaredLayout) state.layoutById.set(pkgId, plan.sourceLayout);
      const live = pkgById(pkgId);
      if (live) {
        live.nodes = tree;
        live.extensions = plan.extensions || [];
        // 扩展作用域诊断（同名覆盖 / 自带插件）：UI 顶部汇总条与行内指引的唯一数据源。
        live.extensionScopes = plan.extensionScopes || null;
        live.extManifest = pkg.extManifest || [];
        // 产物包保留转换时声明的目标布局：PT 产物与 TT 结构相同，重新识别只会得到 tt。
        if (!live.declaredLayout) live.host = HOST_CODE[plan.sourceLayout] || live.host;
        live.unrecognized = plan.totalSourceFiles === 0;
      }
      view.setPackages(state.packages);
      view.setProgress(0, t('progress.scanDone'));
      logger.info(t('log.scanDone', { name: pkg.name, files: plan.totalSourceFiles, groups: tree.length }));
      return state.planCache.get(key);
    } catch (err) {
      logger.error(t('log.scanFailed', { name: pkg.name, msg: err.message }));
      view.setProgress(0, t('progress.scanFailed'));
      return null;
    }
  }

  /** 远程接收同名包自动加序号：`name.zip` → `name (2).zip`，绝不覆盖。 */
  function uniqueRemoteName(name, used) {
    if (!used.has(name)) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 2; i < 10_000; i += 1) {
      const candidate = `${base} (${i})${ext}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base} (${Date.now()})${ext}`;
  }

  async function importFiles(files, { remote = false } = {}) {
    const list = [...(files || [])];
    if (!list.length) return;
    if (!isStorageSupported()) { view.toast(t('toast.storageUnsupported')); return; }
    const used = new Set(state.packages.map((p) => p.name));
    for (const file of list) {
      const name = remote ? uniqueRemoteName(file.name, used) : file.name;
      used.add(name);
      const id = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await saveFile({
        id, name, size: file.size, blob: file, role: 'source',
        origin: remote ? ORIGINS.LAN : ORIGINS.UPLOAD,
        metadata: { importedAt: Date.now(), ...(remote ? { remote: true } : {}) },
      });
      logger.info(t(remote ? 'log.received' : 'log.imported', { name }));
    }
    await syncPackages();
    if (remote) view.setZone('import');
    const newest = state.packages.filter((p) => p.zone === 'import').sort((a, b) => b.ts - a.ts)[0];
    if (newest) {
      await ensurePlan(newest.id);
      Object.assign(settings, loadSettings());
      view.applySettings?.(settings);
      view.setActivePackage(newest.id);
    }
    view.toast(t(remote ? 'toast.receivedCount' : 'toast.importedCount', { n: list.length }));
  }

  /** 局域网发送源：导入区当前勾选的包（控制器拿到的已是可 slice 的 File）。 */
  async function getSendTargets() {
    const selected = view.getState().selectedPkgs;
    const targets = [];
    for (const id of selected) {
      const pkg = state.packages.find((p) => p.id === id);
      if (!pkg || pkg.zone !== 'import') continue;
      const blob = await blobOf(pkg);
      if (!blob) { logger.warn(t('log.sendSkipped', { name: pkg.name })); continue; }
      targets.push(new File([blob], pkg.name, { type: 'application/zip', lastModified: pkg.ts || Date.now() }));
    }
    return targets;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function saveJsonDownload(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, name);
  }

  function assetListFileName(source) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `extensions-asset-list_${source}_${stamp}.json`;
  }

  /** 扩展清单首次导出前的一次性教程（尤其说明 file:// 不可用）。 */
  async function ensureAssetListGuide() {
    try { if (localStorage.getItem('stpt.assetListGuideSeen') === '1') return; } catch { /* 隐私模式 */ }
    await new Promise((resolve) => {
      view.openModal(
        t('assetList.guideTitle'),
        t('assetList.guideDesc'),
        '<ul class="asset-guide"><li>' + t('assetList.guide1') + '</li><li>' + t('assetList.guide2') + '</li><li>' + t('assetList.guide3') + '</li></ul>',
        [{ label: t('modal.confirm'), primary: true, onClick: () => {
          try { localStorage.setItem('stpt.assetListGuideSeen', '1'); } catch { /* 隐私模式 */ }
          view.closeModal();
          resolve();
        } }],
      );
    });
  }

  /**
   * 导出宿主扩展资产列表（官方扁平数组）。
   *
   * 事实边界：宿主 discover 只给目录名/类型，URL 来自各扩展 `manifest.json` 的
   * `homePage`。因此可能出现「有扩展、但没有可导入地址」——此时如实提示，不生成空文件。
   */
  async function exportHostAssetList() {
    await ensureAssetListGuide();
    const result = await listHostExtensions(host.platform);
    if (!result.ok) {
      view.toast(t('toast.assetListUnavailable'));
      logger.warn(`${t('toast.assetListUnavailable')}: ${result.reason || result.status || ''}`);
      return;
    }
    const hostItems = (result.items || []).filter((item) => item.sourceType !== 'system');
    const list = buildAssetList(hostItems);
    const summary = summarizeExtensions(hostItems);
    if (!list.length) {
      view.toast(t('toast.assetListEmpty', { total: summary.total }));
      logger.warn(t('log.assetListEmpty', { total: summary.total }));
      return;
    }
    saveJsonDownload(list, assetListFileName('host'));
    view.toast(t('toast.assetListExported', { n: list.length }));
    logger.info(t('log.assetListExported', { n: list.length, total: summary.total }));
  }

  /**
   * 导出数据包内扩展的资产列表。
   * 元数据来自 `plan-preview` 已缓存的 `pkg.extensions`，不二次扫描 zip。
   * @param {string[]} pkgIds
   */
  async function exportPackageAssetList(pkgIds) {
    await ensureAssetListGuide();
    const ids = (Array.isArray(pkgIds) ? pkgIds : []).filter(Boolean);
    if (!ids.length) {
      view.toast(t('toast.assetListNoPackage'));
      return;
    }
    const raws = [];
    for (const id of ids) {
      await ensurePlan(id);
      raws.push(...(state.extensionsById.get(id) || []));
    }
    const derived = raws.map((ext) => deriveExtensionEntry({ ...ext, mode: 'manifest' }));
    const list = buildAssetList(derived);
    const summary = summarizeExtensions(derived);
    if (!list.length) {
      view.toast(t('toast.assetListEmpty', { total: summary.total }));
      logger.warn(t('log.assetListEmpty', { total: summary.total }));
      return;
    }
    saveJsonDownload(list, assetListFileName('pack'));
    view.toast(t('toast.assetListExported', { n: list.length }));
    logger.info(t('log.assetListExported', { n: list.length, total: summary.total }));
  }

  /** 图表卡 / 空态拉取卡的统一导出入口。 */
  async function exportAssetList(request = {}) {
    if (request.source === 'host') return exportHostAssetList();
    return exportPackageAssetList(request.pkgIds);
  }

  const FULL_KEEP_DEFAULT = 10;

  /** 删除超出保留数的全量快照。列表不可用（如 WebDAV 禁 PROPFIND）时跳过，不阻断备份。 */
  async function pruneFullSnapshots({ target, prefix = '', keep = FULL_KEEP_DEFAULT } = {}) {
    const limit = Math.max(1, Math.trunc(Number(keep) || FULL_KEEP_DEFAULT));
    if (typeof target?.list !== 'function') return { ok: false, code: 'list-unavailable' };
    const listPrefix = prefix ? `${prefix}/snapshots/` : 'snapshots/';
    const listed = await target.list(listPrefix);
    if (!listed?.ok) return { ok: false, code: listed?.code || listed?.message || 'list-unavailable' };

    const map = new Map();
    for (const item of listed.items || []) {
      if (!/\.manifest\.json$/i.test(item.key)) continue;
      const base = item.key.slice(0, -'.manifest.json'.length);
      const man = await target.get(item.key);
      const parsed = man?.ok && man.bytes ? parseManifest(new TextDecoder().decode(man.bytes)) : null;
      map.set(base, { key: base, createdAt: parsed?.createdAt || item.lastModified || '' });
    }

    const sorted = [...map.values()].sort(
      (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    const removed = [];
    for (const item of sorted.slice(limit)) {
      const man = await target.get(manifestKey(item.key));
      const parsed = man?.ok && man.bytes ? parseManifest(new TextDecoder().decode(man.bytes)) : null;
      if (parsed) {
        for (const chunk of parsed.chunks) await target.remove(chunkKey(item.key, chunk.index));
      }
      await target.remove(manifestKey(item.key));
      await target.remove(item.key);
      removed.push(item.key);
    }
    return { ok: true, removed };
  }

  /**
   * 把当前选中的导入包备份到云端（S3 / WebDAV）。
   *
   * 两种模式（用户 2026-11-09 裁定 D-8 / D-9）：
   * - `full`：每次一个时间戳快照，互不覆盖，保留最近 N 份；
   * - `set`：内容寻址备份集，只传新增/修改条目，每版一张完整清单。
   *
   * 加密可选：`config.passphrase` 非空即启用；分片逐片加密，不整包入内存。
   */
  async function backupSelectedToCloud({
    provider = 's3', config = {}, mode = 'full', setName = 'default', retention = 10,
  } = {}) {
    const ids = [...state.selectedPkgs];
    if (!ids.length) { view.toast(t('toast.selectPackFirst')); return; }
    if (mode === 'set' && ids.length !== 1) { view.toast(t('cloud.setSinglePack')); return; }
    if (state.busy) return;
    const target = createTransferTarget({
      kind: provider === 'webdav' ? 'webdav' : 's3',
      config,
      fetchImpl: (url, init) => fetch(url, init),
      proxyUrl: loadSettings().netProxyUrl || '',
    });
    if (!target.ready) { view.toast(t('cloud.notConfigured')); return; }

    state.busy = true;
    try {
      const passphrase = String(config.passphrase || '');
      if (provider === 'webdav' && config.prefix && typeof target.ensureCollection === 'function') {
        const collection = await target.ensureCollection(config.prefix);
        if (!collection.ok) {
          view.toast(t('cloud.error', { msg: collection.message || collection.code || 'mkcol-failed' }));
          return;
        }
      }

      if (mode === 'plain') {
        // 与侧栏选中列表共用同一选择：不做快照命名、不做保留策略，按原包名上传。
        let uploaded = 0;
        let skipped = 0;
        let failed = 0;
        let encryptedPackages = 0;
        for (const id of ids) {
          const pkg = state.packages.find((p) => p.id === id);
          if (!pkg) { failed += 1; continue; }
          const blob = await blobOf(pkg);
          if (!blob) {
            failed += 1;
            logger.warn(t('cloud.backupMissingBlob', { name: pkg.name }));
            continue;
          }
          let entryCount = null;
          try {
            entryCount = (await readZipEntryManifest(blob)).length;
          } catch {
            entryCount = null;
          }
          const runner = createTransferRunner({
            target,
            passphrase,
            onProgress: (progress) => {
              if (progress.phase !== 'uploading') return;
              const pct = 15 + Math.round((progress.uploadedBytes / Math.max(1, progress.totalBytes)) * 80);
              view.setProgress(pct, t('cloud.uploadingChunk', {
                done: progress.uploadedChunks,
                total: progress.totalChunks,
              }));
            },
          });
          const result = await runner.upload({
            blob,
            name: objectKey(config.prefix, pkg.name),
            contentType: 'application/zip',
            entryCount,
          });
          if (!result.ok) {
            failed += 1;
            logger.error(t('cloud.backupItemFailed', { name: pkg.name, msg: result.code || result.message }));
            continue;
          }
          if (result.encrypted) encryptedPackages += 1;
          if (result.skipped) skipped += 1;
          else uploaded += 1;
        }
        const summary = { uploaded, skipped, failed, encrypted: encryptedPackages };
        view.setProgress(100, t('cloud.uploadDone', summary));
        view.toast(t('cloud.uploadDone', summary));
        logger.info(t('cloud.uploadDone', summary));
        return;
      }

      if (mode === 'set') {
        const pkg = state.packages.find((p) => p.id === ids[0]);
        const blob = pkg ? await blobOf(pkg) : null;
        if (!blob) {
          logger.warn(t('cloud.backupMissingBlob', { name: pkg?.name || ids[0] }));
          view.toast(t('cloud.backupMissingBlob', { name: pkg?.name || ids[0] }));
          return;
        }
        const set = safeSegment(setName || 'default', 'default');
        const setBase = objectKey(config.prefix, `sets/${set}`);
        const session = await openEntrySession(blob);
        try {
          const result = await uploadBackupSet({
            target,
            setBase,
            setName: set,
            entries: session.entries,
            sourceName: pkg.name,
            passphrase,
            retention,
            onProgress: (progress) => {
              const pct = 10 + Math.round((progress.done / Math.max(1, progress.total)) * 80);
              view.setProgress(pct, t('cloud.setUploading', {
                done: progress.done,
                total: progress.total,
                uploaded: progress.uploaded,
                reused: progress.reused,
              }));
            },
          });
          if (!result.ok) {
            const msg = result.code || result.message || 'backup-failed';
            view.toast(t('cloud.error', { msg }));
            logger.error(t('cloud.backupItemFailed', { name: pkg.name, msg }));
            return;
          }
          const registry = await updateSetRegistry({
            target,
            prefix: config.prefix || '',
            setName: set,
            latest: result.snapshotKey,
            snapshotCount: result.entries,
          });
          if (!registry.ok) logger.warn(t('cloud.registryFailed', { msg: registry.code }));
          const summary = {
            set,
            uploaded: result.uploaded,
            deduped: result.deduped,
            reused: result.reused,
            encrypted: result.encrypted ? 1 : 0,
          };
          view.setProgress(100, t('cloud.setBackupDone', summary));
          view.toast(t('cloud.setBackupDone', summary));
          logger.info(t('cloud.setBackupDone', summary));
        } finally {
          await session.close();
        }
        return;
      }

      if (provider === 'webdav' && config.prefix && typeof target.ensureCollection === 'function') {
        const collection = await target.ensureCollection(`${config.prefix}/snapshots`);
        if (!collection.ok) {
          view.toast(t('cloud.error', { msg: collection.message || collection.code || 'mkcol-failed' }));
          return;
        }
      }

      let uploaded = 0;
      let skipped = 0;
      let failed = 0;
      let encryptedPackages = 0;
      const stamp = timestampName();
      for (let i = 0; i < ids.length; i += 1) {
        const pkg = state.packages.find((p) => p.id === ids[i]);
        if (!pkg) { failed += 1; continue; }
        const blob = await blobOf(pkg);
        if (!blob) {
          failed += 1;
          logger.warn(t('cloud.backupMissingBlob', { name: pkg.name }));
          continue;
        }
        const base = `${stamp}-${String(i + 1).padStart(2, '0')}-${safeSegment(pkg.name.replace(/\.zip$/i, ''), 'pack')}`;
        const name = objectKey(config.prefix, `snapshots/${base}`);
        let entryCount = null;
        try {
          entryCount = (await readZipEntryManifest(blob)).length;
        } catch {
          entryCount = null;
        }
        const runner = createTransferRunner({
          target,
          passphrase,
          onProgress: (progress) => {
            if (progress.phase !== 'uploading') return;
            const pct = 15 + Math.round((progress.uploadedBytes / Math.max(1, progress.totalBytes)) * 80);
            view.setProgress(pct, t('cloud.uploadingChunk', {
              done: progress.uploadedChunks,
              total: progress.totalChunks,
            }));
          },
        });
        const result = await runner.upload({ blob, name, contentType: 'application/zip', entryCount });
        if (!result.ok) {
          failed += 1;
          logger.error(t('cloud.backupItemFailed', { name: pkg.name, msg: result.code || result.message }));
          continue;
        }
        if (result.encrypted) encryptedPackages += 1;
        if (result.skipped) skipped += 1;
        else uploaded += 1;
      }

      // 只有全部选中包都成功时才执行保留策略：失败时删旧快照会让用户两头落空。
      let prune = { ok: true, removed: [] };
      const succeeded = uploaded + skipped;
      if (failed === 0 && succeeded > 0) {
        prune = await pruneFullSnapshots({ target, prefix: config.prefix || '', keep: retention });
        if (!prune.ok) logger.warn(t('cloud.pruneSkipped', { msg: prune.code }));
      } else {
        logger.warn(t('cloud.pruneSkipped', { msg: 'backup-incomplete' }));
      }
      const summary = {
        uploaded,
        skipped,
        failed,
        encrypted: encryptedPackages,
        pruned: prune.removed?.length || 0,
      };
      view.setProgress(100, t('cloud.backupDone', summary));
      view.toast(t('cloud.backupDone', summary));
      logger.info(t('cloud.backupDone', summary));
    } catch (error) {
      const msg = String(error?.message || error);
      logger.error(t('cloud.backupItemFailed', { name: 'backup', msg }));
      view.toast(t('cloud.error', { msg }));
    } finally {
      state.busy = false;
    }
  }

  /** 云端产物入工作区：恢复后可直接走既有迁移 / 写回流程。 */
  async function importCloudPack({ name = 'cloud-pack.zip', blob } = {}) {
    if (!blob) {
      view.toast(t('cloud.error', { msg: 'empty' }));
      return;
    }
    const fileId = await saveFile({
      name,
      blob,
      size: blob.size,
      layout: 'unknown',
      origin: ORIGINS.CONVERTED,
      metadata: { fromCloud: true },
    });
    if (!fileId) {
      view.toast(t('cloud.error', { msg: 'storage-unavailable' }));
      return;
    }
    await syncPackages();
    view.toast(t('cloud.importedToWorkspace', { name }));
  }

  async function downloadSelected(ids) {
    let count = 0;
    for (const id of ids) {
      const pkg = pkgById(id);
      const blob = await blobOf(pkg);
      if (!blob) continue;
      downloadBlob(blob, pkg.name);
      count += 1;
      if (settings.deleteAfterExport) {
        try { await deleteFile(id); } catch { /* 已不存在 */ }
      }
    }
    if (settings.deleteAfterExport && count) await syncPackages();
  }

  async function copyBack(ids) {
    let count = 0;
    for (const id of ids) {
      const pkg = pkgById(id);
      const blob = await blobOf(pkg);
      if (!blob) continue;
      const plan = copyBackRecord(pkg);
      await saveFile({
        ...plan,
        size: blob.size, blob,
      });
      count += 1;
    }
    await syncPackages();
    view.toast(t('toast.copiedBackCount', { n: count }));
  }

  async function deleteSelected(ids) {
    if (!ids.length) { view.toast(t('toast.selectDeleteFirst')); return; }
    const ok = await confirmDialog(t('modal.confirmDelete', { n: ids.length }));
    if (!ok) return;
    await removePackages(ids);
    view.toast(t('toast.deleted'));
  }

  /** 无二次确认的删除（供「丢弃成功项」等已确认动作复用）。 */
  async function removePackages(ids) {
    for (const id of ids) {
      try { await deleteFile(id); } catch { /* 已不存在 */ }
      state.nodesById.delete(id);
      state.layoutById.delete(id);
    }
    await syncPackages();
  }

  async function restoreSelected(ids) {
    if (!host.isPlugin) { view.toast(t('toast.pluginOnlyRestore')); return; }
    const targets = ids.map(pkgById).filter((p) => p && p.zone === 'export');
    if (!targets.length) { view.toast(t('toast.selectExportPack')); return; }
    if (settings.trafficPrompt) {
      view.confirmTraffic(() => restoreSelectedConfirmed(targets), {
        enabled: true,
        onNever: () => { settings.trafficPrompt = false; saveSettings(settings); },
      });
      return;
    }
    await restoreSelectedConfirmed(targets);
  }

  async function restoreSelectedConfirmed(targets) {
    const ok = await confirmDialog(targets.length > 1
      ? t('modal.confirmRestoreMany', { n: targets.length })
      : t('modal.confirmRestore', { name: targets[0].name }));
    if (!ok) return;
    if (state.busy) return;
    state.busy = true;
    const results = [];
    const record = { startedAt: Date.now(), total: targets.length, done: 0, results };
    persistRestoreProgress(record);
    try {
      for (let i = 0; i < targets.length; i += 1) {
        const pkg = targets[i];
        const row = { id: pkg.id, name: pkg.name, status: 'failed', message: '', note: '' };
        view.setProgress(Math.round((i / targets.length) * 90) + 5, t('progress.restoring'));
        try {
          const blob = await blobOf(pkg);
          if (!blob) throw new Error(t('toast.selectExportPack'));
          /* 跨引擎 / 跨实例的裸 SQL 转储会撞目标主键：先剔除，走标准便携恢复。 */
          const sane = await sanitizeEngineDumpForRestore(blob, {
            onProgress: (done, total) => {
              if (total > 0) view.setProgress(Math.round((i / targets.length) * 90) + 5 + Math.round((done / total) * 3), t('progress.restoring'));
            },
          });
          if (sane.reason === 'engine-only') {
            row.status = 'skipped';
            row.message = t('restore.engineOnly');
            logger.warn(t('log.restoreFailed', { msg: row.message }));
            results.push(row);
            record.done = i + 1;
            persistRestoreProgress(record);
            continue;
          }
          if (sane.changed) {
            row.note = t('restore.engineStripped', { files: sane.stripped.join(', ') });
            logger.warn(row.note);
          }
          const result = host.platform === 'luker'
            ? await restoreToLuker(sane.blob, {})
            : await restoreToHost(sane.blob, { mode: 'merge', platform: host.platform });
          if (result && result.nothingRestored) throw new Error(t('error.nothingRestored'));
          try { await importRestoredChatsIntoLibrary(sane.blob); } catch { /* 纯库模式可选 */ }
          row.status = 'ok';
          logger.info(t('log.restored', { name: pkg.name }));
        } catch (err) {
          row.message = err?.message || String(err);
          logger.error(t('log.restoreFailed', { msg: row.message }));
        }
        results.push(row);
        record.done = i + 1;
        persistRestoreProgress(record);
      }
    } finally {
      state.busy = false;
    }
    const okCount = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    view.setProgress(failed ? 0 : 100, failed ? t('progress.restoreFailed') : t('progress.restoreDone'));
    if (!failed) view.toast(t('toast.restoreDone'));
    view.showRestoreReport(results, {
      onKeepPartial: () => { persistRestoreProgress({ ...record, finishedAt: Date.now() }); },
      onDiscardPartial: async () => {
        const doneIds = results.filter((r) => r.status === 'ok').map((r) => r.id);
        if (doneIds.length) await removePackages(doneIds);
        persistRestoreProgress({ ...record, finishedAt: Date.now(), discarded: true });
      },
      onRefresh: () => { if (typeof window !== 'undefined') window.location.reload(); },
    });
    // 自动刷新默认关闭；仅无失败且设置显式打开时执行，避免挡住失败报告。
    if (settings.autoRefreshAfterUpload && failed === 0 && typeof window !== 'undefined') {
      setTimeout(() => window.location.reload(), 800);
    }
  }

  const RESTORE_PROGRESS_KEY = 'stpt.restoreProgress';
  function persistRestoreProgress(record) {
    try { localStorage.setItem(RESTORE_PROGRESS_KEY, JSON.stringify(record)); } catch { /* 隐私模式 */ }
  }

  /**
   * 工作台「从宿主拉取」：顺序为 **流量警告 → 原生操作指引 → 打开原生界面**。
   * 原生入口不可用时如实回退插件侧拉取（PT 走它自己的归档端点）。
   */
  async function fetchFromHost() {
    if (!host.isPlugin) { view.toast(t('toast.webNoHost')); return; }
    if (state.busy) return;

    await beginHostPull({
      trafficPrompt: settings.trafficPrompt,
      nativePullNotice: settings.nativePullNotice !== false,
      confirmTraffic: askTraffic,
      showNativeNotice: () => alertDialog(t('toast.nativePickCategories')),
      openNativeUi: () => openNativeBackupUi(host.platform),
      isBusy: () => isNativeExportBusy(host.platform),
      notifyBusy: () => notifyHostExportBusy(false),
      onOpened: () => logger.info(t('log.nativeUiOpened')),
      onMissing: () => logger.warn(t('log.nativeUiMissing')),
      fallbackPull: async () => {
        if (host.platform === 'pt') { await pullFromPt(); return; }
        await pullFromHost(FULL_SELECTION, false);
      },
    });
  }

  /** 流量确认是回调式弹窗；包成 Promise 以便按顺序编排。取消必须能 settle。 */
  function askTraffic() {
    return new Promise((resolve) => {
      view.confirmTraffic(() => resolve(true), {
        enabled: true,
        onCancel: () => resolve(false),
        onNever: () => { settings.trafficPrompt = false; saveSettings(settings); },
      });
    });
  }

  /** 宿主原生导出优先：提示并放弃插件侧拉取。 */
  function notifyHostExportBusy(fromNativeUi) {
    logger.warn(t('log.nativeExportWins'));
    if (fromNativeUi && hostToast(t('toast.hostExportBusy'))) return;
    view.toast(t('toast.hostExportBusy'));
  }

  /** 原生界面里注入的「从宿主拉取」按钮：流量确认 → 读勾选 → 关面板 → 拉取。 */
  async function pullFromNativeUi() {
    if (state.busy) return;
    if (host.platform === 'pt') {
      await beginNativePull({
        trafficPrompt: settings.trafficPrompt,
        confirmTraffic: askTraffic,
        readSelection: () => readPtExportOptions() || { moduleIds: [], includeSecrets: false },
        closeNativeUi: () => closeNativeBackupUi('pt'),
        isBusy: () => isNativeExportBusy('pt'),
        notifyBusy: () => notifyHostExportBusy(true),
        pull: (options) => pullFromPt(options),
      });
      return;
    }

    await beginNativePull({
      trafficPrompt: settings.trafficPrompt,
      confirmTraffic: askTraffic,
      readSelection: () => readNativeBackupSelection() || FULL_SELECTION,
      closeNativeUi: () => closeNativeBackupUi(host.platform),
      isBusy: () => isNativeExportBusy(host.platform),
      notifyBusy: () => notifyHostExportBusy(true),
      pull: async (selection) => {
        const keys = Object.keys(selection).filter((key) => selection[key]);
        logger.info(t('log.nativeSelection', { keys: keys.join(',') || '-' }));
        await pullFromHost(selection, true);
      },
    });
  }
  nativePullHook = pullFromNativeUi;

  /** PureTavern：原生数据管理面板的模块勾选 → 原生归档端点 → 入库。 */
  async function pullFromPt(options) {
    if (state.busy) return;
    state.busy = true;
    const pullStart = performance.now();
    const ac = new AbortController();
    activePullAbort = ac;
    try {
      const id = `pkg-${Date.now()}`;
      const opts = options || readPtExportOptions() || { moduleIds: [], includeSecrets: false };
      logger.info(t('log.nativeSelection', { keys: opts.moduleIds.join(',') || '-' }));
      view.setProgress(5, t('progress.hostRequest'));
      const blob = await fetchPtBackup(opts, {
        signal: ac.signal,
        onPhase: (phase, received, total, _opfsName, bps) => {
          if (phase === 'host-generating') view.setProgress(12, t('progress.hostPacking'));
          else if (phase === 'transferring') {
            const pct = total > 0 ? 15 + Math.round((received / total) * 20) : 20;
            const speed = bps > 0 ? `${(bps / 1048576).toFixed(1)} MB/s` : '—';
            view.setProgress(pct, t('progress.receiving', { size: (received / 1048576).toFixed(1), speed }));
          }
        },
      });
      await commitPulledPack({
        id,
        name: `PureTavern_host-export_${Date.now()}.zip`,
        blob,
        size: blob.size || 0,
        opfsName: null,
        opfsDir: null,
        fromNativeUi: true,
        pullStart,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        logger.warn(t('log.hostPullCancelled'));
        view.setProgress(0, t('progress.hostPullCancelled'));
      } else {
        logger.error(t('log.hostFetchFailed', { msg: err.message }));
        view.setProgress(0, t('progress.hostFetchFailed'));
      }
    } finally {
      if (activePullAbort === ac) activePullAbort = null;
      state.busy = false;
    }
  }

  /**
   * 拉取落库的公共尾段：入库 → 同步 → 设为活动包 → 完成提示。
   * @param {{id: string, name: string, blob?: Blob, opfsName?: string|null, opfsDir?: string|null, size: number, fromNativeUi: boolean, pullStart: number}} pack
   */
  async function commitPulledPack({ id, name, blob, opfsName, opfsDir, size, fromNativeUi, pullStart }) {
    const storeStart = performance.now();
    await saveFile({
      id, name, size, blob: opfsName ? null : namedBlob(blob, name),
      opfsName, opfsDir,
      layout: hostLayoutCode(host.platform), role: 'source',
      origin: ORIGINS.HOST_EXPORT, metadata: { fetchedAt: Date.now() },
    });
    logger.info(t('log.packStored', {
      target: opfsName ? `OPFS ${opfsDir}/${opfsName}` : 'IndexedDB',
      ms: Math.round(performance.now() - storeStart),
    }));
    state.layoutById.set(id, hostLayoutCode(host.platform));
    await syncPackages();
    await ensurePlan(id);
    // 拉取完成后的默认不勾选（只在插件侧）：备份快照 + 原生资产。
    view.applyPullDefaults?.(id, ['backups/', 'user/']);
    Object.assign(settings, loadSettings());
    view.applySettings?.(settings);
    view.setActivePackage(id);
    view.setProgress(100, t('progress.hostFetched'));
    // 原生界面触发时优先用宿主 toast；宿主没有 toastr（如 PureTavern）则回退插件内提示
    if (!fromNativeUi || !hostToast(t('toast.nativePullDone'))) view.toast(t('toast.hostFetched'));
    logger.success(t('log.hostPullDone', {
      sec: (Math.round(performance.now() - pullStart) / 1000).toFixed(1),
      size: (size / 1048576).toFixed(1),
    }));
  }

  /**
   * @param {Record<string, boolean>} selection 端点类目布尔（含宿主端新增的 backups 键）
   * @param {boolean} fromNativeUi 是否由原生界面按钮触发（完成时用宿主原生 toast）
   */
  async function pullFromHost(selection, fromNativeUi) {
    if (state.busy) return;
    state.busy = true;
    const pullStart = performance.now();
    const ac = new AbortController();
    activePullAbort = ac;
    try {
      const id = `pkg-${Date.now()}`;
      view.setProgress(5, t('progress.hostRequest'));
      const fetched = await fetchHostBackup(host.platform, selection, {
        taskId: id,
        opfsDirName: 'packages',
        signal: ac.signal,
        onPhase: (phase, received, total, _opfsName, bps) => {
          if (phase === 'host-generating') view.setProgress(12, t('progress.hostPacking'));
          else if (phase === 'transferring') {
            const pct = total > 0 ? 15 + Math.round((received / total) * 20) : 20;
            const speed = bps > 0 ? `${(bps / 1048576).toFixed(1)} MB/s` : '—';
            view.setProgress(pct, t('progress.receiving', { size: (received / 1048576).toFixed(1), speed }));
          }
        },
      });

      const packSize = fetched?.size || 0;

      const name = `${HOST_LABEL[host.platform] || 'Host'}_host-export_${Date.now()}.zip`;
      await commitPulledPack({
        id,
        name,
        blob: fetched,
        size: packSize,
        opfsName: fetched?.kind === 'opfs' ? fetched.name : null,
        opfsDir: fetched?.kind === 'opfs' ? (fetched.dir || 'packages') : null,
        fromNativeUi,
        pullStart,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        logger.warn(t('log.hostPullCancelled'));
        view.setProgress(0, t('progress.hostPullCancelled'));
      } else {
        logger.error(t('log.hostFetchFailed', { msg: err.message }));
        view.setProgress(0, t('progress.hostFetchFailed'));
      }
    } finally {
      if (activePullAbort === ac) activePullAbort = null;
      state.busy = false;
    }
  }

  async function generate({ packages, merge = false, target, splitMb, filenameTemplate }) {
    if (state.busy) return;
    if (!packages?.length) { view.toast(t('toast.selectExportFirst')); return; }
    if (merge && packages.length >= 2) {
      return generateMerged({ packages, target, splitMb, filenameTemplate });
    }
    state.busy = true;
    const code = targetCodeOf(target);
    const limit = splitLimitOf(splitMb);
    const created = [];
    const reports = [];
    try {
      for (const pkg of packages) {
        const blob = await blobOf(pkg);
        if (!blob) continue;
        const cached = await ensurePlan(pkg.id, target);
        if (!cached) continue;
        const excluded = view.getExcludedPaths(pkg);
        const exportOptions = view.getExportOptions(pkg);
        view.setProgress(3, t('progress.converting', { name: pkg.name }));
        const outcome = await conversionRunner.convert({
          pkg,
          blob,
          target: code,
          options: { excludedPaths: excluded, ...exportOptions },
          pctBase: 3,
          pctSpan: 92,
          resume: takeResumeFor(pkg.id),
        });
        if (outcome.paused || outcome.aborted) return;
        if (outcome.report) reports.push(outcome.report);
        const resultBlob = outcome.resultBlob;
        if (!resultBlob) continue;
        if (limit) {
          const entries = [];
          const reader = await zipIo.openReader(resultBlob);
          try {
            for await (const entry of reader.entries()) {
              if (entry.isDirectory) { entry.skip(); continue; }
              entries.push({ path: entry.fileName, blob: await entry.read() });
              entry.skip();
            }
          } finally { await reader.close(); }
          const split = await splitArchiveEntries(entries, {
            thresholdMB: limit, target: code, handle: 'default-user',
            filenameTemplate: filenameTemplate || DEFAULT_FILENAME_TEMPLATE,
          });
          for (const part of split.parts) {
            created.push({ blob: part.blob, name: part.partName });
          }
        } else {
          const name = resolveFilename(filenameTemplate || DEFAULT_FILENAME_TEMPLATE, {
            sourceName: pkg.name, target: code, handle: 'default-user',
            part: 'part1', category: 'all', mode: 'single',
          });
          created.push({ blob: resultBlob, name });
        }
        logger.info(t('log.converted', { name: pkg.name }));
      }
      await deliverCreated(created, code);
      if (reports.length) view.showReport(reports[reports.length - 1]);
    } catch (err) {
      logger.error(t('log.convertFailed', { msg: err.message }));
      view.setProgress(0, t('progress.convertFailed'));
      view.toast(t('toast.convertFailed'));
    } finally {
      state.busy = false;
    }
  }

  /**
   * 产物落地：始终写工作区（导出区列表），**不自动下载**；下载是用户在导出区里的显式动作。
   * 是否在下载后删除该包由设置「导出后删除导出区里的包」决定。
   */
  async function deliverCreated(created, layout = 'unknown') {
    if (!created.length) { view.setProgress(0, t('toast.convertFailed')); return; }
    for (const item of created) {
      await saveFile({
        id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: item.name, size: item.blob.size, blob: namedBlob(item.blob, item.name),
        layout, role: 'output', origin: ORIGINS.CONVERTED,
        metadata: { convertedAt: Date.now() },
      });
    }
    await syncPackages();
    view.setProgress(100, t('progress.exportReady'));
    view.toast(t('toast.generated', { n: created.length }));
    view.setZone('export');
  }

  /** 取本次转换要用的断点：只有「同一源包」才复用，换包则丢弃旧标记（避免拿别人的半成品续写）。 */
  function takeResumeFor(pkgId) {
    if (!pendingResume) return null;
    if (pendingResume.pkgId !== pkgId) {
      pendingResume = null;
      clearPausedMarker();
      view.setTask(null);
      logger.info(t('log.resumeDropped'));
      return null;
    }
    const resume = { taskId: pendingResume.taskId };
    pendingResume = null;
    logger.info(t('log.taskResumed'));
    return resume;
  }

  /** 「继续」：按暂停标记回到同一源包、同一目标布局。 */
  async function resumePaused() {
    const marker = pendingResume || readPausedMarker();
    if (!marker) return;
    const pkg = state.packages.find((p) => p.id === marker.pkgId);
    if (!pkg) {
      pendingResume = null;
      clearPausedMarker();
      view.setTask(null);
      view.toast(t('toast.convertFailed'));
      return;
    }
    pendingResume = marker;
    const targetName = TARGET_PLATFORMS.find((p) => p.code === marker.target)?.name || marker.target;
    await generate({ packages: [pkg], target: targetName, splitMb: view.getState().splitMb });
  }

  async function downloadPending(id) {
    await exportQueue.download(id);
    const item = exportQueue.items.find((it) => it.id === id);
    if (item?.storedId) exportQueue.remove(id);
    await syncPackages();
  }

  async function stashPending(id) {
    await exportQueue.stash(id);
    const item = exportQueue.items.find((it) => it.id === id);
    if (item?.storedId) {
      exportQueue.remove(id);
      await syncPackages();
      view.toast(t('toast.generated', { n: 1 }));
    }
  }

  function downloadReport(report) {
    const blob = new Blob([reportToHuman(report)], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `report_${Date.now()}.txt`);
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  /** 同名即停：列出冲突路径与涉及份数，绝不静默覆盖。 */
  function showMergeConflicts(conflicts) {
    const rows = conflicts.slice(0, 50)
      .map((c) => `${escapeText(c.path)} <span class="sub">×${c.sources.length}</span>`)
      .join('<br>');
    logger.error(t('log.mergeConflict', { n: conflicts.length }));
    view.openModal(t('lan.mergeConflictTitle'), t('lan.mergeConflictBody'), [
      `<div class="chart-unavailable" style="margin:0">${rows}</div>`,
    ], [{ label: t('lan.gotIt'), primary: true, onClick: () => view.closeModal() }]);
  }

  /**
   * 合并模式：各包先按合并树里自己的勾选转换，再把产物合并成一个包。
   * 同名路径直接停止（用户 2026-10-27 裁定）。
   */
  async function generateMerged({ packages, target, splitMb, filenameTemplate }) {
    const code = targetCodeOf(target);
    const limit = splitLimitOf(splitMb);
    const plan = view.getMergedPlan(packages);
    const compression = Number(view.getState().compression) || 5;
    const blobs = [];
    const reports = [];
    try {
      for (const pkg of packages) {
        const blob = await blobOf(pkg);
        if (!blob) continue;
        if (!(await ensurePlan(pkg.id, target))) continue;
        view.setProgress(3, t('progress.converting', { name: pkg.name }));
        const outcome = await conversionRunner.convert({
          pkg,
          blob,
          target: code,
          options: { excludedPaths: plan.excludedByPkg[pkg.id], ...plan.optionsByPkg[pkg.id] },
          pctBase: 3,
          pctSpan: 50,
          resume: takeResumeFor(pkg.id),
        });
        if (outcome.paused || outcome.aborted) return;
        if (outcome.report) reports.push(outcome.report);
        if (outcome.resultBlob) blobs.push(outcome.resultBlob);
        logger.info(t('log.converted', { name: pkg.name }));
      }
      if (!blobs.length) { view.toast(t('toast.convertFailed')); return; }

      view.setProgress(55, t('progress.merging'));
      const merged = await mergeConvertedBlobs(blobs, {
        compressionLevel: compression,
        onProgress: (done, total) => {
          view.setProgress(55 + Math.round((done / Math.max(1, total)) * 35), t('progress.merging'));
        },
      });
      if (!merged.ok) {
        view.setProgress(0, t('progress.convertFailed'));
        showMergeConflicts(merged.conflicts);
        return;
      }

      const created = [];
      if (limit) {
        const entries = [];
        const reader = await zipIo.openReader(merged.blob);
        try {
          for await (const entry of reader.entries()) {
            entries.push({ path: entry.fileName, blob: await entry.read() });
            entry.skip();
          }
        } finally { await reader.close(); }
        const split = await splitArchiveEntries(entries, {
          thresholdMB: limit, target: code, handle: 'default-user',
          filenameTemplate: filenameTemplate || DEFAULT_FILENAME_TEMPLATE,
        });
        for (const part of split.parts) created.push({ blob: part.blob, name: part.partName });
      } else {
        const name = resolveFilename(filenameTemplate || DEFAULT_FILENAME_TEMPLATE, {
          sourceName: 'merged', target: code, handle: 'default-user',
          part: 'part1', category: 'all', mode: 'single',
        });
        created.push({ blob: merged.blob, name });
      }
      logger.info(t('log.mergeDone', { n: packages.length, files: merged.fileCount }));
      await deliverCreated(created, code);
      if (reports.length) view.showReport(reports[reports.length - 1]);
    } catch (err) {
      logger.error(t('log.convertFailed', { msg: err.message }));
      view.setProgress(0, t('progress.convertFailed'));
      view.toast(t('toast.convertFailed'));
    } finally {
      state.busy = false;
    }
  }

  async function exportLibrary() {
    try {
      const pack = await exportLibraryToPack({});
      if (!pack?.ok || !pack.blob) { view.toast(pack?.reason || t('toast.noChats')); return; }
      const id = `lib-${Date.now()}`;
      await saveFile({
        id, name: pack.name || 'library-export.zip', size: pack.blob.size,
        blob: pack.blob, role: 'source', origin: ORIGINS.UPLOAD,
        metadata: { libraryExport: true },
      });
      await syncPackages();
      await ensurePlan(id);
      view.toast(t('toast.libraryExported'));
    } catch (err) {
      logger.error(t('log.libraryExportFailed', { msg: err.message }));
    }
  }

  /** 从 zip 里取单个条目的字节（私有件传云用）。 */
  async function readZipEntry(sourceBlob, path) {
    if (!path) return null;
    const reader = await zipIo.openReader(sourceBlob);
    try {
      for await (const entry of reader.entries()) {
        if (entry.fileName === path) {
          const data = await entry.read();
          return new Blob([data], { type: 'application/octet-stream' });
        }
        entry.skip();
      }
      return null;
    } finally {
      await reader.close();
    }
  }

  /**
   * 私有件「传云」：把包内单个私有文件装进插件容器，上传到宿主 `user/files`。
   * ST/Luker 原生 `/api/files/upload`（base64 JSON，上限 500 MB）；不可用时只提示，不阻塞。
   */
  async function uploadPrivate(payload) {
    const { name = '', path = '', pkgId = null } = payload || {};
    const activeId = view.getState?.().source?.pkgId || null;
    const pkg = pkgById(pkgId) || pkgById(activeId) || state.packages[0];
    if (!pkg || !path) { view.toast(t('toast.privateUploadMissing')); return; }
    if (!userFilesSupported(hostKey)) { view.toast(t('toast.privateUploadUnsupported')); return; }

    const run = async () => {
      const blob = await blobOf(pkg);
      if (!blob) { view.toast(t('toast.privateUploadMissing')); return; }
      const entry = await readZipEntry(blob, path);
      if (!entry) { view.toast(t('toast.privateUploadMissing')); return; }
      const { blob: container } = await packPrivateContainer([{ path, blob: entry }], {
        sourceLayout: pkg.host || 'unknown',
        targetLayout: pkg.host || 'unknown',
      });
      const stem = sanitizeUserFileName(String(name || path.split('/').pop() || 'private').replace(/\.json$/i, '')) || 'private';
      const fileName = `private_${stem}_${Date.now()}.zip`;
      const result = await uploadUserFile(fileName, container, { platform: hostKey });
      if (!result.ok) {
        logger.error(t('log.privateUploadFailed', { msg: result.detail || result.reason }));
        view.toast(t('toast.privateUploadFailed'));
        return;
      }
      logger.info(t('log.privateUploaded', { name: fileName, path: result.path }));
      addPrivateFile({
        name: fileName,
        path: result.path,
        uploadedAt: Date.now(),
        sizeBytes: container.size,
        sourceName: name || path,
      });
      view.setPrivateFiles(loadPrivateFiles());
      view.toast(t('toast.privateUploaded'));
    };

    if (settings.trafficPrompt) {
      view.confirmTraffic(run, {
        onNever: () => { settings.trafficPrompt = false; saveSettings(settings); },
      });
      return;
    }
    await run();
  }

  function pickJsonFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
      input.click();
    });
  }

  function openSettings() {
    view.openSettingsView(buildSettingsHtml(settings), {
      onSave: (body) => {
        /* base 传入当前设置：只覆盖对话框里存在的控件，Git 账号 / 安装登记等原样保留。 */
        Object.assign(settings, readSettings(body, settings));
        saveSettings(settings);
        view.applySettings?.(settings);
        view.backToWorkbench();
        view.toast(t('settings.saved'));
      },
      onAction: async (name) => {
        if (name === 'plugin-export') {
          const includeCredentials = !!document.querySelector('#set-include-creds')?.checked;
          const includeOAuth = includeCredentials && !!document.querySelector('#set-include-oauth')?.checked;
          const data = buildPluginData({ includeCredentials, includeOAuth });
          const ok = downloadPluginData(data);
          view.toast(ok
            ? (includeCredentials
              ? t('settings.dataExportedCreds', { n: data.settings.gitAccounts.length })
              : t('settings.dataExported'))
            : t('settings.dataBadFile'));
          return;
        }
        if (name === 'plugin-import') {
          if (view.isTutorialMode?.()) { view.toast(t('settings.dataImportTutorial')); return; }
          const file = await pickJsonFile();
          if (!file) return;
          let data = null;
          try { data = JSON.parse(await file.text()); } catch { data = null; }
          if (!isPluginData(data)) { view.toast(t('settings.dataBadFile')); return; }
          const accounts = Array.isArray(data.settings?.gitAccounts) ? data.settings.gitAccounts.length : 0;
          view.openModal(t('settings.dataImportTitle'), t('settings.dataImportDesc', { accounts }), [], [
            { label: t('modal.cancel'), onClick: () => view.closeModal?.() },
            { label: t('settings.dataImport'), primary: true, onClick: () => {
              const res = applyPluginData(data);
              if (!res.ok) { view.toast(t('settings.dataBadFile')); return; }
              Object.assign(settings, loadSettings());
              view.applySettings?.(settings);
              view.toast(t('settings.dataImport'));
              setTimeout(() => location.reload(), 600);
            } },
          ]);
        }
      },
    });
  }

  const lanActions = {
    generate: () => lanPanel?.generate(),
    applyAnswer: (code) => lanPanel?.applyAnswer(code),
    acceptOffer: (code) => lanPanel?.acceptOffer(code),
    retry: () => lanPanel?.retry(),
    cancel: () => lanPanel?.cancel(),
    abandon: () => lanPanel?.abandon(),
  };

  const view = createWorkbenchView({
    qr,
    actions: {
      fetch: fetchFromHost,
      generate,
      restore: restoreSelected,
      copyBack,
      deleteSelected,
      download: downloadSelected,
      libraryExport: exportLibrary,
      taskPause: () => conversionRunner?.pause(),
      taskResume: resumePaused,
      taskAbort: () => conversionRunner?.abort(),
      pendingDownload: downloadPending,
      pendingStash: stashPending,
      pendingRemove: (id) => exportQueue.remove(id),
      pendingClear: () => exportQueue.clear(),
      reportDownload: downloadReport,
      exportAssetList,
      openExtensionManifest: async (pkgId) => {
        const pkg = pkgById(pkgId);
        if (!pkg?.extManifest?.length) { view.toast(t('toast.noExtensionManifest')); return; }
        // 扩展相关入口统一收进内联「扩展管理」，不再弹浮层。
        view.openExtensionManager(pkg.extManifest);
      },
      installExtensions: async (entries) => installExtensionBatch(entries, {
        onEntry: (entry) => view.extEntryUpdate(entry),
        onLog: (line) => view.extLogAppend(line),
      }),
      listHostExtensions: () => listHostExtensions(host.platform),
      hostIdentity: () => readHostIdentity(),
      listServerPlugins: () => listServerPlugins(),
      hostExtensionGit: (name, opts) => readHostExtensionGit(name, opts),
      deleteExtension: (name, isGlobal) => deleteExtensionViaHost(name, isGlobal),
      updateExtension: (name, isGlobal) => updateExtensionViaHost(name, isGlobal),
      moveExtension: (name, source, destination) => moveExtensionViaHost(name, source, destination),
      backupSelectedToCloud,
      importCloudPack,
      lan: lanActions,
      settings: openSettings,
      /**
       * 存储审查面板的数据源：两侧共用同一 UI 与契约，这里只按 source 分流。
       * 非 Luker 宿主显式返回 unavailable，面板如实显示「未提供」，不伪造空数据。
       */
      storageInspector: async (source, path) => {
        if (source === 'host') {
          if (!hostStorageInspectCapability(host.platform).supported) return { unavailable: true };
          return fetchHostStorageInspect(path);
        }
        return browserStorageProvider.fetch(path);
      },
      uploadRequest: () => root.querySelector('#file-input')?.click(),
      uploadPrivate,
      privateFiles: {
        list: () => loadPrivateFiles(),
        verify: async () => {
          const entries = loadPrivateFiles();
          if (!entries.length) return { ok: true, verified: {} };
          const result = await verifyUserFiles(entries.map((entry) => entry.path), { platform: hostKey });
          if (!result.ok) {
            logger.error(t('priv.verifyFailed') + `: ${result.detail || result.reason}`);
            return { ok: false };
          }
          return { ok: true, verified: result.verified || {} };
        },
        remove: async (path) => {
          const result = await deleteUserFile(path, { platform: hostKey });
          if (!result.ok) {
            logger.error(t('priv.deleteFailed') + `: ${result.detail || result.reason}`);
            return { ok: false };
          }
          removePrivateFile(path);
          return { ok: true };
        },
      },
      onActivePackage: (id) => {
        // 先切换视图（命中已缓存的清单时零等待），再后台补扫描；扫描完成后仅当仍是当前包才重绘。
        view.setActivePackage(id);
        ensurePlan(id).then((plan) => {
          if (plan && view.getState().source?.pkgId === id) view.setActivePackage(id);
        });
      },
      onTargetChange: (name) => {
        const active = state.packages.find((p) => view.getState().source?.pkgId === p.id);
        if (active) ensurePlan(active.id, name).then(() => view.setActivePackage(active.id));
      },
      close: () => {
        const overlay = document.getElementById('st-converter-modal-overlay');
        if (overlay) overlay.style.display = 'none';
      },
    },
  });

  conversionRunner = createConversionRunner({
    getTaskManager,
    runConversionTask,
    view,
    logger,
    t,
    opfs: { tmpHandle: opfsTmpHandle, handleToFile: opfsHandleToFile, cleanup: opfsTmpCleanup },
  });
  /* 数据包恢复出来的扩展清单统一进「扩展管理 → 宿主 → 安装扩展」，不再弹独立安装浮层。 */
  setExtensionManifestSink(({ entries } = {}) => {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return;
    view.openExtensionManager(list);
  });
  exportQueue.subscribe(() => view.setPendingExports(exportQueue.items));
  view.setPendingExports(exportQueue.items);
  if (pendingResume) view.setTask({ state: 'paused', label: pendingResume.name || '' });

  // 宿主原生导出优先：在途的插件拉取立即让路（可取消的只有插件自己的请求）。
  watchNativeExportStart(() => {
    if (!activePullAbort) return;
    activePullAbort.abort();
    if (!hostToast(t('toast.hostExportBusy'))) view.toast(t('toast.hostExportBusy'));
  });

  logger.subscribe((entry) => {
    view.pushLog(entry.level === 'SUCCESS' ? 'INFO' : entry.level, entry.message);
  });

  view.setHost(hostKey, host.isPlugin ? 'plugin' : 'web');
  view.applySettings?.(settings);
  modalRefreshHook = () => {
    Object.assign(settings, loadSettings());
    view.applySettings?.(settings);
  };
  view.setPrivateFiles(loadPrivateFiles());
  applyI18n(root);
  root.querySelector('#btn-locale')?.addEventListener('click', () => {
    setLocale(getLocale() === 'zh-CN' ? 'en-US' : 'zh-CN');
  });
  onLocaleChange(() => { applyI18n(root); view.renderAll(); });
  try { view.setLibraryExport(probeChatStore().present); } catch { /* 外部库可选 */ }

  root.querySelector('#file-input')?.addEventListener('change', async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    await importFiles(files);
  });

  for (const target of [root, root.querySelector('#chart-card')]) {
    target?.addEventListener('dragover', (event) => event.preventDefault());
    target?.addEventListener('drop', async (event) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files || [])].filter((f) => f.name.toLowerCase().endsWith('.zip'));
      if (files.length) await importFiles(files);
    });
  }

  lanPanel = mountLanTransferPanel({
    view,
    getSendTargets,
    onReceive: async (blob, name) => {
      const file = new File([blob], name || `lan-${Date.now()}.zip`, { type: 'application/zip' });
      await importFiles([file], { remote: true });
    },
  });

  // 设置项：每次加载清空浏览器里的暂存数据包（不含设置/偏好/日志）。
  if (settings.clearPackagesOnLoad) {
    try {
      await clearStoredFiles();
      logger.info(t('log.storageCleared'));
    } catch (err) {
      logger.warn(t('log.workspaceReadFailed', { msg: err?.message || String(err) }));
    }
  }
  await syncPackages();
  async function refreshStorageQuota() {    // 两条读数彼此独立：任一失败都不能拖垮另一条。
    const [browser, hostQuota] = await Promise.all([
      Promise.resolve().then(() => readBrowserQuota()).catch(() => null),
      host.platform === 'luker'
        ? Promise.resolve().then(() => readHostStorageQuota()).catch(() => null)
        : Promise.resolve(null),
    ]);
    view.setStorage({ browser, host: hostQuota });
  }
  await refreshStorageQuota();
  if (typeof document !== 'undefined') {
    // 读数必须随数据变化：操作后由 syncPackages 触发，另有低频兜底刷新。
    setInterval(() => { if (!document.hidden) refreshStorageQuota(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStorageQuota(); });
  }
  view.setProgress(0, t('progress.ready'));
  logger.info(t('log.workbenchReady', { host: host.isPlugin ? t('header.plugin', { host: HOST_LABEL[host.platform] || t('host.fallback') }) : t('header.web') }));
  try {
    // 「每次打开进入教程模式」默认开：不再用 sessionStorage 拦，刷新/重开都会进入；
    // 用户点教程浮层里的「不再弹出」或取消该设置即不再自动进入。
    if (settings.autoTutorial) {
      // 立即弹：延迟会让用户先操作再看到蒙层（2026-11-09 反馈）。
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => view.openTutorial());
      else view.openTutorial();
    }
  } catch { /* 隐私模式 */ }
}

/**
 * 浏览器真实配额（字节）。
 * API 不可用返回 null（界面显示「未提供读数」）；quota 为 0 时**仍返回已用量**，
 * 由界面显示「已用 X · 配额不限/未知」——不允许把「读不到总量」渲染成假 0 总量。
 */
async function readBrowserQuota() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    const used = Number(usage);
    const total = Number(quota);
    if (!Number.isFinite(used) && !Number.isFinite(total)) return null;
    return {
      used: Number.isFinite(used) ? used : 0,
      total: Number.isFinite(total) && total > 0 ? total : 0,
    };
  } catch {
    return null;
  }
}

function bootstrap() {
  mountDebugProbe();
  const host = detectHost();
  if (host.isPlugin) {

    mountExtensionRowButton(() => {
      closeHostExtensionSurface();
      openConverterModal();
    });
    // 原生入口逐宿主不同（2026-11-04 实测核对，不可按「都有账户面板」假设）：
    //  · ST        → 账户面板 .userBackupButton
    //  · Luker     → 账户面板 →「Backup & Restore」弹层的 .backupActionRow
    //  · TauriTavern → 扩展列表「Data Migration」#data_migration_export_button（无账户面板入口）
    //  · PureTavern → 扩展「PureTavern 数据管理」dialog 的 #ptdm-export
    if (host.platform === 'luker') {
      mountLukerBackupManagerButton(() => nativePullHook?.());
    } else if (host.platform === 'tt') {
      mountTtDataMigrationButton(() => nativePullHook?.());
    } else if (host.platform === 'pt') {
      mountPtDataManagementButton(() => nativePullHook?.());
    } else {
      mountNativeBackupButton(() => nativePullHook?.());
    }
    return;
  }
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.add('app-standalone');
  if (!app.hasChildNodes()) app.innerHTML = trustedStaticMarkup(getWorkbenchHtml({ isStandalone: true }));
  applyI18n(app);
  if (!initialized) { initialized = true; main(app); }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
}
