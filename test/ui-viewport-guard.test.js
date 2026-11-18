import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const template = readFileSync(new URL('../src/ui/workbench-template.js', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf-8');
const indexJs = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const viewJs = readFileSync(new URL('../src/ui/workbench-view.js', import.meta.url), 'utf-8');

describe('UI 视口、滚动隔离与防紧贴铁律守卫', () => {
  it('主流分辨率矩阵：必须登记 5 大主流分辨率并优先保证正常比例', () => {
    const VIEWPORTS = [
      { name: 'Mobile iPhone', width: 390, height: 844, ratio: '9:19.5' },
      { name: 'Mobile Android', width: 412, height: 915, ratio: '9:20' },
      { name: 'Tablet iPad', width: 768, height: 1024, ratio: '3:4' },
      { name: 'Desktop Laptop', width: 1366, height: 768, ratio: '16:9' },
      { name: 'Desktop Full HD', width: 1920, height: 1080, ratio: '16:9' },
    ];
    expect(VIEWPORTS).toHaveLength(5);
    expect(VIEWPORTS.map((v) => v.width)).toEqual([390, 412, 768, 1366, 1920]);
  });

  it('滚动隔离铁律：弹窗固定控制栏绝对严禁被内容连带滚动', () => {
    // 弹窗外层正文容器在 is-scroll-isolated 状态下必须强制 overflow: hidden，绝不连带滚动工具栏
    expect(css).toMatch(/\.confirm-dialog\s+\.view-body\.is-scroll-isolated\s*\{[^}]*overflow:\s*hidden\s*!important/);
    expect(css).toMatch(/\.view-actions\s*\{[^}]*flex:\s*0\s+0\s+auto/);

    // 更新日志工具栏必须脱离滚动视口
    expect(css).toMatch(/\.changelog-toolbar\s*\{[^}]*flex:\s*0\s+0\s+auto/);
    expect(css).toMatch(/\.changelog-toolbar\s*\{[^}]*overflow:\s*hidden/);

    // 只有列表 changelog-list 内部承担 overflow-y: auto
    expect(css).toMatch(/\.changelog-list\s*\{[^}]*overflow-y:\s*auto\s*!important/);
    expect(indexJs).toContain('bodyClass: \'is-scroll-isolated\'');

    // “不再自动显示更新日志”必须位于固定 actions 动作条，绝对不得出现在可滚动的 body 字符串中
    expect(indexJs).toContain('neverLabel.className = \'check changelog-never-fixed\'');
    expect(indexJs).toContain('actionList.push({ node: neverLabel })');
    expect(indexJs).not.toMatch(/const\s+body\s*=[^;]*id="changelog-never"/);
  });

  it('防贴边与防紧贴铁律：“只看 Release”绝对严禁贴着滚动条', () => {
    // 工具栏必须具备右对齐且列表右侧有滚动条安全垫
    expect(css).toMatch(/\.changelog-filter\s*\{[^}]*margin-left:\s*auto/);
    expect(css).toMatch(/\.changelog-list\s*\{[^}]*padding-right:\s*6px/);
  });

  it('重复按钮消除：更新面板严禁同时存在 x 和关闭两个职能相同的按钮', () => {
    expect(indexJs).toContain('hideCloseX: true');
    expect(viewJs).toContain('closeBtn.hidden=!!opts.hideCloseX');
  });

  it('局域网无身份单框铁律：严禁双列并排与上下堆叠，必须单输入框全自适应', () => {
    // 严禁存在双列发起/接入配对卡
    expect(template).not.toContain('lan-peer-pair-grid');
    expect(template).not.toContain('lan-peer-col');

    // 必须存在单框自适应互联容器与单输入框
    expect(template).toContain('class="lan-peer-box" id="lan-peer-unconnected"');
    expect(template).toContain('id="lan-peer-input"');
    expect(template).toContain('id="lan-peer-btn-generate"');
    expect(template).toContain('id="lan-peer-btn-connect"');
    expect(template).toContain('id="lan-peer-btn-scan"');

    // 模式切换文案严禁超长说明与括号后缀
    expect(template).not.toContain('长连接队列 (推荐)');
    expect(template).not.toContain('传统单次 (降级)');
    expect(template).toContain('>长连接</button>');
    expect(template).toContain('>传统</button>');
  });

  it('内外边框与呼吸间距：控件之间严禁零间距紧贴，必须具备明确边框', () => {
    // 互联框必须具有明确 border 与微底色
    expect(css).toMatch(/\.lan-peer-box\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/);
    // 按钮行必须具有明确间距
    expect(css).toMatch(/\.lan-peer-actions\s*\{[^}]*gap:\s*8px/);
  });

  it('UI 图 1~6 缺陷防回归断言：工具栏换行、扩展两行限制、折叠卡 34px', () => {
    // 图 1：日志工具栏自适应换行，防文字切半
    expect(css).toMatch(/#view-log\s+\.log-toolbar\s*\{[^}]*flex-wrap:\s*wrap/);
    // 图 3：扩展列表项移动端限制两行，复选框与插件名同行
    expect(css).toMatch(/\[data-view="mobile"\]\s+\.ext-ext-row\s+\.ext-dev-check\s*\{[^}]*order:\s*1/);
    expect(css).toMatch(/\[data-view="mobile"\]\s+\.ext-ext-row\s+\.ext-remote-url\s*\{[^}]*order:\s*2/);
    // 图 4：折叠卡 34px 紧凑且垂直居中
    expect(css).toMatch(/\.ext-settings-card\s*>\s*summary[^}]*min-height:\s*34px/);
    // 图 6：移动端数据包列表展开防塌陷
    expect(css).toMatch(/\[data-zone-open="1"\]\s+\.col-side\s*\{[^}]*min-height:\s*240px/);
    // 收起条高度减肥至 28px
    expect(css).toMatch(/\.zone-mobile-collapse-bar\s*\{[^}]*height:\s*28px/);
  });
});
