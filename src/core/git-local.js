/**
 * 包内 Git 历史只读解析（无 DOM、无外部依赖）。
 *
 * 背景（2026-11-17 用户裁定）：数据包里明明带着 `.git`，Git 可视化却只读云端提交，
 * 包内条目一律显示「没有可读的提交」。本模块直接读 zip 里的 `.git`：
 * HEAD / refs / packed-refs / config / loose objects / packfile（含 ofs/ref delta）。
 *
 * 纪律：
 * - 只读，不解包到磁盘、不执行 git 命令；
 * - 解析不了就返回明确原因（`no-git` / `unsupported` / `pack-too-large`），绝不伪造提交；
 * - pack 超过上限时只读 refs/loose objects，并标记 `truncated`，由 UI 如实说明。
 */

const TEXT = new TextDecoder('utf-8', { fatal: false });
const MAX_PACK_BYTES = 48 * 1024 * 1024;
const MAX_COMMIT_OBJECTS = 5000;
/** delta 展开结果的硬上限：防御恶意/损坏 delta 声明超大 resultSize 直接 new Uint8Array 打爆内存。 */
const MAX_DELTA_RESULT_BYTES = 512 * 1024 * 1024;

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function hex(bytes) {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function readU32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readU64(bytes, offset) {
  return readU32(bytes, offset) * 0x100000000 + readU32(bytes, offset + 4);
}

/** 用 DecompressionStream 解 zlib；环境不支持时返回 null（不抛错）。 */
async function inflateZlib(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const stream = new DecompressionStream('deflate');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const chunks = [];
    const readAll = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    })();
    const writeAll = (async () => {
      await writer.write(bytes);
      await writer.close();
    })();
    await Promise.all([readAll, writeAll]);
    let length = 0;
    for (const chunk of chunks) length += chunk.byteLength;
    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}

function parseLooseObject(bytes) {
  if (!bytes || bytes.length < 3) return null;
  const nul = bytes.indexOf(0);
  if (nul <= 0) return null;
  const header = TEXT.decode(bytes.subarray(0, nul));
  const match = /^([a-z]+)\s+(\d+)$/.exec(header);
  if (!match) return null;
  return { type: match[1], data: bytes.subarray(nul + 1) };
}

function parsePackIndex(bytes) {
  if (!bytes || bytes.length < 256 * 4 + 20) return null;
  let pos = 0;
  let version = 1;
  if (bytes[0] === 0xff && bytes[1] === 0x74 && bytes[2] === 0x4f && bytes[3] === 0x63) {
    version = readU32(bytes, 4);
    if (version !== 2) return null;
    pos = 8;
  }
  const count = readU32(bytes, pos + 255 * 4);
  if (!Number.isFinite(count) || count < 0 || count > 5_000_000) return null;
  const shas = [];
  const offsets = [];
  let p = pos + 256 * 4;
  if (version === 2) {
    for (let i = 0; i < count; i += 1) {
      shas.push(hex(bytes.subarray(p, p + 20)));
      p += 20;
    }
    p += count * 4; // CRC32 table
    const large = [];
    for (let i = 0; i < count; i += 1) {
      const value = readU32(bytes, p);
      p += 4;
      offsets.push(value);
      if (value & 0x80000000) large.push(i);
    }
    const largeStart = p;
    for (const i of large) {
      const index = offsets[i] & 0x7fffffff;
      offsets[i] = readU64(bytes, largeStart + index * 8);
    }
    return { shas, offsets };
  }
  for (let i = 0; i < count; i += 1) {
    offsets.push(readU32(bytes, p));
    p += 4;
    shas.push(hex(bytes.subarray(p, p + 20)));
    p += 20;
  }
  return { shas, offsets };
}

function parsePackObjectHeader(pack, offset) {
  let p = offset;
  if (p >= pack.length) return null;
  let byte = pack[p++];
  const type = (byte >> 4) & 7;
  let size = byte & 0x0f;
  let shift = 4;
  while (byte & 0x80) {
    if (p >= pack.length) return null;
    byte = pack[p++];
    size += (byte & 0x7f) * (2 ** shift);
    shift += 7;
    if (shift > 56) return null;
  }
  let baseOffset = null;
  let baseSha = null;
  if (type === 6) {
    if (p >= pack.length) return null;
    byte = pack[p++];
    let distance = byte & 0x7f;
    while (byte & 0x80) {
      if (p >= pack.length) return null;
      byte = pack[p++];
      distance = (distance + 1) * 128 + (byte & 0x7f);
    }
    baseOffset = offset - distance;
  } else if (type === 7) {
    if (p + 20 > pack.length) return null;
    baseSha = hex(pack.subarray(p, p + 20));
    p += 20;
  }
  return { type, size, dataStart: p, baseOffset, baseSha };
}

