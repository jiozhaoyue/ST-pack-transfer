const { getInstance } = require('../e2e/lib/instances.cjs');
const { openInstance } = require('../e2e/lib/harness.cjs');
const matrix = require('../e2e/lib/workbench-flow.cjs');

(async () => {
  const inst = getInstance('dev-luker');
  const h = await openInstance(inst);
  const { page } = h;
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
  await h.goto();

  const opened = await matrix.openWorkbench(page);
  if (!opened.visible) { console.log('open failed'); await h.close(); return; }
  const fixtures = await matrix.ensureFixtures();
  await page.setInputFiles('#file-input', fixtures['fixture-st.zip']);
  await page.waitForFunction(() => document.querySelectorAll('#zone-body .pkg-card').length > 0, null, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('#chart-stack .tree-row').length > 0, null, { timeout: 45_000 });

  await page.evaluate(() => document.querySelector('#zone-body .pkg-card .pkg-check')?.click());
  await page.waitForTimeout(500);

  const read = () => page.evaluate(() => ({
    zone: document.querySelector('#zone-tabs .zone-tab.active')?.dataset.zone,
    cards: document.querySelectorAll('#zone-body .pkg-card').length,
    checked: document.querySelectorAll('#zone-body .pkg-card .pkg-check:checked').length,
    hostToast: (document.getElementById('toast-container')?.textContent || '').trim().slice(0, 120),
    pluginToast: document.getElementById('toast')?.textContent || '',
    progress: (document.querySelector('.workbench-progress')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
    taskBtn: (document.querySelector('.workbench-progress')?.className || ''),
    pending: document.querySelectorAll('#zone-body [data-pending]').length,
  }));

  await page.click('#btn-generate');
  for (const ms of [200, 800, 2000, 5000, 10000]) {
    await page.waitForTimeout(ms === 200 ? 200 : ms - 0);
    console.log(`t+${ms}`, JSON.stringify(await read()));
  }
  console.log('pageErrors:', JSON.stringify(pageErrors.slice(0, 5)));
  await page.screenshot({ path: 'test-results/newui-generate-3.png' }).catch(() => {});
  await h.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
