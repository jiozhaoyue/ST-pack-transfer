/**
 * 数据包转运 · 控制器（2026-10-27 全面重写）
 *
 * 界面：`src/ui/workbench-view.js` = UI 定稿 demo 的原样搬运。
 * 本文件只做三件事：宿主探测、包仓库读写、把真实动作接到视图的 `actions`。
 */

import { runConversionTask, runPlanTask } from './src/core/worker-client.js';
import { logger } from './src/core/logger.js';
import { zipIo, readZipEntryManifest } from './src/core/zip-io.js';
import { inspectPackage } from './src/core/inspect.js';
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
  serverPluginUpdate, serverPluginDelete, serverPluginInstallDeps, serverPluginInstall,
  updateExtensionViaHost, setExtensionManifestSink,
  opfsTmpHandle, opfsHandleToFile, opfsTmpCleanup,
} from './src/ui/host-bridge.js';
import { packPrivateContainer } from './src/core/private-container.js';
import { prunePackageExtensions } from './src/core/ext-prune.js';
import { parseRepoUrl } from './src/core/git-url.js';
import { downloadRepoFiles } from './src/core/repo-files.js';
import {
  classifyRepoFiles, buildInjectionEntries, extensionDirName, injectionRoot,
} from './src/core/ext-install-web.js';
import { detectLayout } from './src/core/detect.js';
import { augmentZip } from './src/core/zip-augment.js';
import { findAccountFor } from './src/core/git-accounts.js';
import { sanitizeEngineDumpForRestore } from './src/core/engine-sanitize.js';
import { loadPrivateFiles, addPrivateFile, removePrivateFile } from './src/ui/private-files-store.js';
import { ORIGIN_ZONE, zoneOfOrigin, copyBackRecord } from './src/core/zone-model.js';
import { exportLibraryToPack, importRestoredChatsIntoLibrary } from './src/ui/chat-store-inject.js';
import { mountLanTransferPanel } from './src/ui/lan-transfer-panel.js';
import { createBrowserStorageProvider } from './src/ui/storage-inspector-browser.js';
import { qr } from './src/ui/qr.js';
import { buildSettingsHtml, readSettings, applyWebTheme } from './src/ui/settings-panel.js';
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
import { readGitHistoryFromEntries } from './src/core/git-local.js';
import { objectKey } from './src/core/s3-client.js';
import { createTransferTarget } from './src/core/transfer-target.js';
import { createTransferRunner } from './src/app/transfer-runner.js';
import { uploadBackupSet, updateSetRegistry } from './src/app/backup-set-runner.js';
import { openEntrySession, safeSegment, timestampName } from './src/core/backup-set.js';
import { pruneFullSnapshots } from './src/core/transfer-prune.js';
import { ExportQueue } from './src/ui/export-queue.js';
import { APP_VERSION } from './src/core/app-version.js';
import {
  fetchCloudCommits, fullChangelog, markSeenVersion, paginateChangelog, readSeenVersion, recentChangelog, shouldShowChangelog,
} from './src/core/changelog.js';
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

/**
 * 教程浮层必须直接挂到 `document.body`。
 *
 * 宿主（SillyTavern / Luker 抽屉与模态）祖先常带 `transform` / `filter` / 滚动容器，
 * `position:fixed` 会被困进祖先坐标系——页面一滚，浮层就停在祖先顶部、落在屏幕外。
 * 移到 body 后固定定位才真正相对视口；样式由 `#st-pt-tutorial-overlay` 自有作用域承载。
 */