function readDeltaVarint(bytes, state) {
  let value = 0;
  let shift = 0;
  for (;;) {
    if (state.pos >= bytes.length) return null;
    const byte = bytes[state.pos++];
    value += (byte & 0x7f) * (2 ** shift);
    if (!(byte & 0x80)) return value;
    shift += 7;
    if (shift > 56) return null;
  }
}

/** Git pack delta 指令。 */
function applyDelta(base, delta) {
  if (!base || !delta) return null;
  const state = { pos: 0 };
  const baseSize = readDeltaVarint(delta, state);
  const resultSize = readDeltaVarint(delta, state);
  if (baseSize === null || resultSize === null || baseSize !== base.length) return null;
  // 结果体积上限：以「硬上限」与「base 的 4 倍」中更小者为准，超限即拒绝，
  // 不让损坏/恶意 delta 用声明的巨大 resultSize 分配数 GB 数组打爆内存。
  const cap = Math.min(MAX_DELTA_RESULT_BYTES, Math.max(base.length, 1) * 4);
  if (!Number.isFinite(resultSize) || resultSize < 0 || resultSize > cap) return null;
  const out = new Uint8Array(resultSize);
  let outPos = 0;
  while (state.pos < delta.length) {
    const command = delta[state.pos++];
    if (command & 0x80) {
      let offset = 0;
      let size = 0;
      // ⚠️ `<<24` 在最高位为 1 时会产生负数（如 0xFF<<24 === -16777216），
      // 导致 >8MB 的 blob 偏移算错。用分段加法（乘 2^n）保持无符号累加，
      // 并对每字节做越界检查，避免 delta 截断时 state.pos 越界读出 undefined。
      if (command & 0x01) {
        if (state.pos >= delta.length) return null;
        offset += delta[state.pos++];
      }
      if (command & 0x02) {
        if (state.pos >= delta.length) return null;
        offset += delta[state.pos++] * 0x100;
      }
      if (command & 0x04) {
        if (state.pos >= delta.length) return null;
        offset += delta[state.pos++] * 0x10000;
      }
      if (command & 0x08) {
        if (state.pos >= delta.length) return null;
        offset += delta[state.pos++] * 0x1000000;
      }
      if (command & 0x10) {
        if (state.pos >= delta.length) return null;
        size += delta[state.pos++];
      }
      if (command & 0x20) {
        if (state.pos >= delta.length) return null;
        size += delta[state.pos++] * 0x100;
      }
      if (command & 0x40) {
        if (state.pos >= delta.length) return null;
        size += delta[state.pos++] * 0x10000;
      }
      if (size === 0) size = 0x10000;
      if (offset + size > base.length || outPos + size > out.length) return null;
      out.set(base.subarray(offset, offset + size), outPos);
      outPos += size;
    } else if (command > 0) {
      if (state.pos + command > delta.length || outPos + command > out.length) return null;
      out.set(delta.subarray(state.pos, state.pos + command), outPos);
      state.pos += command;
      outPos += command;
    } else {
      return null;
    }
  }
  return outPos === out.length ? out : null;
}

function parsePerson(line) {
  const match = /^(.*) <[^>]*> (\d+) ([+-]\d{4})$/.exec(String(line || ''));
  if (!match) return { name: String(line || '').trim(), timestamp: 0, tz: '' };
  return {
    name: match[1].trim(),
    timestamp: Number(match[2]) * 1000,
    tz: match[3],
  };
}

function parseCommit(sha, body) {
  const text = TEXT.decode(body);
  const lines = text.split('\n');
  const commit = {
    sha,
    shortSha: sha.slice(0, 7),
    tree: '',
    parents: [],
    author: '',
    authorTimestamp: 0,
    committer: '',
    timestamp: 0,
    message: '',
    date: '',
  };
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '') { index += 1; break; }
    if (line.startsWith('tree ')) commit.tree = line.slice(5).trim();
    else if (line.startsWith('parent ')) commit.parents.push(line.slice(7).trim());
    else if (line.startsWith('author ')) {
      const person = parsePerson(line.slice(7));
      commit.author = person.name;
      commit.authorTimestamp = person.timestamp;
    } else if (line.startsWith('committer ')) {
      const person = parsePerson(line.slice(10));
      commit.committer = person.name;
      commit.timestamp = person.timestamp;
      commit.date = person.timestamp
        ? new Date(person.timestamp).toISOString().slice(0, 10)
        : '';
    }
  }
  commit.message = lines.slice(index).join('\n').replace(/\s+$/u, '');
  return commit;
}

