/**
 * 在不重写整包的前提下，向已有 ZIP 追加一个 **Store（不压缩）** 条目。
 *
 * 用途：Luker 宿主只要 selection.settings=true 就会把 `backups/` 历史快照一起打包
 * （本机实测 2.5GB/308 个文件）。插件改为 `settings:false` 拉取后，单独从
 * `/api/settings/get` 取设置并在这里拼回 `settings.json`。
 *
 * 关键点：旧条目字节一个都不动 —— 只追加「新条目 + 新版中央目录 + 新 EOCD」。
 * 因此 2GB 级包也只需写 ~22MB 设置内容与几百 KB 目录，不做全量拷贝/重压缩。
 *
 * 返回的计划对象供两种落点复用：
 *  - Blob：用 `slice` 懒拼接（内存路径，不复制旧字节）；
 *  - OPFS：`createWritable({ keepExistingData: true })` + `seek(fileSize)` 追加写。
 */

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c >>> 0;
  }
  return crcTable;
}

/**
 * 标准 CRC-32（ZIP 使用）。
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc32(bytes) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 0x1f) << 11)
      | ((date.getMinutes() & 0x3f) << 5)
      | ((Math.floor(date.getSeconds() / 2)) & 0x1f),
    day: (((year - 1980) & 0x7f) << 9)
      | (((date.getMonth() + 1) & 0xf) << 5)
      | (date.getDate() & 0x1f),
  };
}

function readU16(view, offset) {
  return view.getUint16(offset, true);
}

function readU32(view, offset) {
  return view.getUint32(offset, true);
}

function readU64(view, offset) {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 0x100000000 + lo;
}

function u64(value) {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, value % 0x100000000, true);
  view.setUint32(4, Math.floor(value / 0x100000000), true);
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function findEocd(view, tailBytes) {
  const min = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= min; i -= 1) {
    if (readU32(view, i) !== EOCD_SIG) continue;
    const commentLen = readU16(view, i + 20);
    if (i + 22 + commentLen === view.byteLength) return i;
  }
  return -1;
}

function buildCentralEntry({ nameBytes, crc, size, offset, time, day }) {
  const needsOffset64 = offset > U32_MAX;
  const extraParts = [];
  if (needsOffset64) {
    const extra = new Uint8Array(12);
    const ev = new DataView(extra.buffer);
    ev.setUint16(0, 0x0001, true);
    ev.setUint16(2, 8, true);
    extra.set(u64(offset), 4);
    extraParts.push(extra);
  }
  const extraBytes = concatBytes(extraParts);
  const out = new Uint8Array(46 + nameBytes.length + extraBytes.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, CENTRAL_SIG, true);
  view.setUint16(4, needsOffset64 ? 45 : 20, true);
  view.setUint16(6, needsOffset64 ? 45 : 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, day, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, extraBytes.length, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, needsOffset64 ? U32_MAX : offset, true);
  out.set(nameBytes, 46);
  out.set(extraBytes, 46 + nameBytes.length);
  return out;
}

function buildZip64Trailer({ z64Offset, entries, cdSize, cdOffset }) {
  const z64 = new Uint8Array(56);
  const zv = new DataView(z64.buffer);
  zv.setUint32(0, ZIP64_EOCD_SIG, true);
  zv.setUint32(4, 44, true);
  zv.setUint16(12, 45, true);
  zv.setUint16(14, 45, true);
  zv.setUint32(16, 0, true);
  zv.setUint32(20, 0, true);
  z64.set(u64(entries), 24);
  z64.set(u64(entries), 32);
  z64.set(u64(cdSize), 40);
  z64.set(u64(cdOffset), 48);

  const locator = new Uint8Array(20);
  const lv = new DataView(locator.buffer);
  lv.setUint32(0, ZIP64_LOCATOR_SIG, true);
  lv.setUint32(4, 0, true);
  locator.set(u64(z64Offset), 8);
  lv.setUint32(16, 1, true);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(8, U16_MAX, true);
  ev.setUint16(10, U16_MAX, true);
  ev.setUint32(12, U32_MAX, true);
  ev.setUint32(16, U32_MAX, true);
  return concatBytes([z64, locator, eocd]);
}

/**
 * 计算追加一个 Store 条目后的完整写入计划。
 *
 * @param {Uint8Array} tailBytes 文件尾部（至少覆盖 EOCD/ZIP64 EOCD，建议 128KB）
 * @param {number} fileSize 原文件总字节数
 * @param {{name: string, data: Uint8Array, mtime?: Date}} entry
 * @returns {{
 *   appendAt: number,
 *   localRecord: Uint8Array,
 *   cdOffset: number,
 *   cdSize: number,
 *   centralEntry: Uint8Array,
 *   trailer: Uint8Array,
 *   newSize: number,
 *   entries: number,
 *   newCdOffset: number,
 *   newCdSize: number,
 * }}
 */
