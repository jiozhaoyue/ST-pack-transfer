import { describe, it, expect, beforeEach } from 'vitest';

describe('数据包分页与跨页选择记录测试 (Zone Pagination & Persistent Selection)', () => {
  const PKG_PAGE_SIZE = 8;
  let mockPackages = [];
  let selectedPkgs = new Set();
  let zonePage = { import: 1, export: 1 };

  beforeEach(() => {
    selectedPkgs = new Set();
    zonePage = { import: 1, export: 1 };
    // 构造 20 个测试数据包，跨 3 页（8 + 8 + 4）
    mockPackages = Array.from({ length: 20 }, (_, i) => ({
      id: `pkg-${i + 1}`,
      name: `测试数据包_${i + 1}.zip`,
      zone: 'import',
      mb: 10 + i,
      rawMb: (10 + i) * 2.2,
      time: '2026-11-16 12:00'
    }));
  });

  function getPagedPackages(zone, page) {
    const list = mockPackages.filter(p => p.zone === zone);
    const totalPages = Math.max(1, Math.ceil(list.length / PKG_PAGE_SIZE));
    const curPage = Math.min(Math.max(1, page), totalPages);
    const paged = list.slice((curPage - 1) * PKG_PAGE_SIZE, curPage * PKG_PAGE_SIZE);
    return { list, totalPages, curPage, paged };
  }

  it('① 正确计算分页总数与每页切片', () => {
    const { totalPages, paged: page1 } = getPagedPackages('import', 1);
    expect(totalPages).toBe(3);
    expect(page1.length).toBe(8);
    expect(page1[0].id).toBe('pkg-1');
    expect(page1[7].id).toBe('pkg-8');

    const { paged: page2 } = getPagedPackages('import', 2);
    expect(page2.length).toBe(8);
    expect(page2[0].id).toBe('pkg-9');
    expect(page2[7].id).toBe('pkg-16');

    const { paged: page3 } = getPagedPackages('import', 3);
    expect(page3.length).toBe(4);
    expect(page3[0].id).toBe('pkg-17');
    expect(page3[3].id).toBe('pkg-20');
  });

  it('② 在第 1 页选择包，翻页到第 2 页后，第 1 页的选择状态必须完整保留', () => {
    // 第 1 页勾选 pkg-1 和 pkg-3
    const { paged: page1 } = getPagedPackages('import', 1);
    selectedPkgs.add(page1[0].id); // pkg-1
    selectedPkgs.add(page1[2].id); // pkg-3

    expect(selectedPkgs.has('pkg-1')).toBe(true);
    expect(selectedPkgs.has('pkg-3')).toBe(true);
    expect(selectedPkgs.size).toBe(2);

    // 翻页到第 2 页
    zonePage.import = 2;
    const { paged: page2 } = getPagedPackages('import', zonePage.import);

    // 验证翻页绝对不丢失第 1 页已选项
    expect(selectedPkgs.has('pkg-1')).toBe(true);
    expect(selectedPkgs.has('pkg-3')).toBe(true);

    // 第 2 页当前渲染状态：第 2 页自身的包未被勾选
    const page2SelectedIds = page2.filter(p => selectedPkgs.has(p.id)).map(p => p.id);
    expect(page2SelectedIds).toEqual([]);
  });

  it('③ 跨页分别记录：第 1 页与第 2 页均有独立选择，合并统计与批量操作包含两页全部所选项', () => {
    // 第 1 页选 pkg-2
    selectedPkgs.add('pkg-2');

    // 翻到第 2 页，选 pkg-10 与 pkg-12
    zonePage.import = 2;
    selectedPkgs.add('pkg-10');
    selectedPkgs.add('pkg-12');

    // 翻到第 3 页，选 pkg-18
    zonePage.import = 3;
    selectedPkgs.add('pkg-18');

    // 验证跨页全部 4 个选中项
    expect(selectedPkgs.size).toBe(4);
    expect([...selectedPkgs].sort()).toEqual(['pkg-10', 'pkg-12', 'pkg-18', 'pkg-2']);

    // 翻回第 1 页，验证第 1 页渲染 checked 依然正确
    zonePage.import = 1;
    const { paged: page1 } = getPagedPackages('import', zonePage.import);
    expect(selectedPkgs.has(page1[1].id)).toBe(true); // pkg-2 checked
    expect(selectedPkgs.has(page1[0].id)).toBe(false); // pkg-1 未选
  });

  it('④ 在某一页取消勾选，精确只移出该包，绝不波及其他页已选项', () => {
    selectedPkgs.add('pkg-1'); // 第 1 页
    selectedPkgs.add('pkg-10'); // 第 2 页

    // 在第 2 页取消勾选 pkg-10
    selectedPkgs.delete('pkg-10');

    expect(selectedPkgs.has('pkg-1')).toBe(true);
    expect(selectedPkgs.has('pkg-10')).toBe(false);
    expect(selectedPkgs.size).toBe(1);
  });

  it('⑤ 预估上传宿主大小计算：选中的跨页数据包正确汇总预计写入宿主大小', () => {
    selectedPkgs.add('pkg-1'); // mb: 10, rawMb: 22
    selectedPkgs.add('pkg-10'); // mb: 19, rawMb: 41.8

    const picked = mockPackages.filter(p => selectedPkgs.has(p.id));
    const totalRawMb = picked.reduce((acc, p) => acc + (p.rawMb || p.mb * 2.0), 0);

    expect(totalRawMb).toBeCloseTo(63.8, 1);
  });
});
