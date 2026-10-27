/**
 * 数据包转运 · 控制器（2026-10-27 全面重写）
 *
 * 界面：`src/ui/workbench-view.js` = UI 定稿 demo 的原样搬运。
 * 本文件只做三件事：宿主探测、包仓库读写、把真实动作接到视图的 `actions`。
 */

import { runConversionTask, runPlanTask } from './src/core/worker-client.js';
import { logger } from './src/core/logger.js';
import { zipIo } from './src/core/zip-io.js';
import { splitArchiveEntries } from './src/core/splitter.js';
import { mergeConvertedBlobs } from './src/core/merge-packages.js';
import { probeDirectCapability } from './src/core/lan-transfer.js';
import {
  ORIGINS, isStorageSupported, saveFile, getFile, deleteFile, listStoredFiles,
} from './src/storage/db.js';
import { buildChartTree, fmtMB, splitLimitOf } from './src/core/chart-model.js';
import { DEFAULT_FILENAME_TEMPLATE, TARGET_PLATFORMS, resolveFilename, namedBlob } from './src/core/naming.js';
import { trustedStaticMarkup } from './src/ui/escape.js';
import { getWorkbenchHtml } from './src/ui/workbench-template.js';
import { createWorkbenchView } from './src/ui/workbench-view.js';
import {
  detectHost, hostLayoutCode, fetchHostBackup, restoreToHost, restoreToLuker,
  confirmDialog, mountExtensionRowButton, closeHostExtensionSurface,
  uploadUserFile, userFilesSupported, sanitizeUserFileName, verifyUserFiles, deleteUserFile,
  isLanSyncAvailable, listLanSyncPeers, triggerLanSyncPull,
} from './src/ui/host-bridge.js';
import { packPrivateContainer } from './src/core/private-container.js';
import { loadPrivateFiles, addPrivateFile, removePrivateFile } from './src/ui/private-files-store.js';
import { ORIGIN_ZONE, zoneOfOrigin, copyBackRecord } from './src/core/zone-model.js';
import { exportLibraryToPack, importRestoredChatsIntoLibrary } from './src/ui/chat-store-inject.js';
import { mountLanTransferPanel } from './src/ui/lan-transfer-panel.js';
import { qr } from './src/ui/qr.js';
import { buildSettingsHtml, readSettings } from './src/ui/settings-panel.js';
import { loadSettings, saveSettings } from './src/ui/settings-store.js';
import { applyI18n } from './src/i18n/dom.js';
import { getLocale, onLocaleChange, setLocale, t } from './src/i18n/index.js';
import { probeChatStore } from './src/ui/chat-store-bridge.js';
import { mountDebugProbe } from './src/app/task-runtime.js';

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

function ensureConverterModal() {
  let overlay = document.getElementById('st-converter-modal-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'st-converter-modal-overlay';
  const app = document.createElement('div');
  app.className = 'app-container';
  app.id = 'app';
  app.innerHTML = trustedStaticMarkup(getWorkbenchHtml({ isModal: true }));
  applyI18n(app);
  overlay.appendChild(app);
  document.body.appendChild(overlay); // dom-scope:allow 自绘全屏模态必须挂 body
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.style.display = 'none'; });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none';
  });
  if (!initialized) { initialized = true; main(app); }
  return overlay;
}

export function openConverterModal() {
  if (typeof document === 'undefined') return;
  ensureConverterModal().style.display = 'flex';
}

