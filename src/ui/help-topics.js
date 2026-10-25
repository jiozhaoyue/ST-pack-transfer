/**
 * 区块「?」上下文帮助层（R-A2，2026-10-24）
 *
 * 形态：每个 `[data-wb-module]` 区块标题栏注入一枚「?」按钮，点开**锚定该标题栏**的
 * 浮层——标题 + ≤5 行要点。界面常驻说明文案保持为零（文案纪律不破），说明只活在这里与引导层。
 *
 * 契约：
 *  - `HELP_TOPICS` 是**纯数据表**（key = 模板 `data-wb-module` 值），帮助文案受同一文案铁律
 *    约束：无括号补充、无分号长句、无教学口吻（单测断言，见 test/help-topics.test.js）；
 *  - key 悬空（模板没有对应模块）= 死数据，单测红；
 *  - 浮层锚定 `.wb-sec-head`（R2 浮层必锚行），同一时刻只开一个，点外部即收。
 */

/**
 * @typedef {Object} HelpTopic
 * @property {string} title 区块名（与模板标题栏一致）
 * @property {string[]} points 要点（≤5 行，每行一个短句）
 */
export const HELP_TOPICS = Object.freeze({
  quota: Object.freeze({
    title: '配额',
    points: Object.freeze(['浏览器存储余量', '宿主存储余量', '宿主读数随平台而定']),
  }),
  source: Object.freeze({
    title: '数据包',
    points: Object.freeze(['上传本地数据包', '插件内从宿主拉取', '列表按来源分组', '同一包可导出后导回']),
  }),
  products: Object.freeze({
    title: '产物',
    points: Object.freeze(['转换与拉取的成果都在此', '列表按目标平台分组', '可下载或存入工作区', '插件内可写回宿主']),
  }),
  vault: Object.freeze({
    title: '仓',
    points: Object.freeze(['原样保存各酒馆私有格式包', '不兼容的包也能整包存放', '服务端存储为佳', '无服务端时存本机浏览器', '可导出可恢复可删除']),
  }),
  pack: Object.freeze({
    title: '打包',
    points: Object.freeze(['选目标平台', '选压缩档位', '包名可用占位符', '可分卷']),
  }),
  scope: Object.freeze({
    title: '内容',
    points: Object.freeze(['按类目勾选范围', '明细里可逐项反选', '未知项按平台规则丢弃']),
  }),
  restore: Object.freeze({
    title: '恢复',
    points: Object.freeze(['合并写入不删原有', '覆盖写入先做快照', '写入对象是当前宿主']),
  }),
  action: Object.freeze({
    title: '执行',
    points: Object.freeze(['开始当前流程', '运行中可暂停', '中止保留半成品']),
  }),
  log: Object.freeze({
    title: '日志',
    points: Object.freeze(['全部操作都有记录', '出错时先看这里', '可复制给维护者']),
  }),
});

let activeHelpPopover = null;

function closeHelpPopover() {
  if (activeHelpPopover) {
    activeHelpPopover.remove();
    activeHelpPopover = null;
  }
}

/**
 * 给 root 内所有带帮助主题的区块标题栏注入「?」按钮（幂等：重复调用不重复注入）。
 * @param {HTMLElement} root 工作台根容器（`.wb-sec-head` 的祖先）
 */
export function mountSectionHelp(root) {
  if (!root || typeof document === 'undefined') return;
  for (const section of root.querySelectorAll('[data-wb-module]')) {
    const topic = HELP_TOPICS[section.dataset.wbModule];
    // 两种标题栏：区块用 .wb-sec-head；日志台自绘 .inline-drawer-header（晚于模态创建，
    // main() 里 setupLogConsole 之后会再幂等补注一次）
    const head = section.querySelector('.wb-sec-head, .inline-drawer-header');
    if (!topic || !head || head.querySelector('.wb-help-btn')) continue;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu_button wb-help-btn';
    btn.textContent = '?';
    btn.title = '帮助';
    btn.setAttribute('aria-label', `${topic.title}帮助`);
    btn.setAttribute('aria-expanded', 'false');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeHelpPopover && activeHelpPopover.dataset.forModule === section.dataset.wbModule) {
        closeHelpPopover();
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      closeHelpPopover();

      const pop = document.createElement('div');
      pop.className = 'wb-help-popover';
      pop.dataset.forModule = section.dataset.wbModule;
      const title = document.createElement('div');
      title.className = 'wb-help-popover-title';
      title.textContent = topic.title;
      const list = document.createElement('ul');
      list.className = 'wb-help-popover-points';
      for (const point of topic.points) {
        const li = document.createElement('li');
        li.textContent = point;
        list.appendChild(li);
      }
      pop.append(title, list);
      head.appendChild(pop);
      activeHelpPopover = pop;
      btn.setAttribute('aria-expanded', 'true');

      setTimeout(() => {
        document.addEventListener('click', function onOutside(ev) {
          if (!pop.contains(ev.target)) {
            closeHelpPopover();
            btn.setAttribute('aria-expanded', 'false');
          }
        }, { once: true, capture: true });
      }, 0);
    });

    head.appendChild(btn);
  }
}

/** 关闭已打开的帮助浮层（测试接缝与外部复位用） */
export { closeHelpPopover };
