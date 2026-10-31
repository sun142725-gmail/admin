// SelfTable 分页合并纯函数直测（node 环境，无 antd 渲染依赖）。
// 覆盖：false 关闭 / undefined 默认 / 受控覆盖 / 条件分页对象（stock 三页契约）。
import { describe, expect, it } from 'vitest';
import { buildMergedPagination } from './SelfTable';

describe('buildMergedPagination', () => {
  it('pagination=false 保持关闭（条件分页关闭分支）', () => {
    expect(buildMergedPagination(false)).toBe(false);
  });

  it('pagination=undefined 时返回全套默认值（默认分页档）', () => {
    const merged = buildMergedPagination(undefined);
    expect(merged).toEqual({
      showSizeChanger: true,
      pageSizeOptions: ['10', '20', '30', '50'],
      showTotal: expect.any(Function),
      locale: { items_per_page: '页' }
    });
    expect(merged && typeof merged !== 'boolean' && merged.showTotal?.(123, [1, 20])).toBe('共 123 条');
  });

  it('受控字段覆盖默认值（current/pageSize/total/onChange 全量透传，默认字段保留）', () => {
    const onChange = () => undefined;
    const merged = buildMergedPagination({ current: 3, pageSize: 20, total: 100, onChange });
    expect(merged).toMatchObject({
      current: 3,
      pageSize: 20,
      total: 100,
      onChange,
      showSizeChanger: true,
      pageSizeOptions: ['10', '20', '30', '50']
    });
  });

  it('条件分页对象（stock 三页契约）：外部 showSizeChanger/pageSizeOptions 覆盖默认', () => {
    const merged = buildMergedPagination({
      pageSize: 50,
      showSizeChanger: false,
      pageSizeOptions: ['10', '20', '50', '100'],
      showTotal: (t: number) => `共 ${t} 条`
    });
    expect(merged).toMatchObject({
      pageSize: 50,
      showSizeChanger: false,
      pageSizeOptions: ['10', '20', '50', '100'],
      locale: { items_per_page: '页' }
    });
  });

  it('空对象入参等同 undefined（展开 {} 不破坏默认值）', () => {
    // showTotal/locale 为每次调用新建的对象/函数，逐字段断言基础档位（避开引用比较）
    const fromEmpty = buildMergedPagination({});
    const fromUndefined = buildMergedPagination(undefined);
    expect(fromEmpty).toMatchObject({
      showSizeChanger: true,
      pageSizeOptions: ['10', '20', '30', '50'],
      locale: { items_per_page: '页' }
    });
    expect(typeof fromUndefined).toBe('object');
    expect(typeof (fromEmpty as { showTotal?: unknown }).showTotal).toBe('function');
  });
});
