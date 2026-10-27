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
} from './src/ui/host-bridge.js';
import { exportLibraryToPack, importRestoredChatsIntoLibrary } from './src/ui/chat-store-inject.js';
import { mountLanTransferPanel } from './src/ui/lan-transfer-panel.js';
import { qr } from './src/ui/qr.js';
import { buildSettingsHtml, readSettings } from './src/ui/settings-panel.js';
import { loadSettings, saveSettings } from './src/ui/settings-store.js';
import { probeChatStore } from './src/ui/chat-store-bridge.js';
import { mountDebugProbe } from './src/app/task-runtime.js';

export {
  TASK_KINDS, TASK_PREFIX, taskKindOf, partialNameFor, hasRoomForPartial,
  persistPartial, createCheckpointThrottle, resumedNote, convertExitForAbort,
  attachConversionProgress, runBatchItems, batchResumeVerdict, seedEntriesFor,
} from './src/app/task-runtime.js';
export { mountDebugProbe };

const ZONE_OF_ORIGIN = {
  [ORIGINS.UPLOAD]: 'import',
  [ORIGINS.HOST_EXPORT]: 'import',
  [ORIGINS.SOURCE_BACKUP]: 'import',
  [ORIGINS.LAN]: 'import',
  [ORIGINS.CONVERTED]: 'export',
  [ORIGINS.DELTA]: 'export',
  [ORIGINS.SPLIT_PART]: 'export',
};

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

  /** 打包选项暂为内部默认；任务 2 会改为从图表派生。设置页只持久化 3 个行为开关。 */
  const EXPORT_DEFAULTS = {
    compression: '5',
    extensionMode: 'full',
    gitMode: 'keep',
    keepDev: false,
    includeBackups: false,
    includeCache: false,
    includePrivate: false,
    pruneBuiltin: true,
  };
  const settings = { ...EXPORT_DEFAULTS, ...loadSettings() };

  const state = {
    packages: [],
    nodesById: new Map(),
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
    const zone = ZONE_OF_ORIGIN[record.origin] || 'import';
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
      origin: record.origin === ORIGINS.LAN ? '远程导入'
        : record.origin === ORIGINS.SPLIT_PART ? '分卷'
          : zone === 'export' ? '导出副本'
            : '本地导入',
      readonly: zone === 'export',
      unrecognized: layout === 'unknown',
      split: 0,
      nodes: state.nodesById.get(record.id) || [],
      blob: null,
    };
  }

  async function syncPackages() {
    if (!isStorageSupported()) { state.packages = []; view.setPackages([]); return; }
    try {
      const records = await listStoredFiles();
      state.packages = records.filter((r) => ZONE_OF_ORIGIN[r.origin]).map(toPackage);
      view.setPackages(state.packages);
    } catch (err) {
      logger.warn(`读取工作区失败: ${err.message}`);
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
    if (!blob) { logger.warn(`扫描跳过：${pkg.name} 的字节不在工作区`); return null; }
    view.setProgress(6, `扫描中 · ${pkg.name}`);
    logger.info(`扫描开始：${pkg.name}（${(blob.size / 1048576).toFixed(1)} MB → ${code.toUpperCase()}）`);
    try {
      const plan = await runPlanTask({
        source: blob,
        target: code,
        options: {
          selection: {},
          excludedPaths: new Set(),
          includeCache: settings.includeCache,
          includeBackups: settings.includeBackups,
          includeAppPrivate: settings.includePrivate,
          pruneBuiltinAssets: settings.pruneBuiltin,
          keepDevFiles: settings.keepDev,
          extensionMode: settings.extensionMode,
          gitMode: settings.gitMode,
        },
      });
      const tree = buildChartTree(plan);
      state.planCache.set(key, { plan, tree, target: code });
      state.nodesById.set(pkgId, tree);
      if (plan.sourceLayout) state.layoutById.set(pkgId, plan.sourceLayout);
      const live = pkgById(pkgId);
      if (live) {
        live.nodes = tree;
        live.host = HOST_CODE[plan.sourceLayout] || live.host;
        live.unrecognized = plan.totalSourceFiles === 0;
      }
      view.setPackages(state.packages);
      view.setProgress(0, '扫描完成');
      logger.info(`扫描完成：${pkg.name} · ${plan.totalSourceFiles} 个文件 · ${tree.length} 个分组`);
      return state.planCache.get(key);
    } catch (err) {
      logger.error(`扫描失败：${pkg.name} · ${err.message}`);
      view.setProgress(0, '扫描失败');
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
    if (!isStorageSupported()) { view.toast('当前浏览器不支持本地存储'); return; }
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
      logger.info(`${remote ? '已接收' : '已导入'} ${name}`);
    }
    await syncPackages();
    if (remote) view.setZone('import');
    const newest = state.packages.filter((p) => p.zone === 'import').sort((a, b) => b.ts - a.ts)[0];
    if (newest) { await ensurePlan(newest.id); view.setActivePackage(newest.id); }
    view.toast(remote ? `已接收 ${list.length} 个包` : `已导入 ${list.length} 个包`);
  }

  /** 局域网发送源：导入区当前勾选的包（控制器拿到的已是可 slice 的 File）。 */
  async function getSendTargets() {
    const selected = view.getState().selectedPkgs;
    const targets = [];
    for (const id of selected) {
      const pkg = state.packages.find((p) => p.id === id);
      if (!pkg || pkg.zone !== 'import') continue;
      const blob = await blobOf(pkg);
      if (!blob) { logger.warn(`发送跳过：${pkg.name} 的字节不在工作区`); continue; }
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
      await saveFile({
        id: `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: pkg.name, size: blob.size, blob, role: 'source',
        origin: ORIGINS.UPLOAD, metadata: { copiedFrom: id },
      });
      count += 1;
    }
    await syncPackages();
    view.toast(`已复制 ${count} 个包回导入区`);
  }

  async function deleteSelected(ids) {
    if (!ids.length) { view.toast('先选择要删除的包'); return; }
    const ok = await confirmDialog(`确定删除选中的 ${ids.length} 个包吗？此操作不可撤销。`);
    if (!ok) return;
    for (const id of ids) {
      try { await deleteFile(id); } catch { /* 已不存在 */ }
      state.nodesById.delete(id);
      state.layoutById.delete(id);
    }
    await syncPackages();
    view.toast('已删除');
  }

  async function restoreSelected(ids) {
    if (!host.isPlugin) { view.toast('只有插件形态可以回传宿主'); return; }
    const targets = ids.map(pkgById).filter((p) => p && p.zone === 'export');
    if (!targets.length) { view.toast('先选择一个导出包'); return; }
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
    const ok = await confirmDialog(`将 ${targets[0].name} 恢复到当前宿主？覆盖前请确认已备份。`);
    if (!ok) return;
    if (state.busy) return;
    state.busy = true;
    try {
      view.setProgress(25, '正在回传宿主...');
      const blob = await blobOf(targets[0]);
      const result = host.platform === 'luker'
        ? await restoreToLuker(blob, {})
        : await restoreToHost(blob, { mode: 'merge', platform: host.platform });
      if (result && result.nothingRestored) throw new Error('宿主未写入任何条目');
      try { await importRestoredChatsIntoLibrary(blob); } catch { /* 纯库模式可选 */ }
      view.setProgress(100, '恢复完成');
      logger.info(`已恢复 ${targets[0].name}`);
      view.toast('恢复完成');
    } catch (err) {
      logger.error(`恢复失败：${err.message}`);
      view.setProgress(0, '恢复失败');
    } finally {
      state.busy = false;
    }
  }

  async function fetchFromHost() {
    if (!host.isPlugin) { view.toast('独立 Web 模式没有宿主数据源'); return; }
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
      view.setProgress(5, '正在请求宿主打包...');
      const blob = await fetchHostBackup(host.platform, null, {
        onPhase: (phase, received, total) => {
          if (phase === 'host-generating') view.setProgress(12, '宿主打包中...');
          else if (phase === 'transferring') {
            const pct = total > 0 ? 15 + Math.round((received / total) * 20) : 20;
            view.setProgress(pct, `接收中 ${(received / 1048576).toFixed(1)} MB`);
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
      view.setProgress(100, '宿主拉取完成');
      view.toast('宿主拉取完成');
    } catch (err) {
      logger.error(`宿主拉取失败：${err.message}`);
      view.setProgress(0, '宿主拉取失败');
    } finally {
      state.busy = false;
    }
  }

  async function generate({ packages, target, splitMb, filenameTemplate }) {
    if (state.busy) return;
    if (!packages?.length) { view.toast('先选择要导出的包'); return; }
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
        view.setProgress(3, `转换中 · ${pkg.name}`);
        const { resultBlob } = await runConversionTask({
          source: blob,
          target: code,
          options: {
            excludedPaths: excluded,
            compressionLevel: Number(settings.compression),
            extensionMode: settings.extensionMode,
            gitMode: settings.gitMode,
            keepDevFiles: settings.keepDev,
            includeCache: settings.includeCache,
            includeBackups: settings.includeBackups,
            includeAppPrivate: settings.includePrivate,
            pruneBuiltinAssets: settings.pruneBuiltin,
          },
          onProgress: (current, total, filename) => {
            const pct = total ? Math.round((current / total) * 92) : 10;
            view.setProgress(pct, `转换中 ${current}/${total}${filename ? ` · ${filename}` : ''}`);
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
        logger.info(`已转换 ${pkg.name}`);
      }
      if (settings.keepExport) {
        for (const item of created) {
          await saveFile({
            id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: item.name, size: item.blob.size, blob: namedBlob(item.blob, item.name),
            layout: code, role: 'output', origin: ORIGINS.CONVERTED,
            metadata: { convertedAt: Date.now() },
          });
        }
        await syncPackages();
        view.setProgress(100, '导出包已就绪');
        view.toast(`已生成 ${created.length} 个导出包`);
        if (created.length) view.setZone('export');
      } else {
        for (const item of created) downloadBlob(item.blob, item.name);
        view.setProgress(100, '导出包已下载');
        view.toast(`已生成并下载 ${created.length} 个导出包`);
      }
    } catch (err) {
      logger.error(`转换失败：${err.message}`);
      view.setProgress(0, '转换失败');
      view.toast('转换失败，详见日志');
    } finally {
      state.busy = false;
    }
  }

  async function exportLibrary() {
    try {
      const pack = await exportLibraryToPack({});
      if (!pack?.ok || !pack.blob) { view.toast(pack?.reason || '没有可导出的聊天'); return; }
      const id = `lib-${Date.now()}`;
      await saveFile({
        id, name: pack.name || 'library-export.zip', size: pack.blob.size,
        blob: pack.blob, role: 'source', origin: ORIGINS.UPLOAD,
        metadata: { libraryExport: true },
      });
      await syncPackages();
      await ensurePlan(id);
      view.toast('聊天库已导出到导入区');
    } catch (err) {
      logger.error(`聊天库导出失败：${err.message}`);
    }
  }

  function openSettings() {
    view.openModal('设置', '', [buildSettingsHtml(settings)], [
      { label: '关闭', onClick: () => view.closeModal() },
      {
        label: '保存',
        primary: true,
        onClick: () => {
          Object.assign(settings, readSettings(root));
          saveSettings(settings);
          view.closeModal();
          view.toast('设置已保存');
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
      lan: lanActions,
      settings: openSettings,
      uploadRequest: () => root.querySelector('#file-input')?.click(),
      uploadPrivate: (name) => { logger.info(`私有配置上传请求：${name}`); view.toast(`私有配置：${name}`); },
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
  view.setProgress(0, '准备就绪');
  logger.info(`工作台已就绪 · ${host.isPlugin ? (HOST_LABEL[host.platform] || '宿主') + ' 插件' : '独立 Web'}`);
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
  if (!initialized) { initialized = true; main(app); }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
}
