// 爆款阈值纯函数：isHot = 播放 ≥ 阈值 或 互动率（点赞/播放）≥ 阈值（>= 保证等值命中）。
// 阈值单一来源：本文件默认常量 ↔ env AI_HOT_VIEWS_THRESHOLD/AI_HOT_ENGAGEMENT_RATE（缺省/非法回落默认）
// ↔ 前端 frontend/src/utils/metrics.ts 同数值常量；三处改动需同步。
// 纯函数无 I/O，供服务层导入打标与后续服务端聚合视图复用。

export const DEFAULT_HOT_VIEWS_THRESHOLD = 10000;
export const DEFAULT_HOT_ENGAGEMENT_RATE = 0.05;

export interface HotThresholds {
  viewsThreshold: number;
  engagementRateThreshold: number;
}

// 互动率 = 点赞/播放；零播放分母保护返回 0（避免 NaN/Infinity 污染打标）
export const engagementRate = (likes: number, views: number): number => (views > 0 ? likes / views : 0);

const isValidThreshold = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

// 解析 env 阈值：缺省/空串/NaN/负数/非有限数回落默认
// （空串必须特判：Number('') === 0 会把「留空」误判为合法阈值 0；0 本身显式配置则合法——全命中是用户意图）
export const resolveHotThresholds = (env: NodeJS.ProcessEnv = process.env): HotThresholds => {
  const parseThreshold = (raw: string | undefined, fallback: number): number => {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return fallback;
    }
    const value = Number(trimmed);
    return isValidThreshold(value) ? value : fallback;
  };
  return {
    viewsThreshold: parseThreshold(env.AI_HOT_VIEWS_THRESHOLD, DEFAULT_HOT_VIEWS_THRESHOLD),
    engagementRateThreshold: parseThreshold(env.AI_HOT_ENGAGEMENT_RATE, DEFAULT_HOT_ENGAGEMENT_RATE)
  };
};

export const isHotMetric = (views: number, likes: number, thresholds: HotThresholds): boolean =>
  views >= thresholds.viewsThreshold || engagementRate(likes, views) >= thresholds.engagementRateThreshold;

// 批量打标：返回带 isHot 标记的新数组（不修改入参，纯函数约定）
export const markHotMetrics = <T extends { views: number; likes: number }>(
  rows: T[],
  thresholds: HotThresholds = { viewsThreshold: DEFAULT_HOT_VIEWS_THRESHOLD, engagementRateThreshold: DEFAULT_HOT_ENGAGEMENT_RATE }
): Array<T & { isHot: boolean }> =>
  rows.map((row) => ({ ...row, isHot: isHotMetric(row.views, row.likes, thresholds) }));
