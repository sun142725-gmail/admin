// 列表页分页+筛选样板：page/pageSize/total/filters/loading + fetchData + useEffect 联动，
// 收编 DictPage.tsx:36-78、AuditCenterPage.tsx:110-167 等 5 文件手写样板。
// buildPagination 纯函数导出供单测；fetcher 走 ref（对齐 AuditCenterPage.tsx:560-561 模式），
// 页面无需 useCallback 包装 fetcher 也不会引发 effect 重跑。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TablePaginationConfig } from 'antd';
import type { PageResult } from '../types/api';

export interface TableQueryFetchParams<F> {
  page: number;
  pageSize: number;
  filters: F;
}

export interface UseTableQueryOptions<T, F extends object> {
  /** 列表请求：入参 page/pageSize/filters，返回 PageResult（接口异常时 reject）。 */
  fetcher: (params: TableQueryFetchParams<F>) => Promise<PageResult<T>>;
  /** 默认每页条数（默认 20，对齐 DictPage/AuditCenter 现状）。 */
  defaultPageSize?: number;
  /** 初始筛选值。 */
  defaultFilters?: F;
  /** 请求失败回调：不传则完全静默（无 console、无提示，仅 loading 复位并保留旧数据）——
   *  排障需调用方显式接 onError（如 msg.errorFrom）；现状多数页靠 http 层或调用侧兜底。 */
  onError?: (error: unknown) => void;
}

/** 受控分页配置（SelfTable 直用 props，字段与 DictPage.tsx:302-310 手写样板一致）。 */
export const buildPagination = (state: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
}): TablePaginationConfig => ({
  current: state.page,
  pageSize: state.pageSize,
  total: state.total,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '30', '50'],
  showTotal: (total: number) => `共 ${total} 条`,
  locale: { items_per_page: '页' },
  onChange: state.onPageChange
});

export interface UseTableQueryResult<T, F extends object> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  filters: F;
  loading: boolean;
  /** 手动刷新（增删改后调用）。 */
  reload: () => Promise<void>;
  /** 设置筛选并回到第 1 页。 */
  search: (next: F) => void;
  /** 清空筛选回初始值并回到第 1 页。 */
  reset: () => void;
  setPage: (page: number) => void;
  /** SelfTable pagination 直用配置。 */
  pagination: TablePaginationConfig;
}

export const useTableQuery = <T, F extends object = Record<string, unknown>>(
  options: UseTableQueryOptions<T, F>
): UseTableQueryResult<T, F> => {
  const { fetcher, defaultPageSize = 20, defaultFilters, onError } = options;
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [filters, setFiltersState] = useState<F>(defaultFilters ?? ({} as F));
  const [loading, setLoading] = useState(false);

  // fetcher/onError 走 ref：闭包恒取最新，effect 只依赖 page/pageSize/filters
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcherRef.current({ page, pageSize, filters });
      setData(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (error) {
      onErrorRef.current?.(error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const setFilters = useCallback((next: F) => {
    setPage(1);
    setFiltersState(next);
  }, []);

  const resetFilters = useCallback(() => {
    setPage(1);
    setFiltersState(defaultFilters ?? ({} as F));
  }, [defaultFilters]);

  const onPageChange = useCallback((nextPage: number, nextPageSize: number) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
  }, []);

  const pagination = useMemo(
    () => buildPagination({ page, pageSize, total, onPageChange }),
    [page, pageSize, total, onPageChange]
  );

  return {
    data,
    total,
    page,
    pageSize,
    filters,
    loading,
    reload: fetchData,
    search: setFilters,
    reset: resetFilters,
    setPage,
    pagination
  };
};
