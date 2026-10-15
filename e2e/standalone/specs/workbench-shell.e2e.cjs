/**
 * 工作台外壳：模块 / 流程 / 外壳 三层的**真浏览器**验收
 *
 * 为什么单独一个 spec 而不是并进 `workbench.e2e.cjs`：
 * `lib/common.cjs` 的 gotoWorkbench 会先点 `#btn-wb-view-toggle`——那个控件在
 * 2026-10-14 随迁移向导一起删除了（`10-14-ui-full-rewrite` R-01），于是**所有**走该
 * helper 的 spec 都在第一步 30s 超时。本 spec 因此不引 `common.cjs`，自己就绪判定，
 * 只验外壳本身。
 *
 * 验收对象（PRD AC-2.1 / AC-2.3 / AC-2.5 / AC-2.8 的可见部分）：
 *   ① 初始态只显示 配额 + 上传槽 + 选项槽 + 常驻日志，范围/产物不显示；
 *   ② 方向开关可切，切到导入 ⇒ 打包退场、恢复进场；
 *   ③ 被隐藏的模块**仍在 DOM 里**（否则动态 getElementById 会取到 null）；
 *   ④ 全流程零未捕获异常。
 *
 * 后缀必须是 `.e2e.cjs`：`.spec.cjs` / `.test.js` 会被 vitest 当单测收集。
 */

/** 元素是否真的可见（不是靠 display:none 的祖先藏起来的） */
const isVisible = (page, sel) =>
  page.$eval(sel, (el) => !!(el.offsetParent || el.getClientRects().length));

/** 元素是否仍在 DOM 中（哪怕不可见） */
const inDom = (page, sel) => page.$eval(sel, () => true).catch(() => false);

/** 模块容器是否可见：由模块内任一标志性控件反推 */
const MODULE_PROBES = {
  source: '#dropzone',
  scope: '#category-panel',
  products: '#export-queue-panel',
  log: '#log-console-mount',
  pack: '#target-select',
  restore: '#btn-restore-inline',
};

module.exports = {
  name: '工作台外壳：初始态收敛 / 方向切换 / 隐藏模块仍在 DOM',
  async run(t, h, ctx) {
    const { page, rec } = h;

    // ============ A 就绪 ============
    await page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded' });
    const envBadge = await page.waitForFunction(() => {
      const el = document.getElementById('env-badge');
      return el && el.textContent.trim() && el.textContent.trim() !== '检测中...';
    }, null, { timeout: 30_000 }).then(() => page.$eval('#env-badge', (el) => el.textContent.trim())).catch(() => null);
    t.ok('A1 工作台就绪（env-badge 有读数）', !!envBadge, String(envBadge));

    // ============ B 初始态收敛（AC-2.5：初始只有上传和打包区）============
    t.ok('B1 上传槽可见', await isVisible(page, MODULE_PROBES.source));
    t.ok('B2 打包选项可见', await isVisible(page, MODULE_PROBES.pack));
    t.ok('B3 日志常驻可见', await isVisible(page, MODULE_PROBES.log));
    t.ok('B4 内容范围**未**显示（计划未生成）', !(await isVisible(page, MODULE_PROBES.scope)));
    t.ok('B5 产物区**未**显示', !(await isVisible(page, MODULE_PROBES.products)));

    // ============ C 隐藏 ≠ 移出 DOM（AC-2.3）============
    // 这条是外壳的关键设计约束：全仓十余处**动态** getElementById 依赖这些节点仍在树里。
    t.ok('C1 未显示的内容范围仍在 DOM 中', await inDom(page, MODULE_PROBES.scope));
    t.ok('C2 未显示的产物区仍在 DOM 中', await inDom(page, MODULE_PROBES.products));
    t.ok('C3 未显示的恢复区仍在 DOM 中', await inDom(page, MODULE_PROBES.restore));

    // ============ D 方向开关（AC-2.2 / AC-2.3）============
    const diag = await page.evaluate(() => {
      const shell = document.getElementById('wb-shell');
      const out = document.getElementById('btn-flow-out');
      const inn = document.getElementById('btn-flow-in');
      return {
        hasShell: !!shell,
        layout: shell ? shell.dataset.wbLayout : null,
        form: shell ? shell.dataset.wbForm : null,
        outExists: !!out,
        outClass: out ? out.className : null,
        inClass: inn ? inn.className : null,
      };
    });
    t.log(`  · DIAG ${JSON.stringify(diag)}`);

    t.ok('D1 方向开关存在', await inDom(page, '#wb-flow-switch'));
    const outActive = await page.$eval('#btn-flow-out', (el) => el.classList.contains('active'));
    t.ok('D2 默认停在导出流程', outActive);

    await page.click('#btn-flow-in');
    await page.waitForTimeout(150);
    t.ok('D3 切到导入后恢复区可见', await isVisible(page, MODULE_PROBES.restore));
    t.ok('D4 切到导入后打包选项退场', !(await isVisible(page, MODULE_PROBES.pack)));
    t.ok('D5 切到导入后上传槽**仍在**（共享槽，不因换方向而消失）',
      await isVisible(page, MODULE_PROBES.source));
    t.ok('D6 导入流程**不出现**内容范围（整包写回不认类目勾选）',
      !(await isVisible(page, MODULE_PROBES.scope)));
    const inActive = await page.$eval('#btn-flow-in', (el) => el.classList.contains('active'));
    t.ok('D7 导入页签进入激活态', inActive);

    // 切回导出，确认可逆
    await page.click('#btn-flow-out');
    await page.waitForTimeout(150);
    t.ok('D8 切回导出后打包选项回来', await isVisible(page, MODULE_PROBES.pack));
    t.ok('D9 切回导出后恢复区退场', !(await isVisible(page, MODULE_PROBES.restore)));

    // ============ E 配额看板（AC-2.6）============
    const quota = await page.evaluate(() => Array.from(
      document.querySelectorAll('#usage-dashboard .usage-quota-section'),
    ).map((s) => ({
      disabled: s.classList.contains('is-disabled'),
      aria: s.getAttribute('aria-disabled'),
      text: s.textContent.replace(/\s+/g, ' ').trim().slice(0, 48),
    })));
    t.log(`  · QUOTA ${JSON.stringify(quota)}`);
    t.eq('E1 配额看板渲染两区（浏览器 + 宿主）', quota.length, 2, JSON.stringify(quota));
    t.ok('E2 独立模式下宿主区**置灰**而非撤掉（撤掉会让人以为本来就没这功能）',
      !!quota[1] && quota[1].disabled === true, JSON.stringify(quota[1]));
    t.ok('E3 置灰区带 aria-disabled 供无障碍识别',
      !!quota[1] && quota[1].aria === 'true', JSON.stringify(quota[1]));

    // ============ F 零报错（独立形态下整页可归因于本插件）============
    t.eq('F1 零未捕获页面异常', rec.pageErrors.length, 0, JSON.stringify(rec.pageErrors.slice(0, 2)));
    t.eq('F2 零控制台错误', rec.consoleErrors.length, 0, JSON.stringify(rec.consoleErrors.slice(0, 2)));
  },
};
