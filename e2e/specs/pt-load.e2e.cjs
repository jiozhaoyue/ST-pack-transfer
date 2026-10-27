/**
 * PureTavern（第 4 宿主）· 新工作台规格
 *
 * 覆盖：插件加载 / 宿主注入 / 工作台打开 / 上传 → 图表 → 目标切换 → 生成导出包 / 零报错。
 * PT 是纯前端宿主：用户数据在浏览器 IndexedDB，没有 `/api/users/backup` 那类端点；
 * 本规格不断言宿主拉取，只验证与纯前端路径一致的工作台链路。
 */

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { openWorkbenchModal } = require('../lib/workbench-entry.cjs');

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', 'test-results', 'fixtures');

async function dismissTutorial(page) {
  await page.evaluate(() => {
    try { sessionStorage.setItem('st-pack-transfer:tutorial-seen', '1'); } catch { /* 隐私模式 */ }
  }).catch(() => {});
  await page.waitForTimeout(450);
  for (let i = 0; i < 3; i += 1) {
    const open = await page.evaluate(() => {
      const overlay = document.getElementById('tutorial-overlay');
      if (!overlay || !overlay.classList.contains('open')) return false;
      document.getElementById('tutorial-skip')?.click();
      return true;
    }).catch(() => false);
    if (!open) return;
    await page.waitForTimeout(200);
  }
}

async function dismissHostPopups(page) {
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open], .popup[open]').forEach((d) => {
      try { d.close?.(); } catch { /* 忽略 */ }
      d.removeAttribute('open');
      d.style.display = 'none';
      d.style.pointerEvents = 'none';
    });
    document.querySelectorAll('.popup_background').forEach((bg) => { bg.style.display = 'none'; });
  }).catch(() => {});
  await page.waitForTimeout(200);
}