function parseRefs(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/u)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    const match = /^([0-9a-f]{40})\s+(.+)$/i.exec(value);
    if (match) out.push({ sha: match[1].toLowerCase(), ref: match[2] });
  }
  return out;
}

function chooseRoot(roots, extensionName) {
  const list = [...roots.keys()];
  if (!list.length) return '';
  const wanted = String(extensionName || '').trim();
  if (wanted) {
    const hit = list.find((root) => {
      const clean = root.replace(/\/$/u, '');
      const base = clean.includes('/') ? clean.slice(clean.lastIndexOf('/') + 1) : clean;
      return base === wanted || clean.endsWith(`/extensions/${wanted}`) || clean.endsWith(`/${wanted}`);
    });
    if (hit) return hit;
  }
  return list.sort((a, b) => a.length - b.length)[0];
}

/**
 * 从 zip 条目流读取某个扩展的本地 Git 历史。
 * @param {AsyncIterable<{fileName:string, uncompressedSize?:number, read:Function}>} entries
 * @param {{extensionName?:string, maxCommits?:number, maxPackBytes?:number}} [options]
 */
export async function readGitHistoryFromEntries(entries, {
  extensionName = '',
  maxCommits = 50,
  maxPackBytes = MAX_PACK_BYTES,
} = {}) {
  const roots = new Map();
  for await (const entry of entries) {
    const name = normalizePath(entry.fileName);
    let root = '';
    let rel = '';
    const marker = name.lastIndexOf('/.git/');
    if (marker >= 0) {
      root = name.slice(0, marker + 1);
      rel = name.slice(marker + 6);
    } else if (name.startsWith('.git/')) {
      root = '';
      rel = name.slice(5);
    } else {
      continue;
    }
    if (!rel) continue;
    if (!roots.has(root)) roots.set(root, new Map());
    roots.get(root).set(rel, entry);
  }
  if (!roots.size) return { ok: false, reason: 'no-git' };

  const root = chooseRoot(roots, extensionName);
  const files = roots.get(root);
  if (!files) return { ok: false, reason: 'no-git' };

  const readText = async (rel) => {
    const entry = files.get(rel);
    if (!entry) return '';
    try {
      return TEXT.decode(await entry.read());
    } catch {
      return '';
    }
  };
  const readBytes = async (rel) => {
    const entry = files.get(rel);
    if (!entry) return null;
    try {
      return await entry.read();
    } catch {
      return null;
    }
  };

  const config = await readText('config');
  const remoteMatch = /\[remote\s+["']origin["']\][\s\S]*?url\s*=\s*([^\r\n]+)/i.exec(config)
    || /url\s*=\s*([^\r\n]+)/i.exec(config);
  const remoteUrl = remoteMatch ? remoteMatch[1].trim() : '';

  const refs = new Map();
  for (const [rel] of files) {
    const match = /^refs\/heads\/(.+)$/i.exec(rel);
    if (!match) continue;
    const value = (await readText(rel)).trim();
    if (/^[0-9a-f]{40}$/i.test(value)) refs.set(match[1], value.toLowerCase());
  }
  for (const { sha, ref } of parseRefs(await readText('packed-refs'))) {
    if (ref.startsWith('refs/heads/')) refs.set(ref.slice('refs/heads/'.length), sha);
  }

  const headText = (await readText('HEAD')).trim();
  const headBranchMatch = /^ref:\s*refs\/heads\/(.+)$/i.exec(headText);
  const headBranch = headBranchMatch ? headBranchMatch[1].trim() : '';
  const headSha = (headBranch && refs.get(headBranch))
    || (/^[0-9a-f]{40}$/i.test(headText) ? headText.toLowerCase() : '');

  const commits = new Map();
  const objectMemo = new Map();
  let truncated = false;
  let packTooLarge = false;

  // 1) loose objects
  for (const [rel, entry] of files) {
    const match = /^objects\/([0-9a-f]{2})\/([0-9a-f]{38})$/i.exec(rel);
    if (!match) continue;
    const sha = (match[1] + match[2]).toLowerCase();
    const raw = await readBytes(rel);
    if (!raw) continue;
    const inflated = await inflateZlib(raw);
    const object = parseLooseObject(inflated);
    if (object?.type === 'commit') {
      if (commits.size < MAX_COMMIT_OBJECTS) {
        commits.set(sha, parseCommit(sha, object.data));
      } else {
        // 与 pack 循环一致：超出上限的 commit 必须标记 truncated，
        // 绝不静默跳过让 UI 误以为读到了全部提交（数据正确性优先）。
        truncated = true;
      }
    }
    if (!entry.uncompressedSize) continue;
  }

  // 2) packfiles
  const packNames = [];
  for (const [rel] of files) {
    const match = /^objects\/pack\/(pack-[^/]+)\.pack$/i.exec(rel);
    if (match) packNames.push(match[1]);
  }
  for (const packName of packNames) {
    const packEntry = files.get(`objects/pack/${packName}.pack`);
    const idxEntry = files.get(`objects/pack/${packName}.idx`);
    if (!packEntry || !idxEntry) continue;
    if ((packEntry.uncompressedSize || 0) > maxPackBytes) {
      truncated = true;
      packTooLarge = true;
      continue;
    }
    const pack = await readBytes(`objects/pack/${packName}.pack`);
    const idx = await readBytes(`objects/pack/${packName}.idx`);
    if (!pack || !idx) continue;
    const parsed = parsePackIndex(idx);
    if (!parsed) { truncated = true; continue; }
    const packEnd = Math.max(0, pack.length - 20);
    const offsets = parsed.offsets
      .map((offset, index) => ({ offset, sha: parsed.shas[index] }))
      .filter((item) => item.offset >= 12 && item.offset < packEnd)
      .sort((a, b) => a.offset - b.offset);
    const descByOffset = new Map();
    const descBySha = new Map();
    offsets.forEach((item, index) => {
      const header = parsePackObjectHeader(pack, item.offset);
      if (!header) return;
      const desc = {
        ...item,
        header,
        nextOffset: index + 1 < offsets.length ? offsets[index + 1].offset : packEnd,
        resolved: null,
        resolving: false,
      };
      descByOffset.set(item.offset, desc);
      descBySha.set(item.sha, desc);
    });
    const baseOf = (desc) => {
      if (!desc?.header) return null;
      if (desc.header.type === 6) return descByOffset.get(desc.header.baseOffset) || null;
      if (desc.header.type === 7) return descBySha.get(desc.header.baseSha) || null;
      return null;
    };
    const typeMemo = new Map();
    const finalType = (desc, seen = new Set()) => {
      if (!desc) return '';
      if (typeMemo.has(desc.sha)) return typeMemo.get(desc.sha);
      if (seen.has(desc.sha)) return '';
      seen.add(desc.sha);
      const type = desc.header?.type;
      let out = '';
      if (type === 1) out = 'commit';
      else if (type === 2) out = 'tree';
      else if (type === 3) out = 'blob';
      else if (type === 4) out = 'tag';
      else if (type === 6 || type === 7) out = finalType(baseOf(desc), seen);
      typeMemo.set(desc.sha, out);
      return out;
    };
    const resolve = async (desc) => {
      if (!desc) return null;
      if (desc.resolved) return desc.resolved;
      if (desc.resolving) return null;
      desc.resolving = true;
      try {
        const start = desc.header.dataStart;
        const end = Math.max(start, desc.nextOffset);
        const compressed = pack.subarray(start, end);
        const inflated = await inflateZlib(compressed);
        if (!inflated) return null;
        let object = null;
        if (desc.header.type === 1) {
          object = { type: 'commit', data: inflated };
        } else if (desc.header.type === 6 || desc.header.type === 7) {
          const base = await resolve(baseOf(desc));
          if (!base) return null;
          const data = applyDelta(base.data, inflated);
          if (!data) return null;
          object = { type: base.type, data };
        } else {
          object = { type: finalType(desc), data: inflated };
        }
        desc.resolved = object;
        return object;
      } finally {
        desc.resolving = false;
      }
    };
    for (const desc of descByOffset.values()) {
      if (commits.size >= MAX_COMMIT_OBJECTS) { truncated = true; break; }
      if (finalType(desc) !== 'commit') continue;
      const object = await resolve(desc);
      if (object?.type === 'commit') commits.set(desc.sha, parseCommit(desc.sha, object.data));
    }
  }

  const all = [...commits.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const branches = [...refs.entries()]
    .map(([name, sha]) => ({ name, commit: sha, current: name === headBranch }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    ok: true,
    extensionName,
    root,
    remoteUrl,
    branch: headBranch,
    head: headSha,
    branches,
    commits: all.slice(0, maxCommits),
    totalCommits: all.length,
    truncated: truncated || all.length > maxCommits,
    packTooLarge,
  };
}