async function main(root) {
  const host = detectHost();
  const hostKey = host.isPlugin ? (HOST_CODE[host.platform] || 'st') : 'st';
  root.dataset.host = hostKey;

  const settings = loadSettings();

  const state = {
    packages: [],
    nodesById: new Map(),
    extensionsById: new Map(),
    layoutById: new Map(),
    planCache: new Map(),
    busy: false,
  };

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
    const layout = state.layoutById.get(record.id) || record.layout || 'unknown';
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
  }

  async function ensurePlan(pkgId, targetName = null) {
    const pkg = pkgById(pkgId);
    if (!pkg) return null;
    const code = targetCodeOf(targetName || view.getState().target);
    const key = `${pkgId}::${code}`;
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
      if (plan.sourceLayout) state.layoutById.set(pkgId, plan.sourceLayout);
      const live = pkgById(pkgId);
      if (live) {
        live.nodes = tree;
        live.extensions = plan.extensions || [];
        live.host = HOST_CODE[plan.sourceLayout] || live.host;
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
    if (newest) { await ensurePlan(newest.id); view.setActivePackage(newest.id); }
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

  async function downloadSelected(ids) {
    for (const id of ids) {
      const pkg = pkgById(id);
      const blob = await blobOf(pkg);
      if (!blob) continue;
      downloadBlob(blob, pkg.name);
    }
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
    for (const id of ids) {
      try { await deleteFile(id); } catch { /* 已不存在 */ }
      state.nodesById.delete(id);
      state.layoutById.delete(id);
    }
    await syncPackages();
    view.toast(t('toast.deleted'));
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
    const ok = await confirmDialog(t('modal.confirmRestore', { name: targets[0].name }));
    if (!ok) return;
    if (state.busy) return;
    state.busy = true;
    try {
      view.setProgress(25, t('progress.restoring'));
      const blob = await blobOf(targets[0]);
      const result = host.platform === 'luker'
        ? await restoreToLuker(blob, {})
        : await restoreToHost(blob, { mode: 'merge', platform: host.platform });
      if (result && result.nothingRestored) throw new Error(t('error.nothingRestored'));
      try { await importRestoredChatsIntoLibrary(blob); } catch { /* 纯库模式可选 */ }
      view.setProgress(100, t('progress.restoreDone'));
      logger.info(t('log.restored', { name: targets[0].name }));
      view.toast(t('toast.restoreDone'));
    } catch (err) {
      logger.error(t('log.restoreFailed', { msg: err.message }));
      view.setProgress(0, t('progress.restoreFailed'));
    } finally {
      state.busy = false;
    }
  }

  async function fetchFromHost() {
    if (!host.isPlugin) { view.toast(t('toast.webNoHost')); return; }
    if (state.busy) return;
    if (settings.trafficPrompt) {
      view.confirmTraffic(() => fetchFromHostConfirmed(), {
        enabled: true,
        onNever: () => { settings.trafficPrompt = false; saveSettings(settings); },
      });
      return;
    }
    await fetchFromHostConfirmed();
  }

  async function fetchFromHostConfirmed() {
    if (state.busy) return;
    state.busy = true;
    try {
      view.setProgress(5, t('progress.hostRequest'));
      const blob = await fetchHostBackup(host.platform, null, {
        onPhase: (phase, received, total) => {
          if (phase === 'host-generating') view.setProgress(12, t('progress.hostPacking'));
          else if (phase === 'transferring') {
            const pct = total > 0 ? 15 + Math.round((received / total) * 20) : 20;
            view.setProgress(pct, t('progress.receiving', { size: (received / 1048576).toFixed(1) }));
          }
        },
      });
      const name = `${HOST_LABEL[host.platform] || 'Host'}_host-export_${Date.now()}.zip`;
      const id = `pkg-${Date.now()}`;
      await saveFile({
        id, name, size: blob.size, blob: namedBlob(blob, name),
        layout: hostLayoutCode(host.platform), role: 'source',
        origin: ORIGINS.HOST_EXPORT, metadata: { fetchedAt: Date.now() },
      });
      state.layoutById.set(id, hostLayoutCode(host.platform));
      await syncPackages();
      await ensurePlan(id);
      view.setActivePackage(id);
      view.setProgress(100, t('progress.hostFetched'));
      view.toast(t('toast.hostFetched'));
    } catch (err) {
      logger.error(t('log.hostFetchFailed', { msg: err.message }));
      view.setProgress(0, t('progress.hostFetchFailed'));
    } finally {
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
    try {
      for (const pkg of packages) {
        const blob = await blobOf(pkg);
        if (!blob) continue;
        const cached = await ensurePlan(pkg.id, target);
        if (!cached) continue;
        const excluded = view.getExcludedPaths(pkg);
        const exportOptions = view.getExportOptions(pkg);
        view.setProgress(3, t('progress.converting', { name: pkg.name }));
        const { resultBlob } = await runConversionTask({
          source: blob,
          target: code,
          options: {
            excludedPaths: excluded,
            ...exportOptions,
          },
          onProgress: (current, total, filename) => {
            const pct = total ? Math.round((current / total) * 92) : 10;
            view.setProgress(pct, t('progress.convertingN', { current, total, file: filename ? ` · ${filename}` : '' }));
          },
        });
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
    } catch (err) {
      logger.error(t('log.convertFailed', { msg: err.message }));
      view.setProgress(0, t('progress.convertFailed'));
      view.toast(t('toast.convertFailed'));
    } finally {
      state.busy = false;
    }
  }

  /** 产物落地：按设置留在导出区，或直接下载。合并模式与非合并模式共用。 */
  async function deliverCreated(created, layout = 'unknown') {
    if (settings.keepExport) {
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
      if (created.length) view.setZone('export');
    } else {
      for (const item of created) downloadBlob(item.blob, item.name);
      view.setProgress(100, t('progress.exportDownloaded'));
      view.toast(t('toast.generatedDownloaded', { n: created.length }));
    }
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
    try {
      for (const pkg of packages) {
        const blob = await blobOf(pkg);
        if (!blob) continue;
        if (!(await ensurePlan(pkg.id, target))) continue;
        view.setProgress(3, t('progress.converting', { name: pkg.name }));
        const { resultBlob } = await runConversionTask({
          source: blob,
          target: code,
          options: { excludedPaths: plan.excludedByPkg[pkg.id], ...plan.optionsByPkg[pkg.id] },
          onProgress: (current, total, filename) => {
            const pct = total ? Math.round((current / total) * 50) : 10;
            view.setProgress(pct, t('progress.convertingN', { current, total, file: filename ? ` · ${filename}` : '' }));
          },
        });
        if (resultBlob) blobs.push(resultBlob);
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
    } catch (err) {
      logger.error(t('log.convertFailed', { msg: err.message }));
      view.setProgress(0, t('progress.convertFailed'));
      view.toast(t('toast.convertFailed'));
    } finally {
      state.busy = false;
    }
  }

  /** 合并上传：多个导入包原样合并成一个新的导入包（不改内容，只并条目）。 */
  async function mergeUpload(packages) {
    if (state.busy) return;
    if (!packages || packages.length < 2) { view.toast(t('lan.atLeastTwo')); return; }
    state.busy = true;
    try {
      const blobs = [];
      for (const pkg of packages) {
        const blob = await blobOf(pkg);
        if (blob) blobs.push(blob);
      }
      if (blobs.length < 2) { view.toast(t('toast.convertFailed')); return; }
      view.setProgress(20, t('progress.merging'));
      const merged = await mergeConvertedBlobs(blobs, { compressionLevel: 5 });
      if (!merged.ok) {
        view.setProgress(0, t('progress.convertFailed'));
        showMergeConflicts(merged.conflicts);
        return;
      }
      const id = `merged-${Date.now()}`;
      const name = `merged_${packages.length}packs.zip`;
      await saveFile({
        id, name, size: merged.blob.size, blob: namedBlob(merged.blob, name),
        layout: 'unknown', role: 'source', origin: ORIGINS.UPLOAD,
        metadata: { mergedFrom: packages.map((p) => p.id) },
      });
      await syncPackages();
      await ensurePlan(id);
      view.setProgress(100, t('progress.exportReady'));
      view.toast(t('toast.mergeDone', { n: packages.length }));
      logger.info(t('log.mergeUpload', { n: packages.length, files: merged.fileCount }));
    } catch (err) {
      logger.error(t('log.mergeUploadFailed', { msg: err.message }));
      view.setProgress(0, t('progress.convertFailed'));
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

  function openSettings() {
    view.openModal(t('settings.title'), '', [buildSettingsHtml(settings)], [
      { label: t('modal.close'), onClick: () => view.closeModal() },
      {
        label: t('modal.save'),
        primary: true,
        onClick: () => {
          Object.assign(settings, readSettings(root));
          saveSettings(settings);
          view.closeModal();
          view.toast(t('settings.saved'));
        },
      },
    ]);
  }

  const lanActions = {
    generate: () => lanPanel?.generate(),
    applyAnswer: (code) => lanPanel?.applyAnswer(code),
    acceptOffer: (code) => lanPanel?.acceptOffer(code),
    retry: () => lanPanel?.retry(),
    cancel: () => lanPanel?.cancel(),
    abandon: () => lanPanel?.abandon(),
    swap: () => lanPanel?.swap(),
  };

  /** 刷新互传矩阵的通道可用性（原生通道只在 Luker 上探测）。 */
  async function refreshTransferChannels() {
    let peers = [];
    if (hostKey === 'luker' && await isLanSyncAvailable()) {
      peers = await listLanSyncPeers();
    }
    view.setTransfer({
      host: hostKey,
      peers,
      webRtcAvailable: probeDirectCapability().direct,
    });
  }

  const view = createWorkbenchView({
    qr,
    actions: {
      fetch: fetchFromHost,
      generate,
      mergeUpload,
      restore: restoreSelected,
      copyBack,
      deleteSelected,
      download: downloadSelected,
      libraryExport: exportLibrary,
      lan: lanActions,
      transfer: {
        pull: async (peerId) => {
          const result = await triggerLanSyncPull(peerId);
          if (!result.ok) {
            logger.error(t('log.lanPullFailed', { msg: result.detail || result.reason }));
            return result;
          }
          logger.info(t('log.lanPullDone'));
          return result;
        },
        swap: () => lanPanel?.swap(),
      },
      settings: openSettings,
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
      onActivePackage: (id) => { ensurePlan(id).then(() => view.setActivePackage(id)); },
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

  logger.subscribe((entry) => {
    view.pushLog(entry.level === 'SUCCESS' ? 'INFO' : entry.level, entry.message);
  });

  view.setHost(hostKey, host.isPlugin ? 'plugin' : 'web');
  view.setPrivateFiles(loadPrivateFiles());
  void refreshTransferChannels();
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

  await syncPackages();
  view.setStorage({ browser: await readBrowserQuota(), host: null });
  view.setProgress(0, t('progress.ready'));
  logger.info(t('log.workbenchReady', { host: host.isPlugin ? t('header.plugin', { host: HOST_LABEL[host.platform] || t('host.fallback') }) : t('header.web') }));
  try {
    if (settings.autoTutorial && !sessionStorage.getItem('st-pack-transfer:tutorial-seen')) {
      sessionStorage.setItem('st-pack-transfer:tutorial-seen', '1');
      setTimeout(() => view.openTutorial(), 300);
    }
  } catch { /* 隐私模式 */ }
}

/** 浏览器真实配额（字节）。不可用时返回 null，界面显示「未提供读数」。 */
async function readBrowserQuota() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return quota > 0 ? { used: usage || 0, total: quota } : null;
  } catch {
    return null;
  }
}

function bootstrap() {
  mountDebugProbe();
  const host = detectHost();
  if (host.isPlugin) {
    ensureConverterModal();
    mountExtensionRowButton(() => {
      closeHostExtensionSurface();
      openConverterModal();
    });
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
