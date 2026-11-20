/**
 * 扩展管理列表行响应式 CDP 实测脚本
 * 目的：断言桌面端绝对单行、移动端至多规范两行，彻底杜绝 3 行折裂事故。
 * 判定铁律：一旦出现 lines >= 3，测试脚本直接抛出异常并以非零状态码退出。
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { loadPlaywright } = require(path.resolve(__dirname, '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const VIEWPORTS = [
  { w: 390, h: 844, name: 'mobile-iphone12' },
  { w: 439, h: 900, name: 'mobile-wide-phone' },
  { w: 768, h: 1024, name: 'tablet-ipad' },
  { w: 1200, h: 900, name: 'desktop-hd' },
];

(async () => {
  const { chromium } = loadPlaywright();
  fs.mkdirSync('test-results', { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
  });

  // 测试本地端口 3040
  const port = process.env.PORT || 3040;
  const baseUrl = `http://localhost:${port}/`;

  let totalCheckedRows = 0;
  const report = {};

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      // 访问单文件离线或本地 Web 页面
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
      } catch (err) {
        // 如果 3040 没跑，则尝试访问内置 demo 或打包的 offline html
        const offlinePath = path.resolve(__dirname, '..', 'download', 'ST-pack-transfer-offline.html');
        if (fs.existsSync(offlinePath)) {
          await page.goto('file://' + offlinePath, { waitUntil: 'domcontentloaded', timeout: 8000 });
        } else {
          throw new Error(`无法连接 ${baseUrl} 且未找到离线单文件 HTML: ${err.message}`);
        }
      }

      await page.waitForSelector('#app.app-container', { timeout: 8000 });

      // 进入教程或跳过教程
      const skip = page.locator('#tutorial-skip');
      if (await skip.isVisible().catch(() => false)) {
        await skip.click();
        await page.waitForTimeout(80);
      }

      // 切换到扩展管理面板
      const extSwitchBtn = page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first();
      if (await extSwitchBtn.isVisible().catch(() => false)) {
        await extSwitchBtn.click();
        await page.waitForTimeout(150);
      }

      // 确保进入教程模式或者包内有扩展可测
      const tutorialBanner = page.locator('#tutorial-banner');
      if (!await tutorialBanner.isVisible().catch(() => false)) {
        await page.evaluate(() => {
          if (typeof window.enterTutorialMode === 'function') window.enterTutorialMode();
        });
        await page.waitForTimeout(200);
      }

      // 切换到包内页签
      const pkgTab = page.locator('#extmgr-tabs .seg-btn[data-exttab="package"]');
      if (await pkgTab.isVisible().catch(() => false)) {
        await pkgTab.click();
        await page.waitForTimeout(200);
      }

      // 注入标准与极端长扩展名测试行（严格按 formatExtRemoteUrlHtml 与真实 DOM 结构）
      await page.evaluate(() => {
        const body = document.getElementById('extension-body');
        if (body) {
          body.innerHTML = `
            <div class="ext-entry is-ok ext-ext-row ext-pkg-row" role="listitem" data-extrow="Extension-QuickPersona">
              <label class="check ext-dev-check"><input type="checkbox" data-extsel="Extension-QuickPersona"></label>
              <span class="ext-remote-url" title="https://github.com/SillyTavern/Extension-QuickPersona">
                <span class="ext-site-badge" title="GitHub"><i class="fa-brands fa-github"></i></span>
                <a class="ext-repo-link" href="https://github.com/SillyTavern/Extension-QuickPersona" target="_blank">Extension-QuickPersona</a>
                <span class="ext-author" title="SillyTavern">@ SillyTavern</span>
                <button type="button" class="ext-copy-btn" data-copyurl="https://github.com/SillyTavern/Extension-QuickPersona"><i class="fa-regular fa-copy"></i></button>
              </span>
              <span class="ext-state ext-version-badge is-local" data-gitopen="Extension-QuickPersona">1.0.0</span>
              <span class="ext-flag ext-kind-tag is-man">清单</span>
            </div>
            <div class="ext-entry is-ok ext-ext-row ext-pkg-row" role="listitem" data-extrow="ST-pack-transfer">
              <label class="check ext-dev-check"><input type="checkbox" data-extsel="ST-pack-transfer"></label>
              <span class="ext-remote-url" title="https://github.com/jiozhaoyue/ST-pack-transfer">
                <span class="ext-site-badge" title="GitHub"><i class="fa-brands fa-github"></i></span>
                <a class="ext-repo-link" href="https://github.com/jiozhaoyue/ST-pack-transfer" target="_blank">ST-pack-transfer</a>
                <span class="ext-author" title="jiozhaoyue">@ jiozhaoyue</span>
                <button type="button" class="ext-copy-btn" data-copyurl="https://github.com/jiozhaoyue/ST-pack-transfer"><i class="fa-regular fa-copy"></i></button>
              </span>
              <span class="ext-state ext-version-badge is-local" data-gitopen="ST-pack-transfer">0.6.0</span>
              <span class="ext-flag ext-kind-tag is-orig">原件</span>
            </div>
            <div class="ext-entry is-ok ext-ext-row ext-pkg-row" role="listitem" data-extrow="Extension-TopInfoBar">
              <label class="check ext-dev-check"><input type="checkbox" data-extsel="Extension-TopInfoBar"></label>
              <span class="ext-remote-url" title="https://github.com/SillyTavern/Extension-TopInfoBar">
                <span class="ext-site-badge" title="GitHub"><i class="fa-brands fa-github"></i></span>
                <a class="ext-repo-link" href="https://github.com/SillyTavern/Extension-TopInfoBar" target="_blank">Extension-TopInfoBar</a>
                <span class="ext-author" title="SillyTavern">@ SillyTavern</span>
                <button type="button" class="ext-copy-btn" data-copyurl="https://github.com/SillyTavern/Extension-TopInfoBar"><i class="fa-regular fa-copy"></i></button>
              </span>
              <span class="ext-state ext-version-badge is-local" data-gitopen="Extension-TopInfoBar">1.0.0</span>
              <span class="ext-flag ext-kind-tag is-man">清单</span>
            </div>
          `;
        }
      });
      await page.waitForTimeout(100);

      // 测量所有可见的 .ext-ext-row
      const rowsEvaluation = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.ext-ext-row'));
        return rows.map((row) => {
          const rowRect = row.getBoundingClientRect();
          const check = row.querySelector('.ext-dev-check');
          const remoteUrl = row.querySelector('.ext-remote-url');
          const repo = row.querySelector('.ext-repo, .ext-repo-link');
          const copyBtn = row.querySelector('.ext-copy-btn');
          const version = row.querySelector('.ext-version-badge');
          const kind = row.querySelector('.ext-kind-tag');

          const getBox = (el) => el ? {
            top: el.getBoundingClientRect().top,
            bottom: el.getBoundingClientRect().bottom,
            left: el.getBoundingClientRect().left,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          } : null;

          const checkRect = getBox(check);
          const urlRect = getBox(remoteUrl);
          const repoRect = getBox(repo);
          const copyRect = getBox(copyBtn);
          const verRect = getBox(version);
          const kindRect = getBox(kind);

          // 基于垂直区间重叠（Vertical Overlap Banding）计算真实视觉行数
          const elements = [checkRect, repoRect, copyRect, verRect, kindRect].filter(Boolean);
          const sorted = [...elements].sort((a, b) => a.top - b.top);
          const bands = [];
          for (const r of sorted) {
            const band = bands.find(b => {
              const overlap = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
              const minH = Math.min(b.bottom - b.top, r.height);
              return overlap >= minH * 0.4;
            });
            if (band) {
              band.top = Math.min(band.top, r.top);
              band.bottom = Math.max(band.bottom, r.bottom);
              band.items.push(r);
            } else {
              bands.push({ top: r.top, bottom: r.bottom, items: [r] });
            }
          }

          // 复制按钮是否真正换行掉落至下一行（即 copyBtn 顶部已在 repo 底部之下）
          const copyWrapped = (copyRect && repoRect) ? copyRect.top >= (repoRect.bottom - 2) : false;
          const urlStyle = remoteUrl ? window.getComputedStyle(remoteUrl) : {};
          const rowStyle = window.getComputedStyle(row);

          return {
            name: row.dataset.extrow || '',
            height: rowRect.height,
            lineCount: bands.length,
            copyWrapped,
            bands: bands.map(b => ({ top: Math.round(b.top), bottom: Math.round(b.bottom), count: b.items.length })),
            debug: {
              urlWrap: urlStyle.flexWrap,
              urlWhite: urlStyle.whiteSpace,
              rowWrap: rowStyle.flexWrap,
              repoRect,
              copyRect,
              urlRect,
            }
          };
        });
      });

      report[vp.name] = {
        viewport: vp,
        rowCount: rowsEvaluation.length,
        rows: rowsEvaluation,
      };

      totalCheckedRows += rowsEvaluation.length;

      // 截图存盘
      const shotPath = `test-results/ext-responsive-cdp-${vp.name}.png`;
      await page.screenshot({ path: shotPath, fullPage: false });

      // 严格断言
      for (const row of rowsEvaluation) {
        if (row.copyWrapped) {
          console.error('Debug row info:', JSON.stringify(row, null, 2));
          throw new Error(`[CDP 断言失败] 视口 ${vp.name} 下扩展行 "${row.name}" 复制按钮发生换行折裂！必须紧随名称同行！`);
        }
        const isMobileView = vp.w <= 860;
        if (!isMobileView && row.lineCount > 1) {
          throw new Error(`[CDP 断言失败] 桌面端视口 ${vp.name} (w=${vp.w}) 下扩展行 "${row.name}" 出现多行换行 (lines=${row.lineCount})！桌面端必须严格单行！`);
        }
        if (isMobileView && row.lineCount > 2) {
          console.error('Debug bands:', JSON.stringify(row, null, 2));
          throw new Error(`[CDP 严重违规] 移动端视口 ${vp.name} (w=${vp.w}) 下扩展行 "${row.name}" 出现 3 行或更多换行 (lines=${row.lineCount})！严禁超过 2 行！`);
        }
      }

      await page.close();
    }

    console.log(`[CDP 响应式断言成功] 遍历 ${VIEWPORTS.length} 个视口，实测 ${totalCheckedRows} 行扩展条目，无任何 3 行折裂事故。`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('\n❌ [CDP 响应式断言未通过]:', err.message);
  process.exit(1);
});
