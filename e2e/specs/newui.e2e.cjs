/**
 * 新工作台规格（2026-10-27 重构后）
 *
 * 覆盖：真实路径打开工作台 → 上传 → 图表树 → 四目标切换 → 生成导出包。
 * 不覆盖旧 UI（暂存列表 / 类目卡片 / 计划摘要条 / 待导出队列）——那些节点已删除。
 */

const matrix = require('../lib/workbench-flow.cjs');

async function dismissHostPopups(page) {
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open], .popup[open]').forEach((dialog) => {
      try { dialog.close?.(); } catch { /* 忽略 */ }
      dialog.removeAttribute('open');
      dialog.style.display = 'none';
      dialog.style.pointerEvents = 'none';
    });
    document.querySelectorAll('.popup_background').forEach((bg) => { bg.style.display = 'none'; });
  }).catch(() => {});
  await page.waitForTimeout(300);
}

module.exports = {
  name: '新工作台：图表 / 目标 / 导出',
  requiresInstances: ['dev-st', 'dev-luker'],

  async run(t, h) {
    const { page, rec } = h;

    const opened = await matrix.openWorkbench(page);
    t.ok('按真实路径打开工作台（控件有真实尺寸）', opened.visible, opened.reason || '');
    if (!opened.visible) return;
    await dismissHostPopups(page);

    const fixtures = await matrix.ensureFixtures();
    const fixture = fixtures['fixture-st.zip'];

    await page.setInputFiles('#file-input', fixture);
    const cardReady = await page.waitForFunction(
      () => document.querySelectorAll('#zone-body .pkg-card').length > 0,
      null, { timeout: 30_000 },
    ).then(() => true).catch(() => false);
    t.ok('上传后出现包卡', cardReady);

    const treeReady = await page.waitForFunction(
      () => document.querySelectorAll('#chart-stack .tree-row').length > 0,
      null, { timeout: 45_000 },
    ).then(() => true).catch(() => false);
    const rows = await page.$$eval('#chart-stack .tree-row', (els) => els.length).catch(() => 0);
    t.ok('图表树已渲染（可逐文件勾选）', treeReady && rows > 0, `rows=${rows}`);
    const groups = await page.$$eval('#chart-stack .chart-group', (els) => els.length).catch(() => 0);
    t.ge('图表分组已渲染', groups, 1);

    await dismissHostPopups(page);
    await page.evaluate(() => document.getElementById('target-btn')?.click());
    const targets = await page.$$eval('#target-pop [data-target]', (els) => els.map((e) => e.dataset.target));
    t.eq('目标平台恰好四项英文全称',
      [...targets].sort().join(','),
      ['Luker', 'PureTavern', 'SillyTavern', 'TauriTavern'].sort().join(','));
    await page.evaluate(() => document.querySelector('#target-pop [data-target="SillyTavern"]')?.click());

    for (const name of ['Luker', 'TauriTavern', 'PureTavern', 'SillyTavern']) {
      await dismissHostPopups(page);
      await page.evaluate(() => document.getElementById('target-btn')?.click());
      await page.evaluate((value) => document.querySelector(`#target-pop [data-target="${value}"]`)?.click(), name);
      const ok = await page.waitForFunction(
        () => document.querySelectorAll('#chart-stack .tree-row').length > 0,
        null, { timeout: 30_000 },
      ).then(() => true).catch(() => false);
      t.ok(`切到 ${name} 后图表仍有树`, ok);
    }

    await dismissHostPopups(page);
    await page.evaluate(() => document.querySelector('#zone-body .pkg-card .pkg-check')?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('btn-generate')?.click());
    const exported = await page.waitForFunction(
      () => document.querySelector('#zone-tabs .zone-tab.active')?.dataset.zone === 'export'
        && document.querySelectorAll('#zone-body .pkg-card').length > 0,
      null, { timeout: 90_000 },
    ).then(() => true).catch(() => false);
    t.ok('生成导出包后导出区出现只读副本', exported);

    t.eq('本插件控制台/页面错误数', rec.pluginConsoleErrors.length, 0);
    t.eq('本插件失败请求数（4xx/5xx + 网络失败）', rec.pluginFailures.length, 0);
    if (rec.pluginConsoleErrors.length) {
      for (const e of rec.pluginConsoleErrors.slice(0, 5)) t.log(`      ! ${e.text.slice(0, 140)}`);
    }
  },
};
