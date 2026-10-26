/**
 * 仓（vault）运行时 spec —— 双后端存入 / 导出 / 删除 + **后端真值一致**
 *
 * 覆盖 `10-26-host-vault` 交付的私有格式仓：任意酒馆私有格式数据包原样整包存入，
 * Authority 可用时落服务端 blob，不可用时降级 IndexedDB。
 *
 * ## 判据为什么是「后端真值」而不是「DOM 行数」
 *
 * 2026-10-26 实测过一次：后端只有 **1** 条记录，面板却渲染出 **4** 行 ——
 * `renderVaultPanel` 的两次 `await` 之间被并发调用，两个协程都在清场后追加
 * （缺陷已修，规则见 `quality-guidelines.md` 禁止模式 #11）。那一刻**看 DOM 会得错误结论**。
 * ⇒ 本 spec 的主判据一律取**页内 `import()` 插件自身的 `vault-store`** 读后端真值；
 *   DOM 只用于「行渲染出来了 / 按钮点得到 / 截图有内容」这类交互与视觉断言。
 *
 * ## 为什么 PT / TT 必然是 `indexeddb`
 *
 * PT 是纯前端宿主（无服务端插件机制）；TT 无 Authority。两者 `vaultBackend()` 只会返回
 * `indexeddb`。本 spec 不断言具体值，只断言**徽标文案与 `vaultBackend()` 一致**，
 * 并把实际值打出来 —— 这样 Authority 在某宿主装/卸都不会误判，而「徽标撒谎」仍会被抓。
 *
 * ## 持久档案 ⇒ 必须先清场
 *
 * 实例侧 E2E 用持久化 Playwright 档案，仓条目跨轮残留。存入前先经后端 API 删空再重载，
 * 才能断言「存入 1 个 ⇒ 恰好 1 条」。
 */

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { openWorkbenchModal } = require('../lib/workbench-entry.cjs');
const { pruneFixtures } = require('../lib/fixture-prune.cjs');

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', 'test-results', 'fixtures');
/** 固件：跨格式包（TT 的包存进 ST/Luker 正好体现「不兼容也原样存」） */
const FIXTURE = 'fixture-tt.zip';

/** 插件资源根（ST/Luker 的标准落点；PT 用页面实测推导覆盖） */
const DEFAULT_BASE = '/scripts/extensions/third-party/ST-pack-transfer';

let fixturesPromise = null;
function ensureFixtures() {
  if (!fixturesPromise) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const genUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'fixtures', 'gen.js')).href;
    fixturesPromise = import(genUrl).then((m) => m.generateAll(FIXTURE_DIR));
  }
  return fixturesPromise;
}

/**
 * 页内 `import()` 的 vault-store 路径：优先从页面里插件自己的 script 标签推导
 * （PT 的扩展资源路径与 ST/Luker 不同），推不出再回退标准落点。
 */
async function resolveStoreUrl(page) {
  const derived = await page.evaluate(() => {
    const src = [...document.querySelectorAll('script[src]')]
      .map((el) => el.getAttribute('src') || '')
      .find((u) => /ST-pack-transfer/i.test(u) && /index\.js(\?|$)/.test(u));
    if (!src) return null;
    return new URL(src, location.href).href.replace(/index\.js(\?.*)?$/, 'src/storage/vault-store.js');
  }).catch(() => null);
  return derived || `${DEFAULT_BASE}/src/storage/vault-store.js`;
}

/** 后端真值（不经 DOM） */
async function backendState(page, storeUrl) {
  return page.evaluate(async (u) => {
    const m = await import(u);
    const entries = await m.vaultList();
    return {
      backend: await m.vaultBackend(),
      count: entries.length,
      entries: entries.map((e) => ({ id: e.id, name: e.name, size: e.size })),
    };
  }, storeUrl);
}

/** 清空仓（后端 API 直删），返回删除条数 */
async function clearVault(page, storeUrl) {
  return page.evaluate(async (u) => {
    const m = await import(u);
    const list = await m.vaultList();
    for (const e of list) await m.vaultDelete(e.id);
    return list.length;
  }, storeUrl);
}

