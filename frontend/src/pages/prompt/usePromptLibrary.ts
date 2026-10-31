// 提示词库页状态机 hook：收拢筛选/分页/列表/统计状态与统一刷新口。
// 2026-10 组件化重构：原页面 16 个 useState 与三处「写后手动双刷」收敛到这里——
//   - 筛选/分页变化只改 query（对象整体替换），useEffect 按 query 身份自动重取列表；
//   - 写后刷新唯一出口 reloadAll()（列表+统计 Promise.all 并行）；
//   - 同步等需回第 1 页的场景走 reloadFromFirstPage()（替换 query 触发 effect 重取，统计手动并行刷），
//     不再出现「setPage(1) + 手动 refresh」的双取数竞态。
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PROMPT_CATEGORIES,
  PromptLibraryItem,
  PromptLibraryStatsVo,
  listPromptImages,
  promptLibraryStats
} from '../../api/promptLibrary';

export interface PromptLibraryQuery {
  category?: string;
  sourceTool?: string;
  keyword: string;
  page: number;
  pageSize: number;
}

const INITIAL_QUERY: PromptLibraryQuery = { keyword: '', page: 1, pageSize: 20 };

export const usePromptLibrary = () => {
  const [items, setItems] = useState<PromptLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PromptLibraryStatsVo | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<PromptLibraryQuery>(INITIAL_QUERY);

  const fetchList = useCallback(async (q: PromptLibraryQuery) => {
    setLoading(true);
    try {
      const result = await listPromptImages({
        category: q.category,
        sourceTool: q.sourceTool,
        keyword: q.keyword || undefined,
        page: q.page,
        pageSize: q.pageSize
      });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      // http 层已统一提示
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await promptLibraryStats());
    } catch {
      // 统计失败不阻塞列表
    }
  }, []);

  // query 变化（含首次挂载）自动重取列表。
  useEffect(() => {
    void fetchList(query);
  }, [query, fetchList]);

  // 统计挂载即取，写后由 reloadAll 并行刷新。
  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // 写后统一刷新口：列表 + 统计一次刷齐（并行）。
  const reloadAll = useCallback(async () => {
    await Promise.all([fetchList(query), fetchStats()]);
  }, [fetchList, fetchStats, query]);

  // 需回第 1 页的写后刷新（批量同步后新条目按 id DESC 落第 1 页）：
  // 替换 query 触发 effect 重取列表，统计并行手动刷——全程恰好一次列表请求。
  const reloadFromFirstPage = useCallback(async () => {
    setQuery((q) => ({ ...q, page: 1 }));
    await fetchStats();
  }, [fetchStats]);

  // ---------- 筛选/分页变更（均回第 1 页的筛选类变更由各 handler 处理） ----------

  const changeCategory = useCallback((value?: string) => {
    setQuery((q) => ({ ...q, category: value, page: 1 }));
  }, []);

  const changeSourceTool = useCallback((value?: string) => {
    setQuery((q) => ({ ...q, sourceTool: value, page: 1 }));
  }, []);

  const searchKeyword = useCallback((value: string) => {
    setQuery((q) => ({ ...q, keyword: value.trim(), page: 1 }));
  }, []);

  const changePage = useCallback((next: number, nextSize: number) => {
    setQuery((q) => ({ ...q, page: nextSize !== q.pageSize ? 1 : next, pageSize: nextSize }));
  }, []);

  // ---------- 派生选项 ----------

  // 分类选项：固定枚举 + 库里实际出现的分类合并（sync 允许自由扩展，stats.byCategory 是精确口径）。
  const categoryOptions = useMemo(() => {
    const known = new Map(PROMPT_CATEGORIES.map((item) => [item.value, item]));
    (stats?.byCategory ?? []).forEach(({ category: key }) => {
      if (!known.has(key)) {
        known.set(key, { value: key, label: key });
      }
    });
    return [...known.values()];
  }, [stats]);

  // 来源筛选 facets：由 stats.bySource 派生（后端 distinct 聚合，选项完整且不随分页漂移），
  // 取代旧「从当前页条目累积」的 collectSourceTools（翻页才见新来源的漂移问题）。
  const sourceToolOptions = useMemo(
    () =>
      (stats?.bySource ?? [])
        .filter(({ source }) => source.trim().length > 0)
        .map(({ source }) => ({ value: source, label: source })),
    [stats]
  );

  return {
    items,
    total,
    stats,
    loading,
    query,
    categoryOptions,
    sourceToolOptions,
    changeCategory,
    changeSourceTool,
    searchKeyword,
    changePage,
    reloadAll,
    reloadFromFirstPage
  };
};
