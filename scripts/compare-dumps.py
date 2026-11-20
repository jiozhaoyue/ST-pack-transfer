"""比较两份 _engine_dump.bin 的实质内容（doc 逐字段、时间戳除外）。

用法: python -I scripts/compare-dumps.py <a.zip> <b.zip>
只读；不执行包内任何内容。
"""
import hashlib
import io
import json
import sys
import zipfile

KEY_COLS = {
    'settings': ['handle'],
    'stats': ['handle'],
    'groups_table': ['handle', 'id'],
    'named_docs': ['handle', 'bucket', 'name'],
    'worlds': ['handle', 'name'],
    'presets': ['handle', 'dir_key', 'name'],
    'preset_states': ['handle', 'dir_key', 'name', 'namespace'],
    'chats': ['handle', 'char_dir', 'name', 'is_group', 'group_id'],
    'chat_states': ['handle', 'char_dir', 'name', 'is_group', 'group_id', 'namespace'],
}
IGNORE = {'updated_at', 'created_at'}


def load(path):
    z = zipfile.ZipFile(path)
    out = {}
    with z.open('_engine_dump.bin') as raw:
        for line in io.BufferedReader(raw, 1 << 20):
            if not line.strip():
                continue
            rec = json.loads(line)
            table = rec['sql'].split('INSERT INTO ')[1].split(' ')[0]
            cols = rec['sql'].split('(')[1].split(')')[0].split(',')
            row = {}
            for col, value in zip([c.strip() for c in cols], rec['params']):
                if col == 'doc':
                    value = json.loads(value) if isinstance(value, str) else value
                row[col] = value
            key = tuple(str(row.get(c)) for c in KEY_COLS[table])
            digest = hashlib.md5(
                json.dumps(row.get('doc'), sort_keys=True, ensure_ascii=False).encode('utf-8'),
            ).hexdigest()
            out.setdefault(table, {})[key] = digest
    return out


def main(a_path, b_path):
    a, b = load(a_path), load(b_path)
    ok = True
    for table in KEY_COLS:
        ka, kb = a.get(table, {}), b.get(table, {})
        missing = set(ka) - set(kb)
        extra = set(kb) - set(ka)
        diffs = [k for k in (set(ka) & set(kb)) if ka[k] != kb[k]]
        status = 'OK' if not (missing or extra or diffs) else 'DIFF'
        print(f'{table:14s} a={len(ka):4d} b={len(kb):4d} {status}'
              f'{f" missing={len(missing)}" if missing else ""}'
              f'{f" extra={len(extra)}" if extra else ""}'
              f'{f" docDiff={len(diffs)}" if diffs else ""}')
        if missing or extra or diffs:
            ok = False
            for k in list(missing)[:3]:
                print('   missing:', k)
            for k in list(extra)[:3]:
                print('   extra  :', k)
            for k in diffs[:3]:
                print('   diff   :', k)
    print('RESULT:', 'IDENTICAL(doc)' if ok else 'DIFFERENCES')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