export function planZipAppend(tailBytes, fileSize, entry) {
  const nameBytes = new TextEncoder().encode(entry.name);
  const data = entry.data;
  if (!nameBytes.length || nameBytes.length > U16_MAX) {
    throw new Error('ZIP 追加条目名长度非法');
  }
  if (data.length > U32_MAX) {
    throw new Error('ZIP 追加条目超过 4GB，当前实现不支持');
  }

  const view = new DataView(tailBytes.buffer, tailBytes.byteOffset, tailBytes.byteLength);
  const tailStart = fileSize - tailBytes.length;
  const eocdPos = findEocd(view, tailBytes);
  if (eocdPos < 0) throw new Error('ZIP 尾部缺少有效 EOCD');
  const eocdAbs = tailStart + eocdPos;

  let entries = readU16(view, eocdPos + 10);
  let cdSize = readU32(view, eocdPos + 12);
  let cdOffset = readU32(view, eocdPos + 16);
  let cdEndAbs = eocdAbs;

  if (eocdPos >= 20 && readU32(view, eocdPos - 20) === ZIP64_LOCATOR_SIG) {
    const z64Offset = readU64(view, eocdPos - 12);
    const z64Pos = z64Offset - tailStart;
    if (z64Pos < 0 || z64Pos + 56 > tailBytes.length) {
      throw new Error('ZIP64 目录位置不在可读尾部范围内');
    }
    if (readU32(view, z64Pos) !== ZIP64_EOCD_SIG) {
      throw new Error('ZIP64 EOCD 签名不匹配');
    }
    entries = readU64(view, z64Pos + 32);
    cdSize = readU64(view, z64Pos + 40);
    cdOffset = readU64(view, z64Pos + 48);
    cdEndAbs = z64Offset;
  }

  if (cdOffset < 0 || cdSize < 0 || cdOffset + cdSize !== cdEndAbs) {
    throw new Error('ZIP 中央目录偏移与文件尾部不连续（可能含前置数据）');
  }
  if (cdEndAbs > fileSize) throw new Error('ZIP 中央目录越过文件末尾');

  const { time, day } = dosDateTime(entry.mtime || new Date());
  const crc = crc32(data);
  const appendAt = fileSize;

  const localRecord = concatBytes([
    (() => {
      const header = new Uint8Array(30);
      const hv = new DataView(header.buffer);
      hv.setUint32(0, LOCAL_SIG, true);
      hv.setUint16(4, 20, true);
      hv.setUint16(6, 0x0800, true);
      hv.setUint16(8, 0, true);
      hv.setUint16(10, time, true);
      hv.setUint16(12, day, true);
      hv.setUint32(14, crc, true);
      hv.setUint32(18, data.length, true);
      hv.setUint32(22, data.length, true);
      hv.setUint16(26, nameBytes.length, true);
      hv.setUint16(28, 0, true);
      return header;
    })(),
    nameBytes,
    data,
  ]);

  const newCdOffset = fileSize + localRecord.length;
  const centralEntry = buildCentralEntry({
    nameBytes, crc, size: data.length, offset: appendAt, time, day,
  });
  const newCdSize = cdSize + centralEntry.length;

  let trailer;
  if (entries + 1 > U16_MAX || newCdOffset > U32_MAX || newCdSize > U32_MAX
      || appendAt > U32_MAX) {
    trailer = buildZip64Trailer({
      z64Offset: newCdOffset + newCdSize,
      entries: entries + 1,
      cdSize: newCdSize,
      cdOffset: newCdOffset,
    });
  } else {
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, EOCD_SIG, true);
    ev.setUint16(8, entries + 1, true);
    ev.setUint16(10, entries + 1, true);
    ev.setUint32(12, newCdSize, true);
    ev.setUint32(16, newCdOffset, true);
    ev.setUint16(20, 0, true);
    trailer = eocd;
  }

  return {
    appendAt,
    localRecord,
    cdOffset,
    cdSize,
    centralEntry,
    trailer,
    newSize: newCdOffset + newCdSize + trailer.length,
    entries: entries + 1,
    newCdOffset,
    newCdSize,
  };
}

/**
 * 向 Blob 追加 Store 条目（旧字节走 slice 懒引用，不整体拷贝）。
 * @param {Blob} blob
 * @param {string} name
 * @param {Uint8Array} data
 * @param {{mtime?: Date}} [options]
 * @returns {Promise<Blob>}
 */
export async function appendStoredEntryToBlob(blob, name, data, { mtime } = {}) {
  const tailLen = Math.min(blob.size, 131072);
  const tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer());
  const plan = planZipAppend(tail, blob.size, { name, data, mtime });
  return new Blob([
    blob,
    plan.localRecord,
    blob.slice(plan.cdOffset, plan.cdOffset + plan.cdSize),
    plan.centralEntry,
    plan.trailer,
  ], { type: 'application/zip' });
}

/**
 * 向 OPFS 文件原地追加 Store 条目（keepExistingData + seek，不复制旧字节）。
 * @param {FileSystemFileHandle} handle
 * @param {string} name
 * @param {Uint8Array} data
 * @param {{mtime?: Date}} [options]
 * @returns {Promise<{size: number, entries: number}>}
 */
export async function appendStoredEntryToOpfs(handle, name, data, { mtime } = {}) {
  const file = await handle.getFile();
  const tailLen = Math.min(file.size, 131072);
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  const plan = planZipAppend(tail, file.size, { name, data, mtime });
  const cdBytes = new Uint8Array(
    await file.slice(plan.cdOffset, plan.cdOffset + plan.cdSize).arrayBuffer(),
  );
  const writable = await handle.createWritable({ keepExistingData: true });
  try {
    await writable.seek(file.size);
    await writable.write(plan.localRecord);
    await writable.write(cdBytes);
    await writable.write(plan.centralEntry);
    await writable.write(plan.trailer);
  } finally {
    await writable.close();
  }
  return { size: plan.newSize, entries: plan.entries };
}