module.exports = {
  name: 'PureTavern 冒烟：插件加载 / 注入点 / 新工作台 / 零本插件报错',
  requiresInstance: 'pt-web',
  async run(t, h) {
    const { page } = h;

    // ── 宿主就绪 ──
    const ready = await page.waitForFunction(
      () => Boolean(document.getElementById('send_form')), null, { timeout: 60_000 },
    ).then(() => true).catch(() => false);
    t.ok('P1 PT 页面骨架就绪（`#send_form` 出现）', ready);

    const platform = await page.evaluate(async () => ({
      pureTavernGlobal: typeof globalThis.__PURE_TAVERN__ !== 'undefined',
      versionAgent: (await fetch('/version').then((r) => r.text()).catch(() => '')).slice(0, 80),
    }));
    t.ok('P1b detectHost 第 1 级判据（`__PURE_TAVERN__` 全局存在）', platform.pureTavernGlobal,
      JSON.stringify(platform));
    t.ok('P1c detectHost 第 2 级判据（/version 含 PureTavern）', /PureTavern/i.test(platform.versionAgent),
      `agent="${platform.versionAgent}"`);

    // ── 插件挂载 ──
    const modalBuilt = await page.waitForFunction(
      () => Boolean(document.getElementById('st-converter-modal-overlay')),
      null, { timeout: 90_000 },
    ).then(() => true).catch(() => false);
    t.ok('P2 工作台模态已建好（boot 时建好但隐藏）', modalBuilt);

    const spots = await page.evaluate(() => ({
      extPanel: Boolean(document.getElementById('extensions_settings')),
      hostMenuAnchor: Boolean(document.querySelector('#extensionsMenu') || document.querySelector('#options')),
    }));
    t.ok('P3 PT 有扩展设置面板（注入落点存在）', spots.extPanel, JSON.stringify(spots));

    const hostOpened = await page.evaluate(() => {
      const btn = document.querySelector('#extensions-settings-button .drawer-toggle')
        || document.querySelector('.drawer-opener[data-target="extensions-settings-button"]');
      if (!btn) return 'not-found';
      btn.click();
      return 'clicked';
    });
    await page.waitForTimeout(1200);
    t.ok('P3b 宿主扩展设置抽屉已打开', hostOpened !== 'not-found', `via=${hostOpened}`);

    // ── 打开新工作台 ──
    await dismissHostPopups(page);
    const opened = await openWorkbenchModal(page);
    t.ok('P4 工作台可打开', opened.ok, opened.reason || `via=${opened.via}`);

    const visible = await page.evaluate(() => {
      const app = document.querySelector('#st-converter-modal-overlay #app.app-container');
      const r = app?.getBoundingClientRect();
      return {
        visible: Boolean(app) && Boolean(r) && r.width > 0 && r.height > 0,
        controls: ['file-input', 'btn-generate', 'zone-body', 'chart-stack', 'zone-tabs', 'target-btn', 'btn-lan-send']
          .filter((x) => document.getElementById(x)).length,
      };
    });
    t.ok('P4a 工作台真实可见（有尺寸）', visible.visible);
    t.eq('P4b 新工作台关键控件齐全（7 项）', visible.controls, 7);

    const badge = await page.evaluate(() => document.getElementById('host-badge-text')?.textContent?.trim() || '');
    t.ok('P5 宿主徽标已判定为 PureTavern', /PureTavern/i.test(badge), `badge="${badge}"`);

    await dismissTutorial(page);
    await dismissHostPopups(page);

    // ── 上传 → 图表 ──
    const fixturePath = path.join(FIXTURE_DIR, 'fixture-st.zip');
    if (!fs.existsSync(fixturePath)) {
      const genUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'fixtures', 'gen.js')).href;
      await import(genUrl).then((m) => m.generateAll(FIXTURE_DIR));
    }
    t.ok('P6 用例夹具就绪', fs.existsSync(fixturePath), fixturePath);

    await page.setInputFiles('#file-input', fixturePath);
    const tree = await page.waitForFunction(
      () => document.querySelectorAll('#chart-stack .tree-row').length > 0,
      null, { timeout: 45_000 },
    ).then(() => true).catch(() => false);
    const rows = await page.$$eval('#chart-stack .tree-row', (els) => els.length).catch(() => 0);
    const groups = await page.$$eval('#chart-stack .chart-group', (els) => els.length).catch(() => 0);
    t.ok('P7 上传后图表树渲染（可逐文件勾选）', tree && rows > 0, `rows=${rows}`);
    t.ge('P8 图表分组已渲染', groups, 1);

    // ── 四目标切换 ──
    await dismissHostPopups(page);
    await page.evaluate(() => document.getElementById('target-btn')?.click());
    const targets = await page.$$eval('#target-pop [data-target]', (els) => els.map((e) => e.dataset.target));
    t.eq('P9 目标平台恰好四项英文全称',
      [...targets].sort().join(','),
      ['Luker', 'PureTavern', 'SillyTavern', 'TauriTavern'].sort().join(','));

    for (const name of ['Luker', 'TauriTavern', 'PureTavern', 'SillyTavern']) {
      await dismissHostPopups(page);
      await page.evaluate(() => document.getElementById('target-btn')?.click());
      await page.evaluate((value) => document.querySelector(`#target-pop [data-target="${value}"]`)?.click(), name);
      const still = await page.waitForFunction(
        () => document.querySelectorAll('#chart-stack .tree-row').length > 0,
        null, { timeout: 30_000 },
      ).then(() => true).catch(() => false);
      t.ok(`P10 切到 ${name} 后图表仍有树`, still);
    }

    // ── 生成导出包 ──
    await dismissHostPopups(page);
    await page.evaluate(() => document.querySelector('#zone-body .pkg-card .pkg-check')?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('btn-generate')?.click());
    const exported = await page.waitForFunction(
      () => document.querySelector('#zone-tabs .zone-tab.active')?.dataset.zone === 'export'
        && document.querySelectorAll('#zone-body .pkg-card').length > 0,
      null, { timeout: 120_000 },
    ).then(() => true).catch(() => false);
    t.ok('P11 生成导出包后导出区出现只读副本', exported);

    // ── 零报错（剔除 PT 自身与一次性安装源噪音） ──
    const own = h.rec.pluginConsoleErrors.filter(
      (e) => !/ST-pack-transfer\.zip|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED/.test(e.url || e.text || ''),
    );
    t.eq('P12 本插件控制台/页面错误数', own.length, 0, JSON.stringify(own.slice(0, 2)));
    t.log(`  · 失败请求读数：${JSON.stringify(h.rec.pluginFailures)}`);
    const ownFailures = h.rec.pluginFailures.filter(
      (f) => !/ST-pack-transfer\.zip|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED/.test(f.url || f.error || ''),
    );
    t.eq('P13 本插件失败请求数（剔除一次性安装源 / PT 自身连接重置）', ownFailures.length, 0,
      JSON.stringify(ownFailures.slice(0, 2)));
  },
};
