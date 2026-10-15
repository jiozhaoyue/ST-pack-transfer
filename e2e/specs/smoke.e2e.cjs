/**
 * 加载冒烟 spec —— 插件加载 / 注入点齐全 / **零本插件报错**
 *
 * 对每个目标实例跑一遍（`requiresInstances`）。判定只认**可归因到本插件**的读数
 * （见 `lib/harness` 的归因说明）：整页背景报错来自 30 个第三方扩展，**不计入判定**，
 * 但会把条数打出来备查。
 *
 * ## 断言为什么是「契约相对」而不是绝对值
 * 首版按绝对值断言，跑出 5 条失败 —— 回源码核实后确认**是断言写错了，不是插件缺陷**：
 *   · `host-bridge.js` 明写「初始页面查询 `.userBackupButton` → **0 个**，
 *     本函数自然什么都不做」⇒ 未打开账号弹层时 `data-st-zip-injected` 为 0 是**设计行为**；
 *   · 菜单项依赖宿主存在 `#extensionsMenu` 锚点（Luker 初始 DOM 里没有）。
 * ⇒ 故改为断言**不变量**：注入按钮数 == 宿主原生锚点数（1:1、绝无孤儿）；
 *   锚点存在时菜单项必须存在。
 *
 * 注入点（取自源码，非猜测；2026-10-15 起插件态改挂全屏模态）：
 *   `#st-zip-converter-open-btn`          宿主扩展列表行上的「打开」（宿主桥 `mountExtensionRowButton`）
 *   `#st-converter-modal-overlay`         全屏工作台覆盖层（`index.js` ensureConverterModal）
 *   `#app.app-container`                  工作台容器（三形态同一个根）
 *   `#st-zip-converter-menu-item`         扩展菜单项
 *   `[data-st-zip-injected="1"]`          注入到宿主原生按钮旁的动作按钮（幂等标记）
 */

const SLUG = 'st-zip-converter';
const BASE = `/scripts/extensions/third-party/${SLUG}`;