/**
 * 清掉本仓 E2E 自己上传过的**源包**（按 `fixture-` 前缀，测试专用命名）。
 *
 * 为什么需要：仓模块只在 idle / done 阶段可见，而同一宿主上先跑的 `matrix` / `pt-load`
 * 会上传夹具并把它载入为**当前源** ⇒ 重载后阶段仍是 scanned ⇒ 仓不可见。
 * `fixture-prune.cjs` 的白名单里没有 `fixture-web-split-st.zip`（它由 `e2e:web` 生成、
 * 被 pt-load 上传），所以这里按前缀兜住，且只删 `fixture-` 开头的记录。
 */
async function clearTestSources(page, storeUrl) {
  const dbUrl = storeUrl.replace(/vault-store\.js$/, 'db.js');
  return page.evaluate(async (u) => {
    const m = await import(u);
    const rows = await m.listStoredFiles();
    let removed = 0;
    for (const r of rows) {
      if (/^fixture-/.test(r.name || '')) { await m.deleteFile(r.id); removed += 1; }
    }
    return removed;
  }, dbUrl);
}

/**
 * 打开插件态工作台。入口只剩扩展行内联下拉（`openWorkbenchModal`）；
 * 扩展菜单项（顶栏魔方棒）自 2026-10-27 R1.3 起**不再注入**，旧路径已删除。
 */
async function openPanel(page) {
  const mounted = await page.waitForFunction(
    () => Boolean(document.getElementById('st-converter-modal-overlay')),
    null, { timeout: 60_000 },
  ).then(() => true).catch(() => false);
  if (!mounted) return { ok: false, via: 'not-mounted' };

  const opened = await openWorkbenchModal(page);

  const rendered = await page.waitForFunction(() => {
    const ov = document.getElementById('st-converter-modal-overlay');
    if (!ov || getComputedStyle(ov).display === 'none') return false;
    const el = document.getElementById('target-select');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, null, { timeout: 30_000 }).then(() => true).catch(() => false);

  // 关掉可能残留的宿主扩展弹层（open-button 路径会把它留在最上层，遮住面板与截图）
  const closed = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.popup button, .popup .menu_button, [class*="popup"] button')]
      .filter((b) => b.getBoundingClientRect().height > 0);
    const close = btns.find((b) => /^(关闭|Close|×|✕)$/i.test((b.textContent || '').trim()));
    if (!close) return false;
    close.click();
    return true;
  });
  await page.waitForTimeout(500);
  return { ok: rendered, via: opened.via, closedPopup: closed };
}

/**
 * 点确认弹窗的肯定按钮。
 *
 * 必须**按文案锁定目标弹窗**：宿主弹窗是栈式的，界面上可能同时存在别的 popup
 * （Luker 的「有可用更新」、PT/TT 的初始化提示），按「第一个看得见的肯定按钮」取
 * 会点到别人的弹窗上（2026-10-26 实测一次误点，导致删除确认没被应答）。
 * 无 Popup 的宿主降级 `window.confirm`，由 `page.on('dialog')` 兜住。
 */
async function confirmHostDialog(page) {
  return page.evaluate(() => {
    const pickAffirmative = (root) => {
      const btns = [...root.querySelectorAll('button, .menu_button')]
        .filter((b) => b.getBoundingClientRect().height > 0);
      return btns.find((b) => /确定|确认|好的|OK|Yes/i.test(b.textContent || '')) || btns[btns.length - 1];
    };
    const popups = [...document.querySelectorAll('.popup, [class*="popup"]')]
      .filter((p) => p.getBoundingClientRect().height > 0);
    // 先找「仓删除」那条确认（消息文案由 vault-panel 传入：`确定从仓中删除「…」吗？`）
    const target = popups.find((p) => /从仓.*删除|删除.*仓/.test(p.textContent || '')) || null;
    let pick = target ? pickAffirmative(target) : null;
    // 兜底：宿主弹窗文案变了（或未带消息体）时退回「任意可见弹窗里的肯定按钮」
    if (!pick && popups.length) pick = pickAffirmative(popups[popups.length - 1]);
    if (!pick) return { clicked: false, popups: popups.length };
    const label = pick.textContent.trim();
    pick.click();
    return { clicked: true, label, matched: Boolean(target) };
  });
}

