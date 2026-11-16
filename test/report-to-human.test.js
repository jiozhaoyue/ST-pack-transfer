import { describe, it, expect } from 'vitest';
import { Report, reportToHuman } from '../src/core/report.js';

/**
 * 回归守护：宿主拉取路径在转换完成后要用 `reportToHuman` 渲染报告。
 *
 * 2026-10-13 实测回归（`f30e68a` 引入）：`index.js` 调 `conversionReport.toHuman()`，
 * 但 `runConversionTask` 回主线程的是 `reportInstance.toJSON()` 的**结构化克隆** ——
 * 方法不跟过来 ⇒ `TypeError: conversionReport.toHuman is not a function`
 * ⇒ **转换跑到 100% 后导出失败，产物永不入待导出区**。
 *
 * 本测试钉住两件事：① 重构后 `toHuman()` 与 `reportToHuman()` 文本一致；
 * ② **纯对象**（无原型）也能渲染 —— 这正是回归的形态。
 */
describe('reportToHuman —— 纯对象渲染', () => {
  function makeReport() {
    const r = new Report('l', 'st');
    r.copied('characters/a.png', 100);
    r.copied('chats/b/c.jsonl', 200);
    r.dropped('thumbnails/x.png', '派生缓存', 50);
    r.synthesized('_convert/readme.txt');
    r.warn('示例警告');
    return r;
  }

  it('toHuman() 与 reportToHuman(toJSON()) 文本一致（重构不改行为）', () => {
    const r = makeReport();
    expect(r.toHuman()).toBe(reportToHuman(r.toJSON()));
  });

  it('结构化克隆后的纯对象仍能渲染 —— 回归形态本身', () => {
    const plain = JSON.parse(JSON.stringify(makeReport().toJSON()));
    expect(typeof plain.toHuman).toBe('undefined');
    const text = reportToHuman(plain);
    expect(text).toContain('转换报告: l -> st');
    expect(text).toContain('示例警告');
    expect(text).toContain('派生缓存');
  });

  it('空报告也渲染出表头与合计（不抛错）', () => {
    const text = reportToHuman(new Report('st', 'l').toJSON());
    expect(text).toContain('转换报告: st -> l');
    expect(text).toContain('合计');
  });
});
