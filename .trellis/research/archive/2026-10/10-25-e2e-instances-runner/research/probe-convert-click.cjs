/**
 * M-4 click 超时取证：上传夹具 → 切目标 → 点 #btn-convert；超时时截图 + elementFromPoint 遮挡检测
 * 用法：node .trellis/tasks/10-25-e2e-instances-runner/research/probe-convert-click.cjs
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));
const { openWorkbenchModal } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'workbench-entry.cjs'));

(async () => {
  const inst = INSTANCES['dev-st'];
  const h = await openInstance(inst);
  const { page } = h;
  try {
    await h.goto();
    await openWorkbenchModal(page);

    // 夹具上传（与 matrix ensureFixtures 同源）
    const FIXTURE_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'test-results', 'fixtures');
    const genUrl = pathToFileURL(path.resolve(__dirname, '..', '..', '..', '..', 'fixtures', 'gen.js')).href;
    const { generateAll } = await import(genUrl);
    const fixtures = await generateAll(FIXTURE_DIR);
    await page.setInputFiles('#file-input', fixtures['fixture-st.zip'] || path.join(FIXTURE_DIR, 'fixture-st.zip'));
    await page.waitForTimeout(2500);

    await page.selectOption('#target-select', 'l');
    await page.waitForTimeout(1200);

    const state = await page.evaluate(() => {
      const b = document.getElementById('btn-convert');
      if (!b) return { exists: false };
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {
        exists: true, disabled: b.disabled, visible: !!(r.width && r.height),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        topAtCenter: top ? `${top.tagName}#${top.id || ''}.${String(top.className).slice(0, 50)}` : 'null',
        isTopTheButton: top === b,
        planBar: document.getElementById('plan-summary-bar')?.textContent?.slice(0, 90) || '',
      };
    });
    console.log('[before-click]', JSON.stringify(state, null, 1));

    try {
      await page.click('#btn-convert', { timeout: 12_000 });
      console.log('[click] OK');
      await page.waitForTimeout(3000);
      const after = await page.evaluate(() => ({
        queue: document.querySelectorAll('#export-queue-panel .eq-name').length,
        busy: document.getElementById('btn-convert')?.disabled,
      }));
      console.log('[after]', JSON.stringify(after));
    } catch (e) {
      console.log('[click-failed]', String(e).slice(0, 200));
      await page.screenshot({ path: path.resolve(__dirname, 'convert-click-blocked.png') });
      const diag = await page.evaluate(() => {
        const b = document.getElementById('btn-convert');
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        // 遮挡链：从按钮中心向上找遮挡元素及其 open 状态
        const chain = [];
        let el = top;
        while (el && chain.length < 5) { chain.push(`${el.tagName}#${el.id || ''}.${String(el.className).slice(0, 40)}`); el = el.parentElement; }
        return { topChain: chain, dialogsOpen: [...document.querySelectorAll('dialog[open]')].map((d) => d.className.slice(0, 60)) };
      });
      console.log('[diag]', JSON.stringify(diag, null, 1));
    }
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('失败:', String(e).slice(0, 300)); process.exit(1); });
