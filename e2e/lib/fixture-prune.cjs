/**
 * 持久化 profile 的**夹具清理**（E2E 自清理，跨 spec 共用）。
 *
 * ## 为什么必须有
 *
 * 实例侧 E2E 用**持久化** Playwright 档案（`.pw-profile-dev` / `.pw-profile`），
 * 而 `#file-input` 的处理是「**总是入库**，仅在尚无源包时采纳为当前源」——
 * 每跑一轮，同一份夹具就以**新 id** 再入一条记录，`files` store 只增不减。
 *
 * 实测（2026-10-13，dev-st）：连跑数轮后暂存区累积到 **56 项**，全部是 `fixture-st.zip`。
 * 后果不是"慢一点"，而是**宿主 UI 慢到断言超时**：列表过长 ⇒ 目标行不可点
 * ⇒ `page.check` / `page.click` 30 s 超时（dev-luker 的「功能矩阵 / 聊天库补齐」两步即因此转红）。
 *
 * ⚠️ 早先版本只清**大**夹具（`fixture-pause-*` / `fixture-large-*`），漏掉了小夹具
 * ——「累积」这件事与夹具大小无关，只与**上传次数**有关。故本表按**上传面**列全。
 *
 * ## 纪律
 *
 * - 只删**本仓 E2E 自己生成**的夹具（按名精确匹配，绝不碰别的记录）；
 * - 夹具由 `fixtures/gen.js` 确定性重建 ⇒ 删除**可逆**（下一轮现场再生成）；
 * - 必须在 `resetWorkspace` 的 **reload 之前**调用，让那次重载本身就是干净的；
 * - 存储不可用时返回 `-1`，**不阻断**用例（清理只是护栏，不是被测行为）。
 *
 * @module e2e/lib/fixture-prune
 */

/** 本仓 E2E 会上传的全部夹具名（`fixtures/gen.js` 的三份 + 现场放大的三份） */
const FIXTURE_NAMES = Object.freeze([
  'fixture-st.zip',
  'fixture-l.zip',
  'fixture-tt.zip',
  'fixture-pause-st.zip',
  'fixture-pause-many-st.zip',
  'fixture-large-st.zip',
]);

/**
 * 删掉 profile 的 `files` store 里**本仓 E2E 夹具**的记录。
 *
 * @param {import('playwright').Page} page
 * @param {string[]} [names] 要删的夹具名（缺省用 {@link FIXTURE_NAMES}）
 * @returns {Promise<number>} 删除条数；`-1` 表示存储不可用（调用方不得据此判失败）
 */
async function pruneFixtures(page, names = FIXTURE_NAMES) {
  return page.evaluate(async (target) => new Promise((resolve) => {
    let req;
    try { req = window.indexedDB.open('st_zip_converter_db'); } catch { resolve(-1); return; }
    req.onerror = () => resolve(-1);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        let removed = 0;
        const cur = store.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          const rec = c.value || {};
          if (target.includes(rec.name)) { c.delete(); removed += 1; }
          c.continue();
        };
        tx.oncomplete = () => resolve(removed);
        tx.onerror = () => resolve(-1);
        tx.onabort = () => resolve(-1);
      } catch { resolve(-1); }
    };
  }), names);
}

module.exports = { FIXTURE_NAMES, pruneFixtures };
