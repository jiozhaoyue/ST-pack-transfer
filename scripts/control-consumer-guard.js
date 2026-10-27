/**
 * 控件消费点守卫（2026-09-25）
 *
 * 背景：`#incremental-mode-check`（J 区「增量合并」）长期存在，但**其值从不被任何代码读取**——
 * 它有 `getElementById`、有 `addEventListener`、有折叠摘要文字，**看不出问题**；
 * 勾选它只让摘要多四个字，**行为零变化**。该控件已于 `09-25-transfer-pack-optimize` 移除。
 *
 * **为何不能靠「搜不到引用」来防**：那个死开关**确实被引用**（元素查找 / 事件绑定 / 摘要文字），
 * 弱判据抓不住它。可靠做法是**强制显式声明**：新增控件时作者必须写下「谁读它的值」，
 * 写不出来就说明控件没有存在理由。
 *
 * ⚠ **本守卫的局限（不要误读）**：它只强制「声明存在」，**不能验证声明为真**。
 * 声明表写错也能通过。它是「提醒有人必须想过这件事」的机制，不是「控件一定有消费点」的证明。
 *
 * 违规时退出码 1，输出 `文件:行号`（沿用 css-scope.js / dom-injection-guard.js 约定）。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** 视为「交互控件」的标签——只有这些需要用户操作，故必须有消费点 */
const CONTROL_TAGS = ['button', 'input', 'select', 'textarea'];

/**
 * 控件 → 消费点声明表。
 *
 * 键的三种形态：
 * - `<id>`：带 `id` 的控件（绝大多数）
 * - `name:<name>`：**无 id** 的单选组（按 name 分组读取，如 `input[name=…]:checked`）
 * - `group:.<class>`：**既无 id 也无 name** 的控件，靠类选择器批量绑定（如 `.btn-quick` 事件委托）
 *
 * `group:` 键只对「无 id 且无 name」的控件生效，**不能用来兜底有 id 的控件**——
 * 否则写一条 `group:.menu_button` 就能绕过整张表。
 */
export const CONTROL_CONSUMERS = Object.freeze({
  'btn-close': 'src/ui/workbench-view.js — 事件绑定 / 读取（btn-close）',
  'btn-guide': 'src/ui/workbench-view.js — 事件绑定 / 读取（btn-guide）',
  'btn-log': 'src/ui/workbench-view.js — 事件绑定 / 读取（btn-log）',
  'btn-locale': 'index.js / demo 外壳 — 切换 zh-CN / en-US',
  'btn-settings': 'src/ui/workbench-view.js — 事件绑定 / 读取（btn-settings）',
  'file-input': 'src/ui/workbench-view.js — 事件绑定 / 读取（file-input）',
  'filename-template': 'src/ui/workbench-view.js — 事件绑定 / 读取（filename-template）',
  'log-clear': 'src/ui/workbench-view.js — 事件绑定 / 读取（log-clear）',
  'log-close': 'src/ui/workbench-view.js — 事件绑定 / 读取（log-close）',
  'log-copy': 'src/ui/workbench-view.js — 事件绑定 / 读取（log-copy）',
  'split-input': 'src/ui/workbench-view.js — 事件绑定 / 读取（split-input）',
  'compression-select': 'src/ui/workbench-view.js — change 读取压缩档位并透传给 getExportOptions',
  'btn-matrix': 'src/ui/workbench-view.js — 打开互传矩阵弹窗（通道列表 + 原生拉取）',
  'btn-swap': 'src/ui/workbench-view.js — 交换收发方向并通知控制器重置会话',
  'target-btn': 'src/ui/workbench-view.js — 事件绑定 / 读取（target-btn）',
  'tutorial-adv': 'src/ui/workbench-view.js — 事件绑定 / 读取（tutorial-adv）',
  'tutorial-next': 'src/ui/workbench-view.js — 事件绑定 / 读取（tutorial-next）',
  'tutorial-prev': 'src/ui/workbench-view.js — 事件绑定 / 读取（tutorial-prev）',
  'tutorial-skip': 'src/ui/workbench-view.js — 事件绑定 / 读取（tutorial-skip）',
  'group:.help-btn': 'src/ui/workbench-view.js — 事件委托',
  'group:.zone-tab': 'src/ui/workbench-view.js — 事件委托',
  'group:.seg-btn': 'src/ui/workbench-view.js — 事件委托',
  'group:.log-level-btn': 'src/ui/workbench-view.js — 事件委托',
  'file-input': 'index.js — change 读取上传的 zip',
  'lan-toggle': 'src/ui/workbench-view.js — 展开/收起局域网区块',
  'lan-btn-generate': 'src/ui/workbench-view.js — 调 actions.lan.generate（读取已勾选导入包）',
  'lan-send-code': 'src/ui/workbench-view.js — 展示取件码 / 复制',
  'lan-btn-copy-send': 'src/ui/workbench-view.js — 读取 lan-send-code 复制',
  'lan-btn-retry': 'src/ui/workbench-view.js — 调 actions.lan.retry',
  'lan-btn-cancel': 'src/ui/workbench-view.js — 调 actions.lan.cancel',
  'lan-btn-scan-answer': 'src/ui/workbench-view.js — 相机扫应答码',
  'lan-answer-input': 'src/ui/workbench-view.js — 读取应答码并 applyAnswer',
  'lan-btn-apply-answer': 'src/ui/workbench-view.js — 读取 lan-answer-input 开始传输',
  'lan-btn-scan-offer': 'src/ui/workbench-view.js — 相机扫取件码',
  'lan-offer-input': 'src/ui/workbench-view.js — 读取取件码并 acceptOffer',
  'lan-btn-accept': 'src/ui/workbench-view.js — 读取 lan-offer-input 生成应答码',
  'lan-recv-code': 'src/ui/workbench-view.js — 展示应答码 / 复制',
  'lan-btn-copy-recv': 'src/ui/workbench-view.js — 读取 lan-recv-code 复制',
  'lan-btn-abandon': 'src/ui/workbench-view.js — 调 actions.lan.abandon',
  'lan-scan-cancel': 'src/ui/workbench-view.js — 停止相机并收起扫码区',
});

