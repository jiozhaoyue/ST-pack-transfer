/**
 * 对外单文件 HTML 下载路径守卫。
 *
 * 用户要求：想用 HTML 必须能明确指到仓库里的可下载路径。
 * 该文件由 `npm run build:offline` 生成，路径固定为 `download/ST-pack-transfer-offline.html`。
 */
import { readFile, stat } from 'node:fs/promises';

const FILE = 'download/ST-pack-transfer-offline.html';
const MIN_BYTES = 500 * 1024;

const problems = [];
let info = null;
try {
  info = await stat(FILE);
} catch {
  problems.push(`缺少 ${FILE}（运行 npm run build:offline 生成）`);
}

if (info) {
  if (info.size < MIN_BYTES) problems.push(`${FILE} 体积异常：${info.size} 字节`);
  const html = await readFile(FILE, 'utf8');
  if (!/^<!DOCTYPE html>/i.test(html)) problems.push(`${FILE} 不是完整 HTML`);
  if (!html.includes('ST-pack-transfer')) problems.push(`${FILE} 缺少项目标题`);
  if (!html.includes('__ST_ZIP_OFFLINE__') && !html.includes('script')) {
    problems.push(`${FILE} 未包含脚本内容，可能不是自包含单文件`);
  }
}

if (problems.length) {
  console.error(`单文件 HTML 下载路径守卫失败（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`单文件 HTML 下载路径守卫通过：${FILE}（${(info.size / 1024 / 1024).toFixed(2)} MB）`);