module.exports = {
  name: '加载冒烟：插件加载 / 注入点齐全 / 零本插件报错',
  requiresInstances: ['dev-luker', 'dev-st'],

  async run(t, h) {
    const { page, rec } = h;

    // —— 1. 插件资源确实被宿主提供 ——
    const assets = await page.evaluate(async ({ base }) => {
      const out = {};
      for (const rel of ['/manifest.json', '/index.js']) {
        try {
          const r = await fetch(base + rel, { credentials: 'include' });
          out[rel] = { status: r.status, len: (await r.text()).length };
        } catch (e) { out[rel] = { status: 0, error: String(e) }; }
      }
      return out;
    }, { base: BASE });

    t.eq('manifest.json 可取（HTTP 200）', assets['/manifest.json'].status, 200);
    t.eq('index.js 可取（HTTP 200）', assets['/index.js'].status, 200);
    t.ge('index.js 非空', assets['/index.js'].len || 0, 1000);

    // —— 2. 等宿主把插件挂上去（watchHostDom 有 200ms 去抖） ——
    // 等待窗口 20s → 60s（2026-09-29，子任务 B `implement.md` §4.3b 的 (b) 分支，用户裁决 U-3）：
    //   断言内容**不变**，只放宽等待窗口 —— 20s 在**其它会话并发跑重型测试**时不够
    //   （实测 smoke 挂载断言超窗，而同一轮 matrix 段零失败；空载实测 25s 内必挂上）。
    //   与 matrix 的等待窗口同量级，避免「同一能力、两个 spec 两个判据」。
    // 判别力不受影响：挂载真的失败时，60s 一样会判红（放宽的是等待，不是断言）。
    let mounted = false;
    try {
      await page.waitForFunction(
        (slug) => Boolean(document.getElementById(`${slug}-menu-item`)
          || document.getElementById('st-converter-modal-overlay')),
        SLUG, { timeout: 60_000 },
      );
      mounted = true;
    } catch { mounted = false; }
    t.ok('宿主已挂上插件（工作台模态或扩展菜单项已就绪）', mounted);

    // —— 3. 注入点清点 ——
    const spots = await page.evaluate((slug) => ({
      modal: Boolean(document.getElementById('st-converter-modal-overlay')),
      openBtn: Boolean(document.getElementById('st-zip-converter-open-btn')),
      menuItem: Boolean(document.getElementById(`${slug}-menu-item`)),
      // 宿主侧锚点是否存在（插件只在锚点存在处注入）
      hostMenuAnchor: Boolean(document.querySelector('#extensionsMenu .list-group')
        || document.querySelector('#extensionsMenu') || document.querySelector('#options')),
      injectedButtons: document.querySelectorAll('[data-st-zip-injected="1"]').length,
      backupAnchors: document.querySelectorAll('.userBackupButton').length,
    }), SLUG);

    t.ok('全屏工作台模态已建好（boot 时建好但隐藏，点「打开」才显示）', spots.modal);
    // 扩展行上的「打开」按钮是**按需渲染**的：宿主扩展管理弹层未打开时它不存在（设计行为，不算失败）
    t.log(`  · 扩展行「打开」按钮当前存在: ${spots.openBtn}（宿主扩展弹层未开时为 false，属设计行为）`);

    // 契约①：菜单项与宿主菜单锚点同生共死 —— 锚点在则必须注入。
    // ⚠️ 必须**有界等待**而非瞬时判定（L1-MR-7）：实测宿主菜单先渲染成**空壳**
    // （`#extensionsMenu` 子节点 `0 → 16`），插件的菜单项要到 **t≈7 s** 才出现 ——
    // 首版按瞬时值判定，于是同一个实例时红时绿。这是测量时机问题，不是插件缺陷。
    let menuItem = spots.menuItem;
    if (spots.hostMenuAnchor && !menuItem) {
      try {
        await page.waitForFunction(
          (slug) => Boolean(document.getElementById(`${slug}-menu-item`)),
          SLUG, { timeout: 15_000 },
        );
        menuItem = true;
      } catch { menuItem = false; }
    }
    if (spots.hostMenuAnchor) {
      t.ok('宿主菜单锚点存在 ⇒ 菜单项在 15s 内完成注入', menuItem);
    } else {
      t.ok('宿主无菜单锚点 ⇒ 菜单项缺省不算失败', true, '本实例初始 DOM 无 #extensionsMenu');
    }

    // 契约②：**注入按钮数 == 宿主原生备份锚点数**（1:1，绝无孤儿按钮）
    t.eq('注入按钮数与宿主原生备份锚点数一致（1:1）',
      spots.injectedButtons, spots.backupAnchors);

    // —— 4. 打开工作台：应当真的渲染出功能节点（不是空壳） ——
    const opened = await page.evaluate(async () => {
      const app = document.querySelector('#st-converter-modal-overlay #app.app-container');
      if (!app) return { ok: false, reason: '模态内无 #app.app-container' };
      const q = (sel) => app.querySelector(sel);
      return {
        ok: true,
        dropzone: Boolean(q('#dropzone, .dropzone')),
        stashList: Boolean(q('#stash-list')),
        exportQueue: Boolean(q('#export-queue-panel')),
        usageDashboard: Boolean(q('#usage-dashboard')),
        categoryPanel: app.querySelectorAll('.category-panel').length,
        headerCount: app.querySelectorAll('.app-header').length,
      };
    });

    t.ok('工作台容器存在（模态内 #app.app-container）', opened.ok, opened.reason || '');
    if (opened.ok) {
      t.ok('上传暂存区拖放点已渲染（#dropzone）', opened.dropzone);
      t.ok('源包列表容器已渲染（#stash-list）', opened.stashList);
      t.ok('待导出区容器已渲染（#export-queue-panel）', opened.exportQueue);
      t.ok('配额条容器已渲染（#usage-dashboard）', opened.usageDashboard);
      t.ge('类目面板已渲染（.category-panel）', opened.categoryPanel, 1);
      // 2026-10-15：插件态与独立态共用同一份模板，页头（含关闭按钮）两态都有
      t.eq('页头已渲染（模态态带关闭入口）', opened.headerCount, 1);
    }

    // —— 5. 零本插件报错 / 零本插件失败请求（判定只看这一栏） ——
    t.eq('本插件控制台/页面错误数', rec.pluginConsoleErrors.length, 0);
    t.eq('本插件失败请求数（4xx/5xx + 网络失败）', rec.pluginFailures.length, 0);

    // 背景读数（不参与判定，仅打印）
    t.log(`  · 背景读数（不判定）：整页 console.error ${rec.consoleErrors.length} 条、`
      + `pageerror ${rec.pageErrors.length} 条、失败请求 ${rec.failedRequests.length} 条`);
    t.log(`  · 注入点：panel=${spots.panel} drawer=${spots.drawer} menu=${menuItem}`
      + `（宿主菜单锚点 ${spots.hostMenuAnchor}）| 注入按钮 ${spots.injectedButtons}`
      + ` / 备份锚点 ${spots.backupAnchors}`);

    if (rec.pluginConsoleErrors.length) {
      for (const e of rec.pluginConsoleErrors.slice(0, 5)) t.log(`      ! ${e.text.slice(0, 140)}`);
    }
    if (rec.pluginFailures.length) {
      for (const e of rec.pluginFailures.slice(0, 5)) t.log(`      ! ${e.status || ''} ${e.url}`);
    }
  },
};
