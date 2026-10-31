// buildPagination 纯函数单测：受控分页字段与 SelfTable 默认分页语义一致。
import { describe, expect, it } from 'vitest';
import { buildPagination } from './useTableQuery';

describe('buildPagination', () => {
  it('生成受控分页配置（current/pageSize/total/onChange + AppTable 同款默认）', () => {
    let changed: [number, number] | null = null;
    const pagination = buildPagination({
      page: 3,
      pageSize: 20,
      total: 128,
      onPageChange: (page, pageSize) => {
        changed = [page, pageSize];
      }
    });
    expect(pagination.current).toBe(3);
    expect(pagination.pageSize).toBe(20);
    expect(pagination.total).toBe(128);
    expect(pagination.showSizeChanger).toBe(true);
    expect(pagination.pageSizeOptions).toEqual(['10', '20', '30', '50']);
    expect(pagination.showTotal?.(128, [21, 40])).toBe('共 128 条');
    expect(pagination.locale).toEqual({ items_per_page: '页' });
    pagination.onChange?.(2, 50);
    expect(changed).toEqual([2, 50]);
  });

  it('total 为 0 时 showTotal 输出「共 0 条」', () => {
    const pagination = buildPagination({ page: 1, pageSize: 20, total: 0, onPageChange: () => undefined });
    expect(pagination.showTotal?.(0, [0, 0])).toBe('共 0 条');
  });
});
