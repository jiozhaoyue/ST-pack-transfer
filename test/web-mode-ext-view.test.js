import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { logger, LOG_LEVELS } from '../src/core/logger.js';
import zhCN from '../src/i18n/locales/zh-CN.js';
import enUS from '../src/i18n/locales/en-US.js';

describe('Web模式扩展视图与分级日志契约', () => {
  const viewPath = path.resolve(__dirname, '../src/ui/workbench-view.js');
  const cssPath = path.resolve(__dirname, '../style.css');
  const indexPath = path.resolve(__dirname, '../index.js');
  const viewContent = fs.readFileSync(viewPath, 'utf-8');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');

  it('契约 1：renderExtInstalled 宿主扩展拉取仅限宿主模式，Web模式不阻断且不卡在loading', () => {
    // 宿主扩展只在 isHost 且 !hasCached 时拉取
    expect(viewContent).toMatch(/if\s*\(\s*isHost\s*\)\s*\{[\s\S]*?hasCached[\s\S]*?listHostExtensions/);
    // Web模式或数据包模式下，如果未选包，必须展示未选包提示
    expect(viewContent).toContain('ext-pkg-empty-hint');
    expect(viewContent).toContain('t(\'extmgr.noPackageSelected\')');
    expect(viewContent).toContain('t(\'extmgr.noneInPackage\')');
  });

  it('契约 2：数据包扩展解析与选包全链路记录分级日志（INFO, SUCCESS, WARN, ERROR）', () => {
    // 未选包记录 INFO
    expect(viewContent).toMatch(/logger\.info\(.*extWebNoPackageSelected/);
    // 读包成功记录 SUCCESS
    expect(viewContent).toMatch(/logger\.success\(.*extPkgReadSuccess/);
    // 空包记录 WARN
    expect(viewContent).toMatch(/logger\.warn\(.*extPkgReadEmpty/);
    // index.js 订阅 logger 时原样透传 SUCCESS，严禁降级为 INFO
    expect(indexContent).toMatch(/logger\.subscribe\(\(entry\)\s*=>\s*\{[\s\S]*?view\.pushLog\(entry\.level,\s*entry\.message/);
    // 桥接必须透传完整 entry（detail / id / timeMs），否则导出后无法溯源
    expect(indexContent).toMatch(/view\.pushLog\(entry\.level,\s*entry\.message,\s*\{\s*id:\s*entry\.id,\s*timeMs:\s*entry\.timeMs,\s*detail:\s*entry\.detail\s*\}/);
    expect(indexContent).not.toContain("entry.level === 'SUCCESS' ? 'INFO'");
  });

  it('契约 3：i18n 多语言词条完整覆盖未选包提示与日志', () => {
    expect(zhCN['extmgr.noPackageSelected']).toBe('未选择数据包');
    expect(zhCN['extmgr.noneInPackage']).toBe('当前数据包内未包含扩展条目');
    expect(zhCN['log.extPkgReadSuccess']).toContain('成功读取数据包');
    expect(enUS['extmgr.noPackageSelected']).toBe('No package selected');
    expect(enUS['extmgr.noneInPackage']).toBe('No extensions found in this package');
    expect(enUS['log.extPkgReadSuccess']).toContain('Successfully read extensions');
  });

  it('契约 4：CSS 样式具备平滑过渡、入场动画与减少动画适配', () => {
    // 扩展视图具备淡入动画
    expect(cssContent).toMatch(/\.extension-view:not\(\[hidden\]\)\s*\{[^}]*animation:\s*extViewFadeIn/);
    // 未选包提示卡片具备平滑入场动效与呼吸微动
    expect(cssContent).toMatch(/\.ext-empty\.ext-pkg-empty-hint/);
    expect(cssContent).toMatch(/@keyframes extEmptyFadeIn/);
    // 扩展行具备入场动画与微抬过渡
    expect(cssContent).toMatch(/\.ext-pkg-row\s*\{[^}]*animation:\s*extRowFadeIn/);
    expect(cssContent).toMatch(/\.ext-ext-row:hover\s*\{[^}]*transform:\s*translateY\(-1px\)/);
    // 媒体查询适配 prefers-reduced-motion
    expect(cssContent).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('契约 5：logger 基础能力支持结构化分级与订阅广播', () => {
    logger.clear();
    const received = [];
    const unsub = logger.subscribe((e) => received.push(e));

    logger.info('信息测试');
    logger.warn('警告测试');
    logger.error('错误测试');
    logger.success('成功测试');

    expect(received.length).toBe(4);
    expect(received.map((e) => e.level)).toEqual([
      LOG_LEVELS.INFO,
      LOG_LEVELS.WARN,
      LOG_LEVELS.ERROR,
      LOG_LEVELS.SUCCESS,
    ]);

    unsub();
  });

  it('契约 6：云端仓库具体配置置顶内嵌S3/WebDAV带图标切换，随后为操作卡，底部为策略卡', () => {
    const templatePath = path.resolve(__dirname, '../src/ui/workbench-template.js');
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // 1. S3/WebDAV 切换按钮内嵌在云存储配置卡片 Header 中，取代原有静态标题并带图标
    expect(templateContent).toMatch(/<div class=["'][^"']*cloud-card-header[^"']*cloud-provider-header[^"']*["'][\s\S]*?id=["']cloud-provider-tabs["']/);
    expect(templateContent).toMatch(/data-cloud-provider=["']s3["'][\s\S]*?<i class=["'][^"']*fa-cloud/);
    expect(templateContent).toMatch(/data-cloud-provider=["']webdav["'][\s\S]*?<i class=["'][^"']*fa-network-wired/);

    // 2. DOM 顺序验证：配置卡 (cloud-storage-config-card) -> 操作卡 (cloud-action-card) -> 策略卡 (cloud-strategy-card)
    const configPos = templateContent.indexOf('cloud-storage-config-card');
    const actionPos = templateContent.indexOf('cloud-action-card');
    const strategyPos = templateContent.indexOf('cloud-strategy-card');
    expect(configPos).toBeGreaterThan(-1);
    expect(actionPos).toBeGreaterThan(configPos);
    expect(strategyPos).toBeGreaterThan(actionPos);

    // 3. CSS 样式具有圆角、包裹与高对比度按钮
    expect(cssContent).toMatch(/\.cloud-card\s*\{[^}]*border-radius:\s*10px/);
    expect(cssContent).toMatch(/\.cloud-btn-primary\s*\{[^}]*font-weight:\s*650/);
  });

  it('契约 7：transfer/WebDAV 视图下工具栏提示为勾选目标包，且卡片点击联动勾选', () => {
    // 工具栏根据 isTransferView 切换提示，彻底移除误导的“外框显示”
    expect(viewContent).toMatch(/isTransferView[\s\S]*?selTransferHintShort/);

    // 卡片点击在 transfer.open 下直接切换 selectedPkgs 勾选并打印日志
    expect(viewContent).toMatch(/if\s*\(\s*state\.transfer\.open\s*\)\s*\{[\s\S]*?state\.selectedPkgs\.has\(id\)[\s\S]*?pkgChecked/);
  });
});

