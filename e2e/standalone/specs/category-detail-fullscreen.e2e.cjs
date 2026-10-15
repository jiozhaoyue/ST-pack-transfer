/**
 * 类目面板：**扩展合并为一条** + **明细全屏打开**（真浏览器验收）
 *
 * 验收对象（用户 2026-10-15 原话：「扩展列表处只留一条，里面是插件开关以及打开插件，
 * 打开是全屏」「禁止任何被覆盖，置于下方」）：
 *   ① 用户扩展与第三方扩展在界面上合并成**一条**卡片；
 *   ② 点「明细」以**全屏面板**打开，不再内联展开；
 *   ③ 打开明细**不改变主列高度** —— 内联展开会把后面的类目/执行区/报告区全部顶下去，
 *      这正是「置于下方」与外层滚动条的来源。
 *
 * 不引 `common.cjs` 的 `useAdvancedView`（它还在点已删除的 `#btn-wb-view-toggle`，见
 * design.md §11.3），只借用夹具与等待计划的纯函数。
 *
 * 后缀必须是 `.e2e.cjs`：`.spec.cjs` / `.test.js` 会被 vitest 当单测收集。
 */

const common = require('../lib/common.cjs');

module.exports = {
  name: '类目面板：扩展合并为一条 + 明细全屏打开',
  async run(t, h, ctx) {
    const { page, rec } = h;
    const fixtures = await common.ensureFixtures(ctx.fixtureDir);

    await page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded' });
    const ready = await page.waitForFunction(() => {
      const el = document.getElementById('env-badge');
      return el && el.textContent.trim() && el.textContent.trim() !== '检测中...';
    }, null, { timeout: 30_000 }).then(() => true).catch(() => false);
    t.ok('A1 工作台就绪', ready);

    // 首装引导会自动打开且铺满视口（`aria-modal`），会拦下后续**所有**点击 —— 先退出。
    // 全新浏览器上下文里 localStorage 无完成标记，故每次跑都会遇到。
    if (await page.$('.wb-guide-overlay')) {
      await page.click('.wb-guide-actions button:has-text("退出")').catch(() => {});
      await page.waitForFunction(() => {
        const el = document.querySelector('.wb-guide-overlay');
        return !el || el.hidden || getComputedStyle(el).display === 'none';
      }, null, { timeout: 5_000 }).catch(() => {});
    }
    const guideGone = await page.evaluate(() => {
      const el = document.querySelector('.wb-guide-overlay');
      return !el || el.hidden || getComputedStyle(el).display === 'none';
    });
    t.ok('A2 首装引导已退出（否则会拦下后续所有点击）', guideGone);

    await page.setInputFiles('#file-input', fixtures['fixture-st.zip']);
    const planned = await common.waitForPlan(page);
    t.ok('A3 计划已生成（面板进入已扫描态）', planned);

    // ============ B 扩展合并为一条 ============
    const cardKeys = await page.$$eval(
      '#category-checkboxes .category-card',
      (els) => els.map((e) => e.dataset.category),
    );
    t.log(`  · 卡片 ${JSON.stringify(cardKeys)}`);
    t.ok('B1 「扩展」只有一条卡片（用户扩展 + 第三方扩展合并）',
      cardKeys.filter((k) => k === 'extensions').length === 1, JSON.stringify(cardKeys));
    t.ok('B2 「第三方扩展」不再单独出卡片',
      !cardKeys.includes('globalExtensions'), JSON.stringify(cardKeys));
    t.ok('B3 其余类目照常各自一条', cardKeys.includes('chats') && cardKeys.includes('characters'),
      JSON.stringify(cardKeys));

    // ============ C 明细全屏打开，且不顶动主列 ============
    const target = '#category-checkboxes .category-card[data-category="chats"]';
    t.ok('C1 该类目有「明细」入口', (await page.$(`${target} .btn-expand-detail`)) !== null);

    const heightBefore = await page.$eval('#category-checkboxes', (el) => el.getBoundingClientRect().height);
    await page.click(`${target} .btn-expand-detail`);
    await page.waitForSelector('.wb-detail-overlay', { timeout: 5_000 }).catch(() => {});
    const hasOverlay = (await page.$('.wb-detail-overlay')) !== null;
    t.ok('C2 点「明细」弹出**全屏**面板', hasOverlay);

    const heightAfter = await page.$eval('#category-checkboxes', (el) => el.getBoundingClientRect().height);
    t.eq('C3 打开明细**不改变主列高度**（内联展开会把内容顶下去）',
      Math.round(heightAfter), Math.round(heightBefore));

    const overlayCovers = await page.$eval('.wb-detail-overlay', (el) => {
      const r = el.getBoundingClientRect();
      return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1;
    });
    t.ok('C4 面板确实铺满视口（不是又一块内联区）', overlayCovers);

    const rows = await page.$$eval('.wb-detail-overlay .file-detail-row', (els) => els.length);
    t.ge('C5 面板里列出该类目的逐项文件', rows, 1);

    // ============ D 关闭 ============
    await page.click('#btn-close-category-detail');
    await page.waitForFunction(() => !document.querySelector('.wb-detail-overlay'), null, { timeout: 5_000 })
      .catch(() => {});
    t.ok('D1 关闭后面板消失', (await page.$('.wb-detail-overlay')) === null);
    const stillThere = await page.$$eval('#category-checkboxes .category-card', (els) => els.length);
    t.ge('D2 关闭后类目面板照常在场（关闭不误伤主列）', stillThere, 5);

    // ============ E 零报错 ============
    t.eq('E1 零未捕获页面异常', rec.pageErrors.length, 0, JSON.stringify(rec.pageErrors.slice(0, 2)));
    t.eq('E2 零控制台错误', rec.consoleErrors.length, 0, JSON.stringify(rec.consoleErrors.slice(0, 2)));
  },
};