/** 仓模块读数（DOM 侧：可见性 + 徽标） */
const panelState = (page) => page.evaluate(() => {
  const sec = document.querySelector('section[data-wb-module="vault"]');
  const badge = document.querySelector('#vault-backend-badge .badge');
  if (sec) sec.scrollIntoView({ block: 'center' });
  return {
    found: !!sec,
    visible: sec ? sec.getBoundingClientRect().height > 0 : false,
    badge: badge ? badge.textContent.trim() : null,
    cards: document.querySelectorAll('#vault-list .archive-card').length,
  };
});

module.exports = {
  name: '仓（vault）：双后端存入 / 导出 / 删除 + 后端真值一致',
  requiresInstances: ['dev-st', 'dev-luker', 'pt-web'],

  async run(t, h) {
    const { page, rec } = h;
    const shot = (step) => page.screenshot({
      path: path.join(__dirname, '..', '..', 'test-results', 'instances',
        `vault-${h.instanceId}-${step}-${new Date().toISOString().slice(0, 10)}.png`),
      fullPage: false,
    }).catch(() => undefined);

    await ensureFixtures();
    const fixturePath = path.join(FIXTURE_DIR, FIXTURE);
    const fixtureSize = fs.statSync(fixturePath).size;

    const storeUrl = await resolveStoreUrl(page);
    t.log(`  · vault-store: ${storeUrl}`);

    // —— 0. 清场：先删上一 spec 遗留的 E2E 夹具，再清仓，然后重载 ——
    //
    // 仓模块**只在 idle / done 阶段可见**（`workbench-layout.visibleModules`）。同宿主上
    // `matrix` / `pt-load` 会先跑并上传源包 ⇒ 阶段停在 scanned ⇒ 仓不可见
    // （2026-10-26 PT 实测 `visible=false`）。故先按名清理本仓 E2E 夹具，让阶段回到 idle。
    const pruned = await pruneFixtures(page).catch(() => -1);
    const srcCleared = await clearTestSources(page, storeUrl).catch((e) => `ERR ${String(e).slice(0, 80)}`);
    t.log(`  · 清理上一 spec 遗留夹具：按名 ${pruned} 条 / 按前缀(fixture-) ${srcCleared} 条`);

    const cleared = await clearVault(page, storeUrl).catch((e) => `ERR ${String(e).slice(0, 80)}`);
    t.ok('清场可执行（页内 import 插件自身的 vault-store）', typeof cleared === 'number', `deleted=${cleared}`);
    if (typeof cleared !== 'number') return;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);

    // —— 1. 工作台 + 仓模块 ——
    const openVault = async () => {
      const o = await openPanel(page);
      if (!o.ok) return { o, panel: null };
      await page.waitForFunction(() => !!document.querySelector('#vault-backend-badge .badge'), null, { timeout: 15_000 })
        .catch(() => undefined);
      return { o, panel: await panelState(page) };
    };
    let { o: opened, panel } = await openVault();
    t.ok('插件态工作台已打开', opened.ok, JSON.stringify(opened));
    if (!opened.ok) return;

    if (!panel.visible) {
      // 仓只在 idle/done 可见；阶段不是 idle 时重载一次再试（源包记录已在上一步清掉）
      const visibleModules = await page.evaluate(() => [...document.querySelectorAll('[data-wb-module]')]
        .filter((s) => s.getBoundingClientRect().height > 0)
        .map((s) => s.getAttribute('data-wb-module')));
      t.log(`  · 仓首次不可见：可见模块=${JSON.stringify(visibleModules)} —— 再清一次并重载`);
      await clearTestSources(page, storeUrl).catch(() => undefined);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4_000);
      ({ o: opened, panel } = await openVault());
    }
    t.ok('仓模块存在且可见（idle 阶段可见）', panel.found && panel.visible, JSON.stringify(panel));
    t.ok('仓后端徽标已渲染', Boolean(panel.badge), `badge=${panel.badge}`);
    await shot('panel');

    // —— 2. 徽标文案必须与 backend 真值一致（Authority 装/卸都不误判，「徽标撒谎」必抓） ——
    const before = await backendState(page, storeUrl);
    const expectedBadge = before.backend === 'authority' ? '服务端' : before.backend === 'indexeddb' ? '本地' : '不可用';
    t.log(`  · 后端真值 backend=${before.backend}（宿主 ${h.instanceId}）`);
    t.eq('徽标文案与 vaultBackend() 一致', panel.badge, expectedBadge);
    t.eq('清场后后端条目数', before.count, 0);

    // —— 3. 存入（任意文件，不限格式） ——
    await page.setInputFiles('#vault-file-input', fixturePath);
    const stored = await page.waitForFunction(
      () => document.querySelectorAll('#vault-list .archive-card').length > 0,
      null, { timeout: 30_000 },
    ).then(() => true).catch(() => false);
    // 再等一拍：并发渲染重复追加是曾经的实测缺陷（quality-guidelines 禁止模式 #11）
    await page.waitForTimeout(2_500);
    const row = await page.evaluate(() => {
      const card = document.querySelector('#vault-list .archive-card');
      return {
        cards: document.querySelectorAll('#vault-list .archive-card').length,
        name: card?.querySelector('.archive-name')?.textContent ?? null,
        badges: card ? [...card.querySelectorAll('.archive-meta span')].map((s) => s.textContent.trim()) : [],
        actions: card ? [...card.querySelectorAll('.btn-archive-action')].map((b) => b.textContent.trim()) : [],
      };
    });
    const afterStore = await backendState(page, storeUrl);
    t.ok('存入后列表出现条目行', stored, JSON.stringify(row));
    t.eq('存入后 UI 行数恰好 1（并发渲染回归）', row.cards, 1);
    t.eq('存入后后端真值恰好 1 条', afterStore.count, 1);
    t.eq('后端记录的字节数 == 源文件', afterStore.entries[0]?.size, fixtureSize);
    t.ok('行内含格式徽标（不兼容包记「原始」）', row.badges.includes('原始'), JSON.stringify(row.badges));
    t.ok('行内动作含 导出/删除', row.actions.includes('导出') && row.actions.includes('删除'), JSON.stringify(row.actions));
    await shot('stored');

    // —— 4. 导出 → 字节一致 ——
    const dlPath = path.join(FIXTURE_DIR, `vault-export-${h.instanceId}.zip`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.evaluate(() => {
        const card = document.querySelector('#vault-list .archive-card');
        [...card.querySelectorAll('.btn-archive-action')].find((b) => b.textContent.trim() === '导出')?.click();
      }),
    ]).catch((e) => [null, e]);
    if (download) {
      await download.saveAs(dlPath);
      t.eq('导出下载字节与源文件一致', fs.statSync(dlPath).size, fixtureSize);
    } else {
      t.ok('导出触发下载', false, '30s 内未收到 download 事件');
    }

    // —— 5. 删除 → UI 与后端双归零 ——
    page.on('dialog', (d) => d.accept());
    await page.evaluate(() => {
      const card = document.querySelector('#vault-list .archive-card');
      [...card.querySelectorAll('.btn-archive-action')].find((b) => b.textContent.trim() === '删除')?.click();
    });
    await page.waitForTimeout(900);
    const confirm = await confirmHostDialog(page);
    t.log(`  · 删除确认：${JSON.stringify(confirm)}`);
    const uiEmpty = await page.waitForFunction(
      () => document.querySelectorAll('#vault-list .archive-card').length === 0,
      null, { timeout: 30_000 },
    ).then(() => true).catch(() => false);
    if (!uiEmpty) {
      // 面板刷新在 Luker 上实测 4.5–9s（updateWorkspaceUI 异步重建）；超窗时把现场打出来
      const left = await page.evaluate(() => ({
        cards: document.querySelectorAll('#vault-list .archive-card').length,
        text: (document.getElementById('vault-list')?.textContent || '').trim().slice(0, 40),
        openPopups: [...document.querySelectorAll('.popup, [class*="popup"]')]
          .filter((p) => p.getBoundingClientRect().height > 0).length,
      }));
      t.log(`  · 删除后 UI 未归零现场：${JSON.stringify(left)}`);
    }
    const afterDelete = await backendState(page, storeUrl);
    t.ok('删除后 UI 归零', uiEmpty);
    t.eq('删除后后端真值归零', afterDelete.count, 0);
    await shot('deleted');

    // —— 6. 零本插件报错 ——
    t.eq('本插件控制台/页面错误数', rec.pluginConsoleErrors.length, 0);
    t.eq('本插件失败请求数', rec.pluginFailures.length, 0);
  },
};
