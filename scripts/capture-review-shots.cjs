/**
 * 捕获对外公开与用户审核截图脚本
 * 输出目录：docs/assets/review-shots/
 */
const path = require('path');
const fs = require('fs');
const { loadPlaywright } = require(path.resolve(__dirname, '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const APP_VERSION = require(path.resolve(__dirname, '..', 'package.json')).version;
const CHANGELOG_SEEN_KEY = 'st-pack-transfer:seen-changelog-version';

/**
 * 进入任何目标态之前先关掉「更新日志」自动弹层：预设「不再自动显示」的版本存储键，
 * 让 maybeShowChangelog() 判定为「已看过」而不弹，避免遮挡教程浮层 / 底栏 / 抽屉。
 * 只作用于采集 BrowserContext，不改产品代码、不写仓库文件。
 */
async function suppressChangelog(page) {
  await page.context().addInitScript(({ key, version }) => {
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, version); }
    catch { /* file:// 等无存储环境忽略，不影响采集 */ }
  }, { key: CHANGELOG_SEEN_KEY, version: APP_VERSION });
}

(async () => {
  const { chromium } = loadPlaywright();
  const outDir = path.resolve(__dirname, '..', 'docs', 'assets', 'review-shots');
  fs.mkdirSync(outDir, { recursive: true });

  const offlinePath = path.resolve(__dirname, '..', 'download', 'ST-pack-transfer-offline.html');
  if (!fs.existsSync(offlinePath)) {
    throw new Error('离线包未生成，请先运行 npm run build:offline');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
  });

  // 1. 桌面端截图 (1200x850)
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    await suppressChangelog(page);
    await page.goto('file://' + offlinePath, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app.app-container');

    // 1.1 教程弹层（去黄验证）
    const tutCard = page.locator('#st-pt-tutorial-overlay .tutorial-card');
    if (await tutCard.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(outDir, '01-desktop-tutorial-overlay-clean.png') });
    }

    // 关闭教程进入工作台
    const skip = page.locator('#tutorial-skip');
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(100);
    }

    // 1.2 数据包侧栏（单行头部、移除废话条、无分页到底）
    const zoneCard = page.locator('#zone-card');
    if (await zoneCard.isVisible().catch(() => false)) {
      await zoneCard.screenshot({ path: path.join(outDir, '02-desktop-zone-single-header.png') });
    }

    // 1.3 扩展管理 - 包内单行列表（真实用户 ST- 仓库）
    const extBtn = page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first();
    if (await extBtn.isVisible().catch(() => false)) {
      await extBtn.click();
      await page.waitForTimeout(150);
    }
    const pkgTab = page.locator('#extmgr-tabs .seg-btn[data-exttab="package"]');
    if (await pkgTab.isVisible().catch(() => false)) {
      await pkgTab.click();
      await page.waitForTimeout(200);
    }

    // 在扩展管理包内模式下点击数据包卡片完成选包
    const firstPkg = page.locator('.pkg-card[data-pkg]').first();
    if (await firstPkg.isVisible().catch(() => false)) {
      await firstPkg.click();
      await page.waitForTimeout(300);
    }

    // 若有“扫描包内扩展”按钮则点击触发扫描
    const scanBtn = page.locator('#extmgr-scan-pkg-btn');
    if (await scanBtn.isVisible().catch(() => false)) {
      await scanBtn.click();
      await page.waitForTimeout(300);
    }

    const extView = page.locator('#extension-view');
    if (await extView.isVisible().catch(() => false)) {
      await extView.screenshot({ path: path.join(outDir, '03-desktop-ext-package-single-line.png') });
    }

    // 整体工作台桌面全景
    await page.screenshot({ path: path.join(outDir, '04-desktop-workbench-full.png') });

    await page.close();
  }

  // 2. 移动端截图 (390x844)
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await suppressChangelog(page);
    await page.goto('file://' + offlinePath, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app.app-container');

    const skip = page.locator('#tutorial-skip');
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(100);
    }

    // 2.1 移动端扩展管理（严格两行，绝无 3 行换行）
    const extBtn = page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first();
    if (await extBtn.isVisible().catch(() => false)) {
      await extBtn.click();
      await page.waitForTimeout(150);
    }
    const pkgTab = page.locator('#extmgr-tabs .seg-btn[data-exttab="package"]');
    if (await pkgTab.isVisible().catch(() => false)) {
      await pkgTab.click();
      await page.waitForTimeout(150);
    }

    // 移动端在扩展管理包内时，打开数据包抽屉选一个包
    const zoneBtn = page.locator('.view-switch-btn:visible', { hasText: '数据包' }).first();
    if (await zoneBtn.isVisible().catch(() => false)) {
      await zoneBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, '06-mobile-zone-drawer.png') });
      const pkgCard = page.locator('.pkg-card[data-pkg]').first();
      if (await pkgCard.isVisible().catch(() => false)) {
        await pkgCard.click();
        await page.waitForTimeout(200);
      }
      const collapseBtn = page.locator('#zone-mobile-collapse');
      if (await collapseBtn.isVisible().catch(() => false)) {
        await collapseBtn.click();
        await page.waitForTimeout(400);
      }
    }

    // 再次切回扩展管理查看已选包的列表（等待抽屉收起完毕）
    const extSwitch = page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first();
    if (await extSwitch.isVisible().catch(() => false)) {
      await extSwitch.click();
      await page.waitForTimeout(500);
    }

    const scanBtn = page.locator('#extmgr-scan-pkg-btn');
    if (await scanBtn.isVisible().catch(() => false)) {
      await scanBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: path.join(outDir, '05-mobile-ext-package-responsive.png') });

    await page.close();
  }

  await browser.close();
  console.log('✅ 所有审核截图捕获完成，保存在 docs/assets/review-shots/');
})().catch((e) => {
  console.error('截图捕获失败:', e);
  process.exit(1);
});
