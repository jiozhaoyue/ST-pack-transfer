/**
 * 本地单文件 HTML 产物守卫。
 *
 * 用户要求：想用 HTML 必须能明确指到可下载/可双击运行的产品。
 * 该文件由 `npm run build:offline` 生成，本地路径为 `download/ST-pack-transfer-offline.html`。
 * `download/` 现已 gitignore，对外分发改走 GitHub Release asset（由 release.yml 在 CI 构建）。
 * 因此：产物存在时执行全部单文件性校验；产物不存在时不让 CI 失败，输出跳过原因后以退出码 0 结束。
 */
import { readFile, stat } from 'node:fs/promises';

const FILE = 'download/ST-pack-transfer-offline.html';
const MIN_BYTES = 500 * 1024;

const problems = [];
let info = null;
try {
  info = await stat(FILE);
} catch {
  info = null;
}

// download/ 已 gitignore，CI 未跑 build:offline 时不应因产物缺失而失败。
if (!info) {
  console.log(`本地未构建 offline 产物 ${FILE}，跳过（Release 由 CI 生成）。`);
  process.exit(0);
}

{
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