/** 从模板源码提取全部交互控件 */
export function extractControls(template) {
  const re = new RegExp(`<(${CONTROL_TAGS.join('|')})\\b([^>]*)>`, 'g');
  const controls = [];
  let match;
  while ((match = re.exec(template)) !== null) {
    const attrs = match[2];
    const id = (attrs.match(/id="([^"]+)"/) || [])[1] || null;
    const name = (attrs.match(/name="([^"]+)"/) || [])[1] || null;
    const classAttr = (attrs.match(/class="([^"]+)"/) || [])[1] || '';
    controls.push({
      line: template.slice(0, match.index).split('\n').length,
      tag: match[1],
      id,
      name,
      classes: classAttr.split(/\s+/).filter(Boolean),
    });
  }
  return controls;
}

/**
 * 校验控件消费点声明
 * @param {{template: string, templateFile?: string, consumers?: Record<string,string|null>}} input
 * @returns {Array<{file: string, line: number, control: string, message: string}>}
 */
export function checkControlConsumers({
  template,
  templateFile = 'src/ui/workbench-template.js',
  consumers = CONTROL_CONSUMERS,
}) {
  const violations = [];
  const controls = extractControls(template);
  const used = new Set();

  // group: 键（仅对无 id 且无 name 的控件生效）
  const groupKeys = Object.entries(consumers)
    .filter(([key]) => key.startsWith('group:.'))
    .map(([key]) => ({ key, cls: key.slice('group:.'.length) }));

  for (const c of controls) {
    const label = c.id || (c.name ? `name=${c.name}` : `<${c.tag} class="${c.classes.join(' ')}">`);

    if (c.id) {
      if (!Object.prototype.hasOwnProperty.call(consumers, c.id)) {
        violations.push({
          file: templateFile,
          line: c.line,
          control: c.id,
          message: `控件 id="${c.id}" 未在 CONTROL_CONSUMERS 中声明消费点——`
            + '请写明「谁读它的值」；写不出来说明该控件没有存在理由（历史事故：死控件 #incremental-mode-check）',
        });
      } else {
        used.add(c.id);
      }
      continue;
    }

    if (c.name) {
      const key = `name:${c.name}`;
      if (!Object.prototype.hasOwnProperty.call(consumers, key)) {
        violations.push({
          file: templateFile,
          line: c.line,
          control: key,
          message: `单选组 name="${c.name}" 未声明消费点（键名应为 "${key}"）`,
        });
      } else {
        used.add(key);
      }
      continue;
    }

    // 既无 id 也无 name：必须由**恰好一个** group: 键覆盖
    const matched = groupKeys.filter((g) => c.classes.includes(g.cls));
    // 匹配到即算「该键非僵尸」——即使因为歧义而报了违规，它也确有对应控件
    for (const g of matched) used.add(g.key);

    if (matched.length === 0) {
      violations.push({
        file: templateFile,
        line: c.line,
        control: label,
        message: '控件既无 id 也无 name，且没有被任何 group:. 声明覆盖——'
          + '请给它 id，或声明绑定它的类选择器（如 group:.btn-quick）',
      });
    } else if (matched.length > 1) {
      violations.push({
        file: templateFile,
        line: c.line,
        control: label,
        message: `控件被多个 group: 声明覆盖（${matched.map((g) => g.key).join(', ')}）——请只保留一个`,
      });
    }
  }

  // 僵尸条目：声明了但模板中已无对应控件
  for (const key of Object.keys(consumers)) {
    if (consumers[key] === null) continue; // null 为占位说明，不参与
    if (!used.has(key)) {
      violations.push({
        file: templateFile,
        line: 1,
        control: key,
        message: `CONTROL_CONSUMERS 中的 "${key}" 在模板里已无对应控件——`
          + '僵尸条目请删除（声明表腐烂比不写更误导）',
      });
    }
  }

  return violations;
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const templateFile = 'src/ui/workbench-template.js';
  const template = await readFile(`${root}${templateFile}`, 'utf8');

  const violations = checkControlConsumers({ template, templateFile });

  if (violations.length) {
    for (const item of violations) {
      console.error(`${item.file}:${item.line}: [${item.control}] ${item.message}`);
    }
    console.error(`\n控件消费点守卫未通过：${violations.length} 处违规`);
    process.exitCode = 1;
    return;
  }

  const declared = Object.values(CONTROL_CONSUMERS).filter((v) => v !== null).length;
  const total = extractControls(template).length;
  console.log(
    `控件消费点守卫通过：${total} 个交互控件全部有消费点声明（${templateFile}）`,
  );
  console.log('  注：本守卫只强制「声明存在」，不验证声明为真。');
  console.log(`  声明条目：${declared}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
