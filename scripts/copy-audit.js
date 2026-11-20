/**
 * 文案审查（AC-31 / R6.6 / R10.4）：面板正文的静态体检。
 *
 * 说明性内容允许出现的地方只有两处：`?` 浮层（`help.*`）与教程（`tutorial.*`）。
 * 危险操作确认按钮的 title（`*Hint`）也只许短断言：Hint 不再整体豁免，仍受下列规则约束。其余面板正文受以下规则约束：
 *
 *   1. 括号说明：中文值里出现「（…）」——说明只许活在 `?` 与教程里；
 *   2. 分号长句：中文值含「；」且长度 > 16；
 *   3. 同一信息两处承载：同一语言、**同一区域前缀**（`chart.`/`zones.`/…）下
 *      两个不同 key 的长文案完全相同（> 10 字）。
 *   4. Hint 单行过长 / 逗号连词堆叠：Hint 每行 > HINT_LONG_LINE 或单行含 >=2 个中文逗号，
 *      视为说明性长句而非短断言（G-16 收紧，阈值可调）。
 *
 * 用法：`node scripts/copy-audit.js [--strict]`；`--strict` 时有问题即 exit 1。
 */
import { pathToFileURL } from 'node:url';
import zhCN from '../src/i18n/locales/zh-CN.js';
import enUS from '../src/i18n/locales/en-US.js';

const LOCALES = { 'zh-CN': zhCN, 'en-US': enUS };
const LONG_VALUE = 10;
const LONG_SENTENCE = 16;
/** G-16 Hint 收紧阈值：Hint 每行超过该数的中文字符即视为说明性长句（可调）。 */
const HINT_LONG_LINE = 16;
const CJK = /[一-鿿]/g;
const cjkLen = (text) => (text.match(CJK) || []).length;

/** 允许出现说明性内容 / 短标记的 key。Hint 不再无条件放行，仍走长度/括号/连词检查。 */
const ALLOWED = [
  /^help\./,
  /^tutorial\./,
  /^log\./,
  /^target\.hostSuffix$/,
];

const BENIGN_PAREN = /^[（(]\s*(\{[a-zA-Z]+\}|[0-9]+|MB|GB|KB|B|s|m|%|\.[a-z]+)\s*[)）]$/;

const isAllowed = (key) => ALLOWED.some((re) => re.test(key));
const areaOf = (key) => key.split('.')[0];

/**
 * @param {string} locale
 * @param {Record<string,string>} dict
 * @returns {Array<{locale:string,key:string,rule:string,text:string,other?:string}>}
 */
export function auditLocale(locale, dict) {
  const issues = [];
  const seen = new Map();

  for (const [key, value] of Object.entries(dict)) {
    if (isAllowed(key)) continue;
    const text = String(value);

    if (locale === 'zh-CN') {
      for (const match of text.matchAll(/[（(][^）)]*[)）]/g)) {
        if (!BENIGN_PAREN.test(match[0])) {
          issues.push({ locale, key, rule: 'paren', text: match[0] });
        }
      }
      if (text.includes('；') && text.length > LONG_SENTENCE) {
        issues.push({ locale, key, rule: 'semicolon', text });
      }
      // Hint 收紧：不再整体豁免，按行检查长句与逗号连词堆叠（G-16）。
      if (/Hint$/.test(key)) {
        const lines = text.split('\n');
        if (lines.some((line) => cjkLen(line) > HINT_LONG_LINE)) {
          issues.push({ locale, key, rule: 'hint-long', text });
        }
        if (lines.some((line) => (line.match(/，/g) || []).length >= 2)) {
          issues.push({ locale, key, rule: 'hint-conjunction', text });
        }
      }
    }

    if (text.length > LONG_VALUE) {
      const fingerprint = `${areaOf(key)}::${text}`;
      if (seen.has(fingerprint)) {
        issues.push({ locale, key, rule: 'duplicate', text, other: seen.get(fingerprint) });
      } else {
        seen.set(fingerprint, key);
      }
    }
  }
  return issues;
}

export function auditAll() {
  return Object.entries(LOCALES).flatMap(([locale, dict]) => auditLocale(locale, dict));
}

function main() {
  const issues = auditAll();
  if (!issues.length) {
    console.log('文案审查通过：面板正文无括号说明、无分号长句、无同区重复长文案');
    return;
  }
  for (const issue of issues) {
    const where = issue.other ? `（与 ${issue.other} 重复）` : '';
    console.error(`${issue.locale}:${issue.key} [${issue.rule}]${where} ${issue.text.slice(0, 60)}`);
  }
  console.error(`\n文案审查：${issues.length} 处待处理。说明性内容请移入 ? 浮层或教程。`);
  if (process.argv.includes('--strict')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