function portalTutorialOverlay() {
  const overlay = document.getElementById('st-pt-tutorial-overlay');
  if (overlay && overlay.parentElement !== document.body) {
    document.body.appendChild(overlay); // dom-scope:allow 教程浮层必须逃出宿主 transform 祖先
  }
}

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
  portalTutorialOverlay();
  const host = detectHost();
  const hostKey = host.isPlugin ? (HOST_CODE[host.platform] || 'st') : 'st';
  root.dataset.host = hostKey;

  const settings = loadSettings();
  // 日志阈值默认 WARN；设置可切 debug / info / error。所有级别始终入账，不因阈值丢弃。
  logger.setLevel(settings.logLevel || 'warn');
  logger.debug(`[init] host=${host.platform} plugin=${host.isPlugin} logLevel=${logger.getLevel()} version=${APP_VERSION}`);
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
  /** 连续任务队列：生成批次可排队，支持暂停 / 继续 / 中断 / 排序。 */
  const taskQueue = [];
  /** 已结束任务保留展示（最多 20 条）；不参与执行，可手动移除。 */
  const queueFinished = [];
  /** 不进入串行队列的短任务记录（下载 / 复制回 / 导入 / 云端下载等），供日志页签全量展示。 */
  const activityTasks = [];
  const rememberActivity = (job) => {
    activityTasks.push(job);
    while (activityTasks.length > 200) activityTasks.shift();
  };
  const rememberFinished = (job) => {
    queueFinished.push(job);
    while (queueFinished.length > 200) queueFinished.shift();
  };
  let taskSeq = 0;
  let queueBusy = false;
  let queueCurrent = null;
  /** 最近一次生成落库的产物 id（自动备份流程用来定位导出包）。 */
  let lastCreatedIds = [];
  /** 恢复 / 云端备份的协作式取消标记（在批次边界与上传循环内检查）。 */
  let restoreCancelRequested = false;
  let cloudCancelRequested = false;
  const queueSnapshot = () => [
    ...(queueCurrent ? [queueCurrent] : []),
    ...taskQueue,
    ...queueFinished,
    ...activityTasks,
  ].map((job) => ({
    id: job.id,
    type: job.type || 'task',
    label: job.label,
    status: job.status,
    pct: job.pct || 0,
    canPause: job.canPause !== false,
    canAbort: job.canAbort !== false,
    createdAt: job.createdAt || 0,
    startedAt: job.startedAt || 0,
    finishedAt: job.finishedAt || 0,
    detail: job.detail || '',
    error: job.error || '',
  }));
  const syncQueue = () => { try { view.setTaskQueue(queueSnapshot()); } catch { /* 视图尚未创建 */ } };
  const setQueueProgress = (pct) => {
    if (!queueCurrent) return;
    queueCurrent.pct = Math.max(0, Math.min(100, Number(pct) || 0));
    syncQueue();
  };
  /**
   * 记录不进入串行队列的操作（下载 / 复制回 / 导入 / 云端下载等）。
   * 返回 updater，供调用方推进进度并收尾；失败必须显式 fail，不能静默丢。
   */
  function recordActivity({ type = 'task', label = '', detail = '', pct = 0 } = {}) {
    const job = {
      id: `a${++taskSeq}`,
      type,
      label: label || t('taskq.title'),
      status: 'running',
      pct: Math.max(0, Math.min(100, Number(pct) || 0)),
      detail: String(detail || ''),
      createdAt: Date.now(),
      startedAt: Date.now(),
      finishedAt: 0,
      canPause: false,
      canAbort: false,
    };
    rememberActivity(job);
    syncQueue();
    return {
      update(nextPct, nextDetail) {
        if (nextPct !== undefined && nextPct !== null) job.pct = Math.max(0, Math.min(100, Number(nextPct) || 0));
        if (nextDetail !== undefined && nextDetail !== null) job.detail = String(nextDetail);
        syncQueue();
      },
      done(nextDetail) {
        job.status = 'done';
        job.pct = 100;
        job.finishedAt = Date.now();
        if (nextDetail !== undefined) job.detail = String(nextDetail || '');
        syncQueue();
      },
      fail(err) {
        job.status = 'failed';
        job.finishedAt = Date.now();
        job.error = String(err?.message || err || '');
        syncQueue();
      },
    };
  }

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

  /** 包内 `.git` 历史缓存：同一个包/扩展只解一次 packfile。 */
  const packageGitCache = new Map();
  async function readPackageGit(pkgId, name) {
    const key = `${pkgId}|${String(name || '')}`;
    if (packageGitCache.has(key)) return packageGitCache.get(key);
    const pkg = pkgById(pkgId);
    if (!pkg) return { ok: false, reason: 'no-package' };
    const blob = await blobOf(pkg);
    if (!blob) return { ok: false, reason: 'no-blob' };
    const reader = await zipIo.openReader(blob);
    try {
      const result = await readGitHistoryFromEntries(reader.entries(), {
        extensionName: String(name || ''),
        maxCommits: 50,
      });
      packageGitCache.set(key, result);
      if (packageGitCache.size > 24) {
        const first = packageGitCache.keys().next().value;
        if (first) packageGitCache.delete(first);
      }
      return result;
    } catch (err) {
      const result = { ok: false, reason: err?.message || String(err) };
      packageGitCache.set(key, result);
      return result;
    } finally {
      await reader.close();
    }
  }

  function inferLayoutFromName(name) {
    const n = String(name || '').toLowerCase();
    if (n.startsWith('luker_') || n.startsWith('luker-') || n.includes('luker')) return 'l';
    if (n.startsWith('st_') || n.startsWith('sillytavern_')) return 'st';
    if (n.startsWith('tt_') || n.startsWith('tauritavern_')) return 'tt';
    if (n.startsWith('pt_') || n.startsWith('puretavern_')) return 'pt';
    return 'unknown';
  }

  function toPackage(record) {
    const zone = zoneOfOrigin(record.origin);
    let layout = record.layout || state.layoutById.get(record.id) || '';
    if (!layout || layout === 'unknown') {
      const inferred = inferLayoutFromName(record.name);
      if (inferred !== 'unknown') layout = inferred;
      else layout = 'unknown';
    }
    const sizeBytes = record.size || 0;
    return {
      id: record.id,
      zone,
      host: HOST_CODE[layout] || 'unknown',
      name: record.name || record.id,
      size: fmtMB(sizeBytes / (1024 * 1024)),
      mb: sizeBytes / (1024 * 1024),
      rawBytes: record.rawBytes || (record.metadata?.rawBytes || 0),
      rawMb: (record.rawBytes || record.metadata?.rawBytes)
        ? Math.round(((record.rawBytes || record.metadata.rawBytes) / (1024 * 1024)) * 10) / 10
        : 0,
      uncompressedMb: (record.rawBytes || record.metadata?.rawBytes)
        ? Math.round(((record.rawBytes || record.metadata.rawBytes) / (1024 * 1024)) * 10) / 10
        : 0,
      ts: record.createdAt || Date.now(),
      time: clockOf(record.createdAt),
      /** 产物声明的目标布局（转换时写入）；用于区分结构相同但平台不同的 TT / PT 包。 */
      declaredLayout: record.layout || '',
      originCode: record.origin,
      metadata: record.metadata || {},
      autoFlow: String(record.metadata?.autoFlow || ''),
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

  /**
   * 独立 Web / 无宿主形态：把仓库文件写进当前勾选的数据包（源包），随包导出。
   *
   * 与宿主形态的分工：宿主形态由宿主服务端克隆进扩展目录；这里没有宿主端点可用，
   * 因此注入源包 —— 下游 `detectFromReader` / `routeSource` / `targetEntryPath` 全部照常工作。
   * 落点按**源包布局**决定（ST/L 摊平 `extensions/`，TT `data/default-user/extensions/`），
   * 保证转换时能被认成扩展，而不是一堆散文件。
   *
   * @param {Array<{url:string,ref?:string,branch?:string,credential?:object}>} entries
   * @param {{onEntry?:Function,onLog?:Function}} hooks
   * @returns {Promise<Array<{url:string,branch:string,status:string,error?:string}>>}
   */
  async function installExtensionsIntoPackage(entries, { onEntry, onLog } = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const results = [];
    if (!list.length) return results;

    const fail = (entry, error) => {
      onEntry?.({ url: entry.url, branch: entry.branch || '', status: 'failed', error });
      onLog?.(`[${new Date().toISOString()}] FAIL ${entry.url}: ${error}`);
      results.push({ url: entry.url, branch: entry.branch || '', status: 'failed', error });
    };

    const selectedIds = [...(view.getState().selectedPkgs || [])];
    const targetPkg = selectedIds
      .map((id) => state.packages.find((pkg) => pkg.id === id))
      .find((pkg) => pkg && pkg.zone === 'import');
    if (!targetPkg) {
      for (const entry of list) fail(entry, t('extmgr.webNoPackage'));
      return results;
    }

    const sourceBlob = await blobOf(targetPkg);
    if (!sourceBlob) {
      for (const entry of list) fail(entry, t('extmgr.webNoPackage'));
      return results;
    }
    let layout = 'unknown';
    try {
      const detected = await detectLayout(sourceBlob);
      layout = ['st', 'l', 'tt', 'unknown'].includes(detected?.layout) ? detected.layout : 'unknown';
      if (detected?.layout === 'pt-native') {
        for (const entry of list) fail(entry, t('extmgr.webPtNative'));
        return results;
      }
    } catch {
      layout = 'unknown';
    }

    const injected = [];
    for (const entry of list) {
      const parsed = parseRepoUrl(entry.url);
      if (!parsed?.ok) { fail(entry, 'parse'); continue; }
      onEntry?.({ url: entry.url, branch: entry.branch || '', status: 'installing' });
      onLog?.(`[${new Date().toISOString()}] fetch ${entry.url} (${entry.branch || 'default branch'})${entry.credential?.secret ? ' · 已注入凭据' : ''}`);
      /* 凭据优先用调用方给的；缺失时按仓库回查账号表 —— 视图侧的匹配结果不能当作唯一来源。 */
      let credential = entry.credential?.secret ? entry.credential : null;
      if (!credential) {
        const matched = findAccountFor(loadSettings().gitAccounts, parsed);
        if (matched?.secret) {
          credential = { kind: matched.username ? 'basic' : 'token', site: matched.site, username: matched.username, secret: matched.secret };
        }
      }
      const account = credential?.secret
        ? { site: credential.site, username: credential.username || '', secret: credential.secret }
        : null;
      // eslint-disable-next-line no-await-in-loop —— 逐仓库串行：单仓库可能几百个文件，且要能随时中止
      const download = await downloadRepoFiles({
        repo: parsed,
        ref: entry.ref || entry.branch || '',
        account,
        fetchImpl: typeof fetch === 'function' ? fetch.bind(globalThis) : null,
        onProgress: ({ done, total }) => {
          if (done === total || done % 100 === 0) {
            onLog?.(`[${new Date().toISOString()}] ` + t('log.webExtProgress', { repo: parsed.repo, done, total }));
          }
        },
      });
      if (!download.ok) { fail(entry, download.reason); continue; }
      const kind = classifyRepoFiles(download.files);
      if (!kind.ok) {
        fail(entry, kind.reason === 'server-plugin' ? t('extmgr.webServerPlugin') : t('extmgr.webNoManifest'));
        continue;
      }
      const name = extensionDirName(parsed);
      const rows = buildInjectionEntries(download.files, name, layout);
      if (!rows.length) { fail(entry, t('extmgr.webNoManifest')); continue; }
      injected.push(...rows);
      onEntry?.({ url: entry.url, branch: entry.branch || '', status: 'ok' });
      onLog?.(`[${new Date().toISOString()}] OK ${entry.url} → ` + t('log.webExtOk', { root: injectionRoot(name, layout), n: rows.length }));
      results.push({ url: entry.url, branch: entry.branch || '', status: 'ok' });
    }

    if (!injected.length) return results;
    try {
      const augmented = await augmentZip(sourceBlob, injected, {});
      const id = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const baseName = String(targetPkg.name || 'package').replace(/\.zip$/i, '');
      const name = `${baseName} ${t('extmgr.webPackSuffix')}.zip`;
      await saveFile({
        id, name, size: augmented.size, blob: augmented, role: 'source', origin: ORIGINS.UPLOAD,
        metadata: { importedAt: Date.now(), injectedExtensions: injected.length },
      });
      await syncPackages();
      view.setActivePackage?.(id);
      logger.success(t('extmgr.webInjected', { name, n: injected.length }));
    } catch (err) {
      logger.error(t('log.webExtInjectFail', { msg: err?.message || String(err) }));
      for (const r of results) {
        if (r.status === 'ok') { r.status = 'failed'; r.error = `inject: ${err?.message || err}`; }
      }
    }
    return results;
  }

  /** 读取包内 `_convert/extensions-manifest.json`；没有则返回空数组。只解压这一条。 */
  async function readPackageExtensionManifest(blob) {
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
    logger.debug(`[plan] start pkg=${pkgId} target=${targetName || view.getState().target}`);
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
        // 源存储引擎：Luker 下选中包后自动切到该引擎（不再停留在「跟随源包」）。
        live.sourceEngine = plan.sourceEngine?.kind || '';
        // 扩展作用域诊断（同名覆盖 / 自带插件）：UI 顶部汇总条与行内指引的唯一数据源。
        live.extensionScopes = plan.extensionScopes || null;
        live.extManifest = pkg.extManifest || [];
        // 产物包保留转换时声明的目标布局：PT 产物与 TT 结构相同，重新识别只会得到 tt。
        if (!live.declaredLayout) live.host = HOST_CODE[plan.sourceLayout] || live.host;
        live.unrecognized = plan.totalSourceFiles === 0;
        live.rawBytes = plan.totalSourceBytes || 0;
        live.rawMb = Math.round(((plan.totalSourceBytes || 0) / (1024 * 1024)) * 10) / 10;
        live.uncompressedMb = live.rawMb;
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
    logger.debug(`[import] received ${files?.length || 0} file(s) remote=${!!remote}: ${(files || []).map((f) => f?.name).filter(Boolean).join(', ')}`);
    const list = [...(files || [])];
    if (!list.length) return;
    if (!isStorageSupported()) { view.toast(t('toast.storageUnsupported')); return; }
    const used = new Set(state.packages.map((p) => p.name));
    const act = recordActivity({
      type: 'import',
      label: t('taskq.labelImport', { n: list.length }),
    });
    let imported = 0;
    for (const file of list) {
      const name = remote ? uniqueRemoteName(file.name, used) : file.name;
      used.add(name);
      const id = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await saveFile({
        id, name, size: file.size, blob: file, role: 'source',
        origin: remote ? ORIGINS.LAN : ORIGINS.UPLOAD,
        metadata: { importedAt: Date.now(), ...(remote ? { remote: true } : {}) },
      });
      act.update((imported / Math.max(1, list.length)) * 100, name);
      logger.info(t(remote ? 'log.received' : 'log.imported', { name }));
      imported += 1;
    }
    await syncPackages();
    if (remote) view.setZone('import');
    const newest = state.packages.filter((p) => p.zone === 'import').sort((a, b) => b.ts - a.ts)[0];
    if (newest) {
      await ensurePlan(newest.id);
      Object.assign(settings, loadSettings());
      view.applySettings?.(settings);
      view.setActivePackage(newest.id, { exclusive: true });
    }
    act.done();
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
   * `names` 给定时只导出勾中的扩展（扩展管理里的「导出扩展清单」）。
   * @param {{names?:string[]}} [request]
   */
  async function exportHostAssetList(request = {}) {
    await ensureAssetListGuide();
    const result = await listHostExtensions(host.platform);
    if (!result.ok) {
      view.toast(t('toast.assetListUnavailable'));
      logger.warn(`${t('toast.assetListUnavailable')}: ${result.reason || result.status || ''}`);
      return;
    }
    const picked = Array.isArray(request.names) ? new Set(request.names.filter(Boolean)) : null;
    const hostItems = (result.items || [])
      .filter((item) => item.sourceType !== 'system')
      .filter((item) => !picked || picked.has(String(item.id || item.folder || item.name || '')));
    if (!hostItems.length) {
      view.toast(t('toast.assetListEmpty', { total: 0 }));
      return;
    }
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
    if (request.source === 'host') return exportHostAssetList(request);
    return exportPackageAssetList(request.pkgIds);
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
    provider = 's3', config = {}, mode = 'full', setName = 'default', retention = 10, signal = null,
    ids: passedIds = null,
  } = {}) {
    // 2026-11-14 修 bug：选中包的真源在**视图状态**（`view.getState().selectedPkgs`），
    // 本作用域的 `state` 没有该字段 ⇒ 旧写法 `[...undefined]` 抛 TypeError，
    // 云端备份按钮自状态重构后对真实用户一直是坏的（单测只覆盖 runner 纯逻辑，没覆盖这段接线）。
    // 2026-11-17：自动备份流程可显式传入 ids（自动生成的导出包不一定在左侧勾选集合里）。
    const ids = Array.isArray(passedIds) && passedIds.length
      ? [...passedIds]
      : [...(view.getState().selectedPkgs || [])];
    if (!ids.length) { view.toast(t('toast.selectPackFirst')); return { ok: false, reason: 'empty' }; }
    if (mode === 'set' && ids.length !== 1) { view.toast(t('cloud.setSinglePack')); return { ok: false, reason: 'set-single-pack' }; }
    if (state.busy) return { ok: false, reason: 'busy' };
    const target = createTransferTarget({
      kind: provider === 'webdav' ? 'webdav' : 's3',
      config,
      fetchImpl: (url, init) => fetch(url, init),
      proxyUrl: loadSettings().netProxyUrl || '',
    });
    if (!target.ready) { view.toast(t('cloud.notConfigured')); return { ok: false, reason: 'not-ready' }; }

    state.busy = true;
    try {
      const passphrase = String(config.passphrase || '');
      if (provider === 'webdav' && config.prefix && typeof target.ensureCollection === 'function') {
        const collection = await target.ensureCollection(config.prefix);
        if (!collection.ok) {
          view.toast(t('cloud.error', { msg: collection.message || collection.code || 'mkcol-failed' }));
          return { ok: false, reason: collection.code || 'mkcol-failed' };
        }
      }

      if (mode === 'plain') {
        // 与侧栏选中列表共用同一选择：不做快照命名、不做保留策略，按原包名上传。
        let uploaded = 0;
        let skipped = 0;
        let failed = 0;
        let encryptedPackages = 0;
        for (const id of ids) {
          if (signal?.aborted) break;
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
            signal,
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
        if (signal?.aborted) {
          view.setProgress(0, t('progress.aborted'));
          return { ok: false, aborted: true };
        }
        const summary = { uploaded, skipped, failed, encrypted: encryptedPackages };
        view.setProgress(100, t('cloud.uploadDone', summary));
        view.toast(t('cloud.uploadDone', summary));
        logger.info(t('cloud.uploadDone', summary));
        return { ok: failed === 0 && (uploaded + skipped) > 0, summary };
      }

      if (mode === 'set') {
        const pkg = state.packages.find((p) => p.id === ids[0]);
        const blob = pkg ? await blobOf(pkg) : null;
        if (!blob) {
          logger.warn(t('cloud.backupMissingBlob', { name: pkg?.name || ids[0] }));
          view.toast(t('cloud.backupMissingBlob', { name: pkg?.name || ids[0] }));
          return { ok: false, reason: 'missing-blob' };
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
            signal,
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
            return { ok: false, reason: msg };
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
          return { ok: true, summary };
        } finally {
          await session.close();
        }
      }

      if (provider === 'webdav' && config.prefix && typeof target.ensureCollection === 'function') {
        const collection = await target.ensureCollection(`${config.prefix}/snapshots`);
        if (!collection.ok) {
          view.toast(t('cloud.error', { msg: collection.message || collection.code || 'mkcol-failed' }));
          return { ok: false, reason: collection.code || 'mkcol-failed' };
        }
      }

      let uploaded = 0;
      let skipped = 0;
      let failed = 0;
      let encryptedPackages = 0;
      /* 2026-11-18 修复（E2E W9 间歇假红背后的真 bug）：快照戳只到秒 ⇒ **同一秒内
         连续备份会用同一 base 互相覆盖**，用户静默丢快照（全量跑实测三连备只剩 1 份）。
         增量集路径早有防撞守卫（backup-set-runner.js:187-193 的 used.has 回退），full 路径
         此处补齐：秒级戳 + 4 位随机后缀；pruneFullSnapshots 按 manifest base 分组，
         与 base 长度无关，兼容。 */
      const stamp = `${timestampName()}-${Math.random().toString(36).slice(2, 6)}`;
      for (let i = 0; i < ids.length; i += 1) {
        if (signal?.aborted) break;
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
          signal,
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

      if (signal?.aborted) {
        view.setProgress(0, t('progress.aborted'));
        return { ok: false, aborted: true };
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
      return { ok: failed === 0 && succeeded > 0, summary };
    } catch (error) {
      const msg = String(error?.message || error);
      logger.error(t('cloud.backupItemFailed', { name: 'backup', msg }));
      view.toast(t('cloud.error', { msg }));
      return { ok: false, reason: msg };
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
      // 2026-11-14 改进：云端恢复的包是源包的字节级副本 ⇒ 落导入区（cloud-restore），
      // 用户可直接当源继续转换；旧 origin=converted 会把它放进导出区，与
      // 「备份集恢复 → 再走既有迁移流程」的既定流程相悖。
      origin: ORIGINS.CLOUD_RESTORE,
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
    const act = recordActivity({
      type: 'download',
      label: t('taskq.labelDownload', { n: ids.length }),
    });
    let count = 0;
    try {
      for (const id of ids) {
        const pkg = pkgById(id);
        const blob = await blobOf(pkg);
        if (!blob) continue;
        downloadBlob(blob, pkg.name);
        count += 1;
        act.update((count / Math.max(1, ids.length)) * 100, pkg.name);
        if (settings.deleteAfterExport) {
          try { await deleteFile(id); } catch { /* 已不存在 */ }
        }
      }
      if (settings.deleteAfterExport && count) await syncPackages();
      act.done();
    } catch (err) {
      act.fail(err);
      logger.warn(t('toast.downloadFailed', { msg: err?.message || err }));
    }
  }

  async function copyBack(ids) {
    const act = recordActivity({
      type: 'copyback',
      label: t('taskq.labelCopyback', { n: ids.length }),
    });
    let count = 0;
    try {
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
        act.update((count / Math.max(1, ids.length)) * 100, pkg.name);
      }
      await syncPackages();
      act.done();
      view.toast(t('toast.copiedBackCount', { n: count }));
    } catch (err) {
      act.fail(err);
      throw err;
    }
  }

  async function deleteSelected(ids) {
    if (!ids.length) { view.toast(t('toast.selectDeleteFirst')); return; }
    const ok = await confirmDialog(t('modal.confirmDelete', { n: ids.length }));
    if (!ok) return;
    const failed = await removePackages(ids);
    /* G-20 失败不静默：有真实 IO 失败时如实提示，不再无条件报「已删除」。 */
    if (failed.length) view.toast(t('toast.deleteFailedPartial', { n: failed.length }));
    else view.toast(t('toast.deleted'));
  }

  /** 无二次确认的删除（供「丢弃成功项」等已确认动作复用）。
   *  返回值：删除失败的 id 数组（全成功为空数组）。
   *  2026-11-18（G-20）：不再吞删除异常——db.deleteFile 对「记录不存在」本就不抛
   *  （IndexedDB delete 缺键即成功），旧写法的空 catch 只会吃真故障（配额/事务/连接失效）；
   *  且失败项不再清缓存，避免包从 UI「假消失」。 */
  async function removePackages(ids) {
    const failed = [];
    for (const id of ids) {
      try {
        await deleteFile(id);
      } catch (err) {
        failed.push(id);
        logger.warn(t('log.deleteFailed', { id, msg: err?.message || String(err) }));
        continue;
      }
      state.nodesById.delete(id);
      state.layoutById.delete(id);
      for (const key of [...packageGitCache.keys()]) {
        if (key.startsWith(`${id}|`)) packageGitCache.delete(key);
      }
    }
    await syncPackages();
    return failed;
  }

  async function restoreSelected(ids) {
    if (!host.isPlugin) { view.toast(t('toast.pluginOnlyRestore')); return; }
    const targets = ids.map(pkgById).filter((p) => p && p.zone === 'export');
    if (!targets.length) { view.toast(t('toast.selectExportPack')); return; }
    if (settings.trafficPrompt) {
      const proceed = await askTraffic();
      if (!proceed) return 'aborted';
    }
    return restoreSelectedConfirmed(targets);
  }

  async function restoreSelectedConfirmed(targets) {
    const ok = await confirmDialog(targets.length > 1
      ? t('modal.confirmRestoreMany', { n: targets.length })
      : t('modal.confirmRestore', { name: targets[0].name }));
    if (!ok) return;
    if (state.busy) return;
    state.busy = true;
    const results = [];
    const restoredManifests = [];
    const record = { startedAt: Date.now(), total: targets.length, done: 0, results };
    persistRestoreProgress(record);
    try {
      for (let i = 0; i < targets.length; i += 1) {
        if (restoreCancelRequested) {
          logger.warn(t('taskq.abortedToast'));
          break;
        }
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
          try {
            const m = (pkg.extManifest && pkg.extManifest.length)
              ? pkg.extManifest
              : await readPackageExtensionManifest(sane.blob).catch(() => []);
            if (Array.isArray(m) && m.length) restoredManifests.push(...m);
          } catch { /* 清单读取容错 */ }
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
    // 自动按清单安装扩展：若存在清单且开关未关闭，支持全自动下载或提示安装
    const autoInstallMode = settings.autoInstallManifestAfterUpload || 'prompt';
    if (failed === 0 && restoredManifests.length > 0 && autoInstallMode !== 'off') {
      if (settings.autoRefreshAfterUpload && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('stpt.pendingManifestInstall', JSON.stringify({
            items: restoredManifests,
            auto: autoInstallMode === 'auto',
          }));
        } catch { /* 忽略 */ }
      } else {
        setTimeout(() => {
          view.openExtensionManager(restoredManifests, { autoInstall: autoInstallMode === 'auto' });
        }, 500);
      }
    }
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
  async function pullFromPt(options, { autoFlow = false } = {}) {
    if (state.busy) return false;
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
        autoFlow,
      });
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') {
        logger.warn(t('log.hostPullCancelled'));
        view.setProgress(0, t('progress.hostPullCancelled'));
      } else {
        logger.error(t('log.hostFetchFailed', { msg: err.message }));
        view.setProgress(0, t('progress.hostFetchFailed'));
      }
      return false;
    } finally {
      if (activePullAbort === ac) activePullAbort = null;
      state.busy = false;
    }
  }

  /**
   * 拉取落库的公共尾段：入库 → 同步 → 设为活动包 → 完成提示。
   * @param {{id: string, name: string, blob?: Blob, opfsName?: string|null, opfsDir?: string|null, size: number, fromNativeUi: boolean, pullStart: number}} pack
   */
  async function commitPulledPack({ id, name, blob, opfsName, opfsDir, size, fromNativeUi, pullStart, autoFlow = false }) {
    const storeStart = performance.now();
    await saveFile({
      id, name, size, blob: opfsName ? null : namedBlob(blob, name),
      opfsName, opfsDir,
      layout: hostLayoutCode(host.platform), role: 'source',
      origin: ORIGINS.HOST_EXPORT,
      metadata: { fetchedAt: Date.now(), ...(autoFlow ? { autoFlow: 'pull' } : {}) },
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
  async function pullFromHost(selection, fromNativeUi, { autoFlow = false } = {}) {
    logger.debug(`[pull] start host pull fromNativeUi=${!!fromNativeUi} autoFlow=${!!autoFlow} selection=${JSON.stringify(selection || {})}`);
    if (state.busy) return false;
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
        autoFlow,
      });
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') {
        logger.warn(t('log.hostPullCancelled'));
        view.setProgress(0, t('progress.hostPullCancelled'));
      } else {
        logger.error(t('log.hostFetchFailed', { msg: err.message }));
        view.setProgress(0, t('progress.hostFetchFailed'));
      }
      return false;
    } finally {
      if (activePullAbort === ac) activePullAbort = null;
      state.busy = false;
    }
  }

  /** 对外的「生成」入口：**永不阻塞**，一律先入队；队列串行执行。 */
  function generate(args = {}) {
    const packages = Array.isArray(args.packages) ? args.packages : [];
    if (!packages.length) { view.toast(t('toast.selectExportFirst')); return; }
    const label = t('taskq.labelGenerate', { n: packages.length, target: args.target || '' });
    enqueueTask({ type: 'generate', label, run: () => executeGenerate(args) });
  }

  /** 宿主拉取：排入统一队列；不支持暂停，但可中断插件侧请求。 */
  function enqueueHostPull() {
    const job = enqueueTask({
      type: 'pull',
      label: t('taskq.labelPull'),
      canPause: false,
      cancel: () => { try { activePullAbort?.abort(); } catch { /* 已结束 */ } },
      run: async () => { await fetchFromHost(); return 'done'; },
    });
    return job?.promise;
  }

  /** 恢复写回：排入统一队列；批次边界可中断。 */
  function enqueueRestore(ids) {
    const targets = (Array.isArray(ids) ? ids : []).map(pkgById).filter((p) => p && p.zone === 'export');
    if (!targets.length) { view.toast(t('toast.selectExportPack')); return Promise.resolve({ status: 'empty' }); }
    const job = enqueueTask({
      type: 'restore',
      label: t('taskq.labelRestore', { n: targets.length }),
      canPause: false,
      cancel: () => { restoreCancelRequested = true; },
      run: async () => {
        restoreCancelRequested = false;
        const result = await restoreSelected(ids);
        return (result === 'aborted' || restoreCancelRequested) ? 'aborted' : 'done';
      },
    });
    return job?.promise;
  }

  /** 云端备份：排入统一队列；上传循环接收 AbortSignal。 */
  function enqueueCloudBackup(options = {}) {
    const job = enqueueTask({
      type: 'cloud',
      label: t('taskq.labelCloud', { provider: String(options.provider || 's3').toUpperCase() }),
      canPause: false,
      cancel: () => { cloudCancelRequested = true; },
      run: async ({ signal }) => {
        cloudCancelRequested = false;
        await backupSelectedToCloud({ ...options, signal });
        return cloudCancelRequested || signal?.aborted ? 'aborted' : 'done';
      },
    });
    return job?.promise;
  }

  /**
   * 一键自动备份：自动拉取 → 按当前图表勾选/扩展模式修剪 → 生成导出 →
   * 上传 → 校验成功 → 按设置删除自动流程包。
   * 全程只用现有能力，不引入后台 cron；失败时保留包并如实记录。
   */
  function enqueueAutoBackup(options = {}) {
    const job = enqueueTask({
      type: 'autobackup',
      label: t('taskq.labelAutoBackup', { provider: String(options.provider || 's3').toUpperCase() }),
      canPause: false,
      canAbort: true,
      cancel: () => {
        cloudCancelRequested = true;
        try { activePullAbort?.abort(); } catch { /* 已结束 */ }
      },
      run: async ({ signal }) => {
        cloudCancelRequested = false;
        return autoBackup({ ...options, signal });
      },
    });
    return job?.promise;
  }

  async function autoBackup({
    provider = 's3', config = {}, mode = 'full', setName = 'default', retention = 10, signal = null,
  } = {}) {
    if (!host.isPlugin) { view.toast(t('toast.webNoHost')); return 'failed'; }
    const before = new Set(state.packages.map((p) => p.id));
    const vt = view.getState();
    const targetName = vt.target || state.target;
    view.setProgress(2, t('progress.autoPull'));
    logger.info(t('log.autoStart'));

    let pulled = false;
    try {
      pulled = host.platform === 'pt'
        ? await pullFromPt(readPtExportOptions() || { moduleIds: [], includeSecrets: false }, { autoFlow: true })
        : await pullFromHost(FULL_SELECTION, false, { autoFlow: true });
    } catch (err) {
      logger.error(t('log.autoPullFailed', { msg: err?.message || err }));
      return 'failed';
    }
    if (!pulled) {
      logger.warn(t('log.autoPullFailed', { msg: 'pull-returned-false' }));
      return 'failed';
    }
    await syncPackages();
    const autoImport = state.packages
      .filter((p) => p.zone === 'import' && p.autoFlow === 'pull' && !before.has(p.id))
      .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))[0];
    if (!autoImport) {
      logger.warn(t('log.autoNoImport'));
      return 'failed';
    }
    logger.info(t('log.autoPulled', { name: autoImport.name }));

    view.setProgress(20, t('progress.autoGenerate'));
    let status = 'failed';
    try {
      status = await executeGenerate({
        packages: [autoImport],
        target: targetName,
        splitMb: vt.splitMb,
        filenameTemplate: vt.filenameTemplate,
        autoFlow: true,
      });
    } catch (err) {
      logger.error(t('log.autoGenerateFailed', { msg: err?.message || err }));
      return 'failed';
    }
    if (status !== 'done') return status === 'aborted' ? 'aborted' : 'failed';
    const exportIds = lastCreatedIds.slice();
    if (!exportIds.length) {
      logger.warn(t('log.autoGenerateFailed', { msg: 'no-export' }));
      return 'failed';
    }

    // 复用「生成导出包后删除导出区里的包」：开启则生成后立刻删自动导入包。
    if (settings.deleteAfterExport) {
      await removePackages([autoImport.id]);
      logger.info(t('log.autoImportDeleted', { name: autoImport.name }));
    }

    view.setProgress(60, t('progress.autoUpload'));
    const result = await backupSelectedToCloud({
      provider, config, mode, setName, retention, signal, ids: exportIds,
    });
    if (!result?.ok) {
      logger.warn(t('log.autoUploadFailed', { msg: result?.reason || (result?.aborted ? 'aborted' : 'unknown') }));
      return result?.aborted ? 'aborted' : 'failed';
    }

    if (settings.autoDeleteBackupPacks !== false) {
      const autoIds = [...new Set([...exportIds, autoImport.id])]
        .filter((id) => state.packages.some((p) => p.id === id));
      if (autoIds.length) {
        await removePackages(autoIds);
        logger.info(t('log.autoPacksDeleted', { n: autoIds.length }));
      }
    }
    view.setProgress(100, t('progress.autoDone'));
    logger.success(t('log.autoDone'));
    return 'done';
  }

  /** 真正执行一次生成；返回 `done|paused|aborted|empty`，失败抛错由队列记 failed。 */
  async function executeGenerate({ packages, merge = false, target, splitMb, filenameTemplate, autoFlow = false }) {
    if (!packages?.length) { view.toast(t('toast.selectExportFirst')); return 'empty'; }
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
        if (outcome.paused) return 'paused';
        if (outcome.aborted) return 'aborted';
        if (outcome.report) reports.push(outcome.report);
        const resultBlob = outcome.resultBlob;
        if (!resultBlob) continue;
        if (limit) {
          /* 2026-11-18（分卷内存修复 · 设计稿 4.3）：改**懒描述符**——不再把整个转换产物
             逐条解压进 entries 数组（GB 级包峰值 ≈ 2× 未压缩体积，浏览器可 OOM）。
             传 `{path, size, read}` 让 splitter 决策后才读；reader 存活期覆盖整个 split，
             异常路径 finally 必关。splitter 内部串行 read ⇒ 在飞数据 ≤ 1 个条目。 */
          const reader = await zipIo.openReader(resultBlob);
          try {
            const entries = [];
            for await (const entry of reader.entries()) {
              if (entry.isDirectory) { entry.skip(); continue; }
              entries.push({
                path: entry.fileName,
                size: entry.uncompressedSize,
                read: () => entry.read(),
              });
              entry.skip();
            }
            const split = await splitArchiveEntries(entries, {
              thresholdMB: limit, target: code, handle: 'default-user',
              filenameTemplate: filenameTemplate || DEFAULT_FILENAME_TEMPLATE,
            });
            for (const part of split.parts) {
              created.push({ blob: part.blob, name: part.partName });
            }
          } finally { await reader.close(); }
        } else {
          const name = resolveFilename(filenameTemplate || DEFAULT_FILENAME_TEMPLATE, {
            sourceName: pkg.name, target: code, handle: 'default-user',
            part: 'part1', category: 'all', mode: 'single',
          });
          created.push({ blob: resultBlob, name });
        }
        logger.info(t('log.converted', { name: pkg.name }));
      }
      await deliverCreated(created, code, { autoFlow });
      if (reports.length) view.showReport(reports[reports.length - 1]);
      return 'done';
    } catch (err) {
      logger.error(t('log.convertFailed', { msg: err.message }));
      view.setProgress(0, t('progress.convertFailed'));
      view.toast(t('toast.convertFailed'));
      throw err;
    } finally {
      state.busy = false;
    }
  }

  /**
   * 产物落地：始终写工作区（导出区列表），**不自动下载**；下载是用户在导出区里的显式动作。
   * 是否在下载后删除该包由设置「导出后删除导出区里的包」决定。
   */
  async function deliverCreated(created, layout = 'unknown', { autoFlow = false } = {}) {
    lastCreatedIds = [];
    if (!created.length) { view.setProgress(0, t('toast.convertFailed')); return lastCreatedIds; }
    for (const item of created) {
      const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await saveFile({
        id,
        name: item.name, size: item.blob.size, blob: namedBlob(item.blob, item.name),
        layout, role: 'output', origin: ORIGINS.CONVERTED,
        metadata: { convertedAt: Date.now(), ...(autoFlow ? { autoFlow: 'export' } : {}) },
      });
      lastCreatedIds.push(id);
    }
    await syncPackages();
    view.setProgress(100, t('progress.exportReady'));
    view.toast(t('toast.generated', { n: created.length }));
    view.setZone('export');
    return lastCreatedIds;
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
    const pausedJob = taskQueue.find((job) => job.status === 'paused');
    if (pausedJob) { queueResume(pausedJob.id); return; }
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

  /* ── 连续任务队列：串行执行，可暂停 / 继续 / 中断 / 排序 ── */
  function enqueueTask({
    type = 'task', label = '', run, cancel = null, canPause = true, canAbort = true,
  }) {
    if (typeof run !== 'function') return null;
    const job = {
      id: `q${++taskSeq}`,
      type,
      label: label || t('taskq.title'),
      status: 'queued',
      pct: 0,
      run,
      cancel: typeof cancel === 'function' ? cancel : null,
      canPause: canPause !== false,
      canAbort: canAbort !== false,
      abortRequested: false,
      createdAt: Date.now(),
      startedAt: 0,
      finishedAt: 0,
      detail: '',
      error: '',
      resolve: null,
    };
    job.promise = new Promise((resolve) => { job.resolve = resolve; });
    taskQueue.push(job);
    logger.debug(`[queue] enqueue ${job.id} type=${job.type} label=${job.label}`);
    syncQueue();
    view.toast(t('taskq.added', { label: job.label }));
    logger.info(t('taskq.added', { label: job.label }));
    void pumpQueue();
    return job;
  }

  async function pumpQueue() {
    if (queueBusy) return;
    queueBusy = true;
    try {
      while (taskQueue.length) {
        const job = taskQueue.shift();
        queueCurrent = job;
        job.status = 'running';
        job.pct = 0;
        job.startedAt = Date.now();
        job.finishedAt = 0;
        job.error = '';
        job.controller = new AbortController();
        syncQueue();
        logger.info(t('taskq.started', { label: job.label }));
        let status = 'done';
        try {
          status = await job.run({ signal: job.controller.signal });
        } catch (err) {
          status = 'failed';
          job.error = String(err?.message || err || '');
          logger.error(t('taskq.failedToast', { label: job.label }), err);
        }
        if (job.abortRequested && status !== 'paused') status = 'aborted';
        queueCurrent = null;
        if (status === 'paused') {
          job.status = 'paused';
          taskQueue.unshift(job);
          syncQueue();
          view.toast(t('taskq.pausedToast'));
          break;
        }
        if (status === 'aborted') {
          job.status = 'aborted';
          job.pct = 0;
          job.finishedAt = Date.now();
          rememberFinished(job);
          job.resolve?.({ status: 'aborted' });
          syncQueue();
          view.toast(t('taskq.abortedToast'));
          logger.info(t('taskq.abortedToast'));
          continue;
        }
        if (status === 'failed' || status === 'empty') {
          job.status = 'failed';
          job.finishedAt = Date.now();
          rememberFinished(job);
          job.resolve?.({ status: 'failed' });
          syncQueue();
          continue;
        }
        job.status = 'done';
        job.pct = 100;
        job.finishedAt = Date.now();
        rememberFinished(job);
        job.resolve?.({ status: 'done' });
        syncQueue();
        view.toast(t('taskq.doneToast', { label: job.label }));
        logger.info(t('taskq.doneToast', { label: job.label }));
      }
    } finally {
      queueBusy = false;
      syncQueue();
    }
  }

  function findQueueJob(id) {
    if (queueCurrent?.id === id) return { job: queueCurrent, current: true };
    const index = taskQueue.findIndex((job) => job.id === id);
    if (index >= 0) return { job: taskQueue[index], index, current: false };
    const doneIndex = queueFinished.findIndex((job) => job.id === id);
    return doneIndex >= 0 ? { job: queueFinished[doneIndex], index: doneIndex, current: false, finished: true } : null;
  }

  async function queuePause(id) {
    const hit = findQueueJob(id);
    if (!hit || !hit.current || hit.job.canPause === false) return false;
    const ok = await conversionRunner?.pause?.();
    if (ok) logger.info(t('taskq.pausedToast'));
    return !!ok;
  }

  async function queueAbort(id) {
    const hit = findQueueJob(id);
    if (!hit || hit.job.canAbort === false) return false;
    if (!hit.current) {
      const wasPaused = hit.job.status === 'paused';
      hit.job.status = 'aborted';
      taskQueue.splice(hit.index, 1);
      if (wasPaused) await conversionRunner?.abort?.();
      hit.job.resolve?.({ status: 'aborted' });
      syncQueue();
      return true;
    }
    // 生成任务走转换器的协作式中止；其它长任务走 AbortSignal + 各自的 cancel 钩子。
    if (hit.job.type === 'generate') return !!(await conversionRunner?.abort?.());
    try { hit.job.controller?.abort?.(); } catch { /* 已结束 */ }
    try { hit.job.cancel?.(); } catch { /* 取消钩子失败不阻断标记 */ }
    hit.job.abortRequested = true;
    return true;
  }

  function queueResume(id) {
    const index = taskQueue.findIndex((job) => job.id === id && job.status === 'paused');
    if (index < 0) return false;
    /* 2026-11-18 修复（E2E R9 契约抓到的真 bug）：队列 job 恢复此前**不回填 pendingResume**
       ⇒ job 重跑时 takeResumeFor() 拿到 null，暂停留下的半成品被静默无视、整包重做
       （R7 的「已保留半成品」与实际续传行为自相矛盾）。回填暂停标记，两条恢复路径
       （队列恢复 / 跨重载标记恢复）语义对齐。 */
    if (!pendingResume) {
      const marker = readPausedMarker();
      if (marker && marker.taskId) pendingResume = marker;
    }
    const [job] = taskQueue.splice(index, 1);
    job.status = 'queued';
    taskQueue.unshift(job);
    syncQueue();
    void pumpQueue();
    return true;
  }

  function queueMove(id, delta) {
    const index = taskQueue.findIndex((job) => job.id === id);
    const next = index + Number(delta || 0);
    if (index < 0 || next < 0 || next >= taskQueue.length) return false;
    const [job] = taskQueue.splice(index, 1);
    taskQueue.splice(next, 0, job);
    syncQueue();
    return true;
  }

  function queueRemove(id) {
    const index = taskQueue.findIndex((job) => job.id === id);
    if (index >= 0) { taskQueue.splice(index, 1); syncQueue(); return true; }
    const doneIndex = queueFinished.findIndex((job) => job.id === id);
    if (doneIndex >= 0) { queueFinished.splice(doneIndex, 1); syncQueue(); return true; }
    return false;
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
  async function generateMerged({ packages, target, splitMb, filenameTemplate, autoFlow = false }) {
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
        if (outcome.paused) return 'paused';
        if (outcome.aborted) return 'aborted';
        if (outcome.report) reports.push(outcome.report);
        if (outcome.resultBlob) blobs.push(outcome.resultBlob);
        logger.info(t('log.converted', { name: pkg.name }));
      }
      if (!blobs.length) { view.toast(t('toast.convertFailed')); return 'failed'; }

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
        return 'failed';
      }

      const created = [];
      if (limit) {
        /* 2026-11-18（分卷内存修复）：与单包路径同构——懒描述符 + reader 存活期覆盖 split，
           免整包解压驻留内存。 */
        const reader = await zipIo.openReader(merged.blob);
        try {
          const entries = [];
          for await (const entry of reader.entries()) {
            if (entry.isDirectory) { entry.skip(); continue; }
            entries.push({ path: entry.fileName, size: entry.uncompressedSize, read: () => entry.read() });
            entry.skip();
          }
          const split = await splitArchiveEntries(entries, {
            thresholdMB: limit, target: code, handle: 'default-user',
            filenameTemplate: filenameTemplate || DEFAULT_FILENAME_TEMPLATE,
          });
          for (const part of split.parts) created.push({ blob: part.blob, name: part.partName });
        } finally { await reader.close(); }
      } else {
        const name = resolveFilename(filenameTemplate || DEFAULT_FILENAME_TEMPLATE, {
          sourceName: 'merged', target: code, handle: 'default-user',
          part: 'part1', category: 'all', mode: 'single',
        });
        created.push({ blob: merged.blob, name });
      }
      logger.info(t('log.mergeDone', { n: packages.length, files: merged.fileCount }));
      await deliverCreated(created, code, { autoFlow });
      if (reports.length) view.showReport(reports[reports.length - 1]);
      return 'done';
    } catch (err) {
      logger.error(t('log.convertFailed', { msg: err.message }));
      view.setProgress(0, t('progress.convertFailed'));
      view.toast(t('toast.convertFailed'));
      throw err;
    } finally {
      state.busy = false;
    }
  }

  /**
   * 「从聊天库导出」：纯库模式把库里的聊天产出一个**目标平台数据包**。
   * 产物按「统一出口」走导出区（origin=converted，与普通转换产物同通道；
   * 下载是用户在导出区里的显式动作）。不落导入区当源包——转换产物再当源是双重转换；
   * 目标平台取当前 UI 选择（此前硬编码 st，用户选了 pt 也只会出 ST 布局）。
   */
  async function exportLibrary() {
    try {
      const target = targetCodeOf(view.getState().target);
      const pack = await exportLibraryToPack({ target });
      if (!pack?.ok || !pack.blob) { view.toast(pack?.reason || t('toast.noChats')); return; }
      const name = `library-export-${target}.zip`;
      await saveFile({
        id: `out-lib-${Date.now()}`,
        name, size: pack.blob.size, blob: namedBlob(pack.blob, name),
        layout: target, role: 'output', origin: ORIGINS.CONVERTED,
        metadata: { libraryExport: true, convertedAt: Date.now() },
      });
      await syncPackages();
      view.toast(t('toast.libraryExported'));
      view.setZone('export');
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

  /** 更新日志弹窗：auto=true 显示本次更新摘要；否则显示**从新到旧**的完整提交。 */
  /** 更新日志弹窗：支持本地/云端切换、严格分段懒加载（15条/窗）、从新到旧与从旧到新排序（2026-11-18 用户裁定）。 */
  function openChangelog({ auto = false } = {}) {
    let source = (settings?.gitCloudReadOn) ? 'cloud' : 'local';
    let sortOrder = 'desc';
    let releaseOnly = false;
    let localCommits = fullChangelog();
    let cloudCommits = null;
    let activeCommits = localCommits;
    let currentOffset = 0;
    const PAGE_SIZE = 15;

    /**
     * 渲染更新日志行。
     *
     * SHA 列折叠（2026-11-19 用户实测：日期右侧出现贯穿整屏的竖直空白带）：
     * 内置发布清单 fallback 的条目 `sha` 为空（`changelog.js` 两处），三列网格里
     * 58px 的 SHA 列恒定空白。**按整页判定**而非逐行折叠——逐行折叠会让说明列
     * 左右错位，比空白更难读。判据：本页全部条目都没有 SHA 时整体降为两列。
     */
    function renderRows(items, { showSha = true } = {}) {
      return items.map((entry) => {
        const tags = Array.isArray(entry.tags) && entry.tags.length
          ? entry.tags
          : (entry.release ? [`v${entry.release}`] : []);
        const isRelease = tags.length > 0;
        const hasSha = Boolean(showSha && entry.sha);
        return '<div class="changelog-row' + (isRelease ? ' is-release' : '') + '"'
          + ' data-changelog-release="' + (isRelease ? '1' : '0') + '"'
          + ' data-sha="' + (hasSha ? '1' : '0') + '">'
          + '<span class="changelog-date">' + escapeText(entry.date || '') + '</span>'
          + (hasSha
            ? '<code class="changelog-sha">' + escapeText(entry.sha) + '</code>'
            : '<span class="changelog-sha is-empty" aria-hidden="true"></span>')
          + '<span class="changelog-msg">'
          + (isRelease ? '<span class="changelog-tag">🏷 ' + escapeText(tags.join(' / ')) + '</span>' : '')
          + escapeText(entry.subject || '') + '</span>'
          + '</div>';
      }).join('');
    }

    /** 本页是否存在任何带 SHA 的条目：决定是否保留 SHA 列（避免整列空白）。 */
    function pageHasSha(items) {
      return (items || []).some((entry) => Boolean(entry && entry.sha));
    }

    function buildHeaderHtml() {
      return '<div class="changelog-toolbar">'
        + '<div class="segmented" id="changelog-source-tabs">'
          + '<button type="button" class="seg-btn' + (source === 'local' ? ' active' : '') + '" data-cl-source="local">' + escapeText(t('changelog.sourceLocal')) + '</button>'
          + '<button type="button" class="seg-btn' + (source === 'cloud' ? ' active' : '') + '" data-cl-source="cloud">' + escapeText(t('changelog.sourceCloud')) + '</button>'
        + '</div>'
        + '<button type="button" class="btn" id="changelog-sort-toggle">'
          + escapeText(sortOrder === 'desc' ? t('changelog.sortNewest') : t('changelog.sortOldest'))
        + '</button>'
        + '<label class="check changelog-filter">'
          + '<input type="checkbox" id="changelog-release-only"' + (releaseOnly ? ' checked' : '') + '> '
          + escapeText(t('changelog.releaseOnly'))
        + '</label>'
      + '</div>';
    }

    const initialResult = paginateChangelog(activeCommits, {
      offset: 0, limit: PAGE_SIZE, sortOrder, releaseOnly,
    });
    currentOffset = initialResult.items.length;

    const listHtml = '<div class="changelog-list" id="changelog-list-container">'
      + (renderRows(initialResult.items, { showSha: pageHasSha(activeCommits) }) || '<div class="ext-note">' + escapeText(t('log.empty')) + '</div>')
      + '</div>';
    const moreBtnHtml = '<div id="changelog-more-area" style="text-align:center;margin-top:8px;' + (initialResult.hasMore ? '' : 'display:none') + '">'
      + '<button type="button" class="btn" id="changelog-load-more" style="font-size:11px;padding:3px 14px">'
      + t('changelog.loadMore')
      + '</button>'
      + '</div>';
    const body = '<div class="changelog-modal-wrap">'
      + buildHeaderHtml()
      + listHtml
      + moreBtnHtml
      + '</div>';

    markSeenVersion(APP_VERSION);
    const actionList = [];
    if (auto) {
      const neverLabel = document.createElement('label');
      neverLabel.className = 'check changelog-never-fixed';
      neverLabel.style.marginRight = 'auto';
      neverLabel.style.fontSize = '12px';
      neverLabel.style.display = 'inline-flex';
      neverLabel.style.alignItems = 'center';
      neverLabel.style.gap = '6px';
      neverLabel.innerHTML = '<input type="checkbox" id="changelog-never"> '
        + escapeText(t('changelog.never'));
      actionList.push({ node: neverLabel });
    }
    actionList.push({
      label: t('modal.close'),
      primary: true,
      onClick: () => {
        const never = document.getElementById('changelog-never');
        if (never?.checked) {
          settings.showChangelogOnUpdate = false;
          saveSettings(settings);
          view.applySettings?.(settings);
        }
        view.closeModal();
      },
    });

    view.openModal(
      auto ? t('changelog.updateTitle', { version: APP_VERSION }) : t('changelog.fullTitle'),
      auto ? t('changelog.updateDesc') : t('changelog.fullDesc'),
      [body],
      actionList,
      { hideCloseX: true, bodyClass: 'is-scroll-isolated' },
    );

    function updateListDisplay() {
      const paged = paginateChangelog(activeCommits, {
        offset: 0, limit: PAGE_SIZE, sortOrder, releaseOnly,
      });
      currentOffset = paged.items.length;
      const listEl = document.getElementById('changelog-list-container');
      if (listEl) {
        // dom-injection-guard:allow (renderRows outputs escaped commit data)
        listEl.innerHTML = renderRows(paged.items, { showSha: pageHasSha(activeCommits) }) || ('<div class="ext-note">' + escapeText(t('log.empty')) + '</div>');
      }
      const moreArea = document.getElementById('changelog-more-area');
      if (moreArea) moreArea.style.display = paged.hasMore ? '' : 'none';
      const sortBtn = document.getElementById('changelog-sort-toggle');
      if (sortBtn) {
        sortBtn.textContent = sortOrder === 'desc'
          ? t('changelog.sortNewest')
          : t('changelog.sortOldest');
      }
    }

    async function switchSource(newSource) {
      if (source === newSource && activeCommits) return;
      source = newSource;
      document.querySelectorAll('#changelog-source-tabs [data-cl-source]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.clSource === source);
      });
      const listEl = document.getElementById('changelog-list-container');
      if (source === 'cloud') {
        if (!cloudCommits) {
          if (listEl) listEl.innerHTML = '<div class="ext-note"><i class="fa-solid fa-spinner fa-spin"></i> ' + t('changelog.fetchingCloud') + '</div>';
          try {
            cloudCommits = await fetchCloudCommits({ proxyUrl: settings?.netProxyUrl || '' });
          } catch (err) {
            if (listEl) listEl.innerHTML = '<div class="ext-note" style="color:var(--drop)">' + escapeText(err.message || t('changelog.fetchCloudFailed')) + '</div>';
            return;
          }
        }
        activeCommits = cloudCommits;
      } else {
        activeCommits = localCommits;
      }
      updateListDisplay();
    }

    document.getElementById('changelog-source-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cl-source]');
      if (btn) switchSource(btn.dataset.clSource);
    });

    document.getElementById('changelog-sort-toggle')?.addEventListener('click', () => {
      sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
      updateListDisplay();
    });

    document.getElementById('changelog-release-only')?.addEventListener('change', (e) => {
      releaseOnly = !!e.target.checked;
      updateListDisplay();
    });

    document.getElementById('changelog-load-more')?.addEventListener('click', () => {
      const paged = paginateChangelog(activeCommits, {
        offset: currentOffset, limit: PAGE_SIZE, sortOrder, releaseOnly,
      });
      currentOffset += paged.items.length;
      const listEl = document.getElementById('changelog-list-container');
      if (listEl && paged.items.length) {
        // dom-injection-guard:allow (renderRows outputs escaped commit data)
        listEl.insertAdjacentHTML('beforeend', renderRows(paged.items, { showSha: pageHasSha(activeCommits) }));
      }
      const moreArea = document.getElementById('changelog-more-area');
      if (moreArea) moreArea.style.display = paged.hasMore ? '' : 'none';
    });

    if (source === 'cloud') {
      void switchSource('cloud');
    }
  }

  function maybeShowChangelog() {
    if (!shouldShowChangelog(readSeenVersion(), APP_VERSION, settings.showChangelogOnUpdate)) return;
    setTimeout(() => openChangelog({ auto: true }), 450);
  }

  function openSettings() {
    view.openSettingsView(buildSettingsHtml(settings), {
      onSave: (body) => {
        /* base 传入当前设置：只覆盖对话框里存在的控件，Git 账号 / 安装登记等原样保留。 */
        Object.assign(settings, readSettings(body, settings));
        saveSettings(settings);
        logger.setLevel(settings.logLevel || 'warn');
        view.applySettings?.(settings);
        view.backToWorkbench();
        view.toast(t('settings.saved'));
      },
      onAction: async (name) => {
        if (name === 'changelog') { openChangelog({ auto: false }); return; }
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
              logger.setLevel(settings.logLevel || 'warn');
              view.applySettings?.(settings);
              view.toast(t('settings.dataImport'));
              setTimeout(() => location.reload(), 600);
            } },
          ]);
        }
        if (name === 'plugin-git-clean') {
          const ok = await confirmDialog(t('extmgr.gitCleanTitle') + '？\n' + t('extmgr.gitCleanSettingsDesc'));
          if (!ok) return;
          const cur = loadSettings();
          cur.gitInstalls = [];
          cur.gitAutoUpdateRules = {};
          saveSettings(cur);
          Object.assign(settings, cur);
          view.applySettings?.(cur);
          view.toast(t('extmgr.gitCleanDone'));
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
    peerGenerate: () => lanPanel?.peerGenerate(),
    peerConnect: (code) => lanPanel?.peerConnect(code),
    peerDisconnect: () => lanPanel?.peerDisconnect(),
    peerSend: () => lanPanel?.peerSend(),
    setMode: (mode) => lanPanel?.setMode(mode),
  };

  const view = createWorkbenchView({
    qr,
    actions: {
      onProgress: setQueueProgress,
      activity: (opts) => recordActivity(opts),
      fetch: enqueueHostPull,
      generate,
      restore: enqueueRestore,
      copyBack,
      deleteSelected,
      download: downloadSelected,
      libraryExport: exportLibrary,
      taskPause: () => conversionRunner?.pause(),
      taskResume: resumePaused,
      taskAbort: () => conversionRunner?.abort(),
      queuePause: (id) => queuePause(id),
      queueResume: (id) => queueResume(id),
      queueAbort: (id) => queueAbort(id),
      queueMove: (id, delta) => queueMove(id, delta),
      queueRemove: (id) => queueRemove(id),
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
      /* 包内清理（2026-11-15 用户裁定：**只做减法**）——从数据包移除选中的扩展
         （实体条目 + 私有清单条目），重建 zip 并原位替换存储记录。
         keepManifest=true 时为「转成清单」：删实体、留清单（无清单文件时用包清单缓存补建）。 */
      prunePackageExtensions: async (pkgId, names, opts = {}) => {
        const pkg = pkgById(pkgId);
        if (!pkg) throw new Error('package not found');
        const blob = await blobOf(pkg);
        if (!blob) throw new Error('package blob not found');
        const res = await prunePackageExtensions(blob, names, {
          keepManifest: !!opts.keepManifest,
          manifestSeed: Array.isArray(pkg.extManifest) ? pkg.extManifest : [],
        });
        if (res.blob === blob || (!res.removedFiles && !res.removedManifest)) {
          return { removedFiles: 0, removedManifest: 0 };
        }
        const record = await getFile(pkgId);
        await deleteFile(pkgId);
        await saveFile({
          id: pkgId,
          name: record?.name || pkg.name,
          size: res.blob.size,
          blob: res.blob,
          layout: record?.layout || pkg.declaredLayout || pkg.host,
          role: record?.role || 'source',
          origin: record?.origin,
          group: record?.group ?? null,
          metadata: { ...(record?.metadata || {}), prunedExtensions: Date.now() },
        });
        pkg.blob = res.blob;
        pkg.mb = res.blob.size / (1024 * 1024);
        pkg.size = fmtMB(pkg.mb);
        if (res.manifest) pkg.extManifest = res.manifest.extensions || [];
        else pkg.extManifest = [];
        state.nodesById.delete(pkgId);
        for (const key of [...state.planCache.keys()]) {
          if (key.startsWith(pkgId + '::')) state.planCache.delete(key);
        }
        await syncPackages();
        logger.info(t('extmgr.pkgPrunedLog', { files: res.removedFiles, manifest: res.removedManifest }));
        return { removedFiles: res.removedFiles, removedManifest: res.removedManifest };
      },
      installExtensions: async (entries) => (host.platform === 'standalone'
        ? installExtensionsIntoPackage(entries, {
          onEntry: (entry) => view.extEntryUpdate(entry),
          onLog: (line) => view.extLogAppend(line),
        })
        : installExtensionBatch(entries, {
          onEntry: (entry) => view.extEntryUpdate(entry),
          onLog: (line) => view.extLogAppend(line),
        })),
      listHostExtensions: () => listHostExtensions(host.platform),
      hostIdentity: () => (!host.isPlugin ? Promise.resolve({ ok: false, reason: 'standalone' }) : readHostIdentity()),
      listServerPlugins: () => (!host.isPlugin ? Promise.resolve({ ok: false, plugins: [], reason: 'standalone' }) : listServerPlugins()),
      /* 服务端插件管理（管理员；Luker users-admin 端点，2026-11-15 用户裁定接入） */
      serverPluginUpdate: (dir) => serverPluginUpdate(dir),
      serverPluginDelete: (dir) => serverPluginDelete(dir),
      serverPluginInstallDeps: (dir) => serverPluginInstallDeps(dir),
      serverPluginInstall: (url) => serverPluginInstall(url),
      hostExtensionGit: (name, opts) => readHostExtensionGit(name, opts),
      packageGit: (pkgId, name) => readPackageGit(pkgId, name),
      deleteExtension: (name, isGlobal) => deleteExtensionViaHost(name, isGlobal),
      updateExtension: (name, isGlobal) => updateExtensionViaHost(name, isGlobal),
      moveExtension: (name, source, destination) => moveExtensionViaHost(name, source, destination),
      backupSelectedToCloud: enqueueCloudBackup,
      autoBackup: enqueueAutoBackup,
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
      /**
       * 体检（用户裁定入口）：包卡按钮 → blobOf(pkg) → inspectPackage → 模态。
       * 外部文件 → 独立 input，不调用 saveFile、不入库。
       */
      inspectPackage: async (id) => {
        const pkg = pkgById(id);
        if (!pkg) return;
        const blob = await blobOf(pkg);
        if (!blob) { view.toast(t('inspect.readFailed')); return; }
        const targetLayout = targetCodeOf(view.getState().target);
        try {
          const report = await inspectPackage(blob, { targetLayout });
          view.showInspectReport(report);
        } catch (err) {
          logger.error(`${t('inspect.readFailed')}: ${err?.message || err}`);
          view.toast(t('inspect.readFailed'));
        }
      },
      inspectFile: () => root.querySelector('#file-input-inspect')?.click(),
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
        return ensurePlan(id).then((plan) => {
          if (plan && view.getState().source?.pkgId === id) view.setActivePackage(id);
          return plan;
        });
      },
      onTargetChange: (name) => {
        const active = state.packages.find((p) => view.getState().source?.pkgId === p.id);
        if (active) ensurePlan(active.id, name).then(() => view.setActivePackage(active.id));
      },
      onTutorialExit: () => { void loadRealData(); maybeShowChangelog(); },
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
    // 透传完整 entry，保留 detail / id / timeMs，导出后仍可精确溯源。第三参数对旧视图向后兼容（可选）。
    view.pushLog(entry.level, entry.message, { id: entry.id, timeMs: entry.timeMs, detail: entry.detail });
  });

  view.setHost(hostKey, host.isPlugin ? 'plugin' : 'web');
  if (!host.isPlugin && settings.webTheme) {
    try { applyWebTheme(settings.webTheme); } catch { /* 忽略 */ }
  }
  view.applySettings?.(settings);
  modalRefreshHook = () => {
    Object.assign(settings, loadSettings());
    if (!host.isPlugin && settings.webTheme) {
      try { applyWebTheme(settings.webTheme); } catch { /* 忽略 */ }
    }
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

  /* 外部文件体检：只读本地 zip，绝不入库（不调用 saveFile / importFiles）。 */
  root.querySelector('#file-input-inspect')?.addEventListener('change', async (event) => {
    const file = (event.target.files || [])[0] || null;
    event.target.value = '';
    if (!file) return;
    const panel = view.getInspectPanel?.();
    panel?.setBusy?.();
    try {
      const targetLayout = targetCodeOf(view.getState().target);
      const report = await inspectPackage(file, { targetLayout });
      view.showInspectReport(report);
      panel?.render?.(report);
    } catch (err) {
      logger.error(`${t('inspect.readFailed')}: ${err?.message || err}`);
      panel?.setError?.(t('inspect.readFailed'));
      view.toast(t('inspect.readFailed'));
    }
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

  // 检查是否有在刷新前暂存的待安装扩展清单（完全自动化）
  const pendingManifestRaw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('stpt.pendingManifestInstall') : null;
  if (pendingManifestRaw) {
    try {
      sessionStorage.removeItem('stpt.pendingManifestInstall');
      const pending = JSON.parse(pendingManifestRaw);
      if (Array.isArray(pending?.items) && pending.items.length) {
        setTimeout(() => {
          view.openExtensionManager(pending.items, { autoInstall: !!pending.auto });
        }, 500);
      }
    } catch { /* 忽略 */ }
  }

  // 教程模式首帧优先：先弹蒙层，真实读库与宿主配额推迟到退出教程再补（2026-11-12 用户裁定）。
  if (settings.autoTutorial) {
    try {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => view.openTutorial());
      else view.openTutorial();
    } catch { /* 隐私模式 */ }
  }
  async function refreshStorageQuota() {    // 两条读数彼此独立：任一失败都不能拖垮另一条。
    const [browser, hostQuota] = await Promise.all([
      Promise.resolve().then(() => readBrowserQuota()).catch(() => null),
      host.platform === 'luker'
        ? Promise.resolve().then(() => readHostStorageQuota()).catch(() => null)
        : Promise.resolve(null),
    ]);
    view.setStorage({ browser, host: hostQuota });
  }
  /** 真实数据装载：教程演示期间整体推迟，退出教程后由 onTutorialExit 触发；只装一次。 */
  let realDataLoaded = false;
  async function loadRealData() {
    if (realDataLoaded) return;
    realDataLoaded = true;
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
    await refreshStorageQuota();
  }
  if (!settings.autoTutorial) {
    await loadRealData();
    maybeShowChangelog();
  }
  if (typeof document !== 'undefined') {
    // 读数必须随数据变化：操作后由 syncPackages 触发，另有低频兜底刷新。
    setInterval(() => { if (!document.hidden) refreshStorageQuota(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStorageQuota(); });
  }
  view.setProgress(0, t('progress.ready'));
  logger.info(t('log.workbenchReady', { host: host.isPlugin ? t('header.plugin', { host: HOST_LABEL[host.platform] || t('host.fallback') }) : t('header.web') }));
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
