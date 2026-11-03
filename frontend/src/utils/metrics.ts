// 爆款标记纯函数（与后端 backend/src/modules/publisher/metrics/hot-metrics.util.ts 同口径）：
// isHot = 播放 ≥ 阈值 或 互动率（点赞/播放）≥ 阈值（>= 保证等值命中）。
// 阈值常量与后端 env 默认值（AI_HOT_VIEWS_THRESHOLD/AI_HOT_ENGAGEMENT_RATE，见 backend/.env.example）保持一致，改动需双端同步。

export const HOT_VIEWS_THRESHOLD = 10000;
export const HOT_ENGAGEMENT_RATE = 0.05;

export interface HotThresholds {
  viewsThreshold: number;
  engagementRateThreshold: number;
}

// 互动率 = 点赞/播放；零播放分母保护返回 0（避免 NaN/Infinity 污染打标）
export const engagementRate = (likes: number, views: number): number => (views > 0 ? likes / views : 0);

export const isHot = (
  views: number,
  likes: number,
  thresholds: HotThresholds = { viewsThreshold: HOT_VIEWS_THRESHOLD, engagementRateThreshold: HOT_ENGAGEMENT_RATE }
): boolean => views >= thresholds.viewsThreshold || engagementRate(likes, views) >= thresholds.engagementRateThreshold;

// 批量打标：返回带 isHot 标记的新数组（不修改入参，纯函数约定）
export const markHotMetrics = <T extends { views: number; likes: number }>(
  rows: T[],
  thresholds?: HotThresholds
): Array<T & { isHot: boolean }> =>
  rows.map((row) => ({ ...row, isHot: isHot(row.views, row.likes, thresholds) }));

// 汇总卡聚合：空数组全零
export interface MetricsSummary {
  views: number;
  likes: number;
  comments: number;
  follows: number;
}

export const aggregateMetrics = (rows: Array<{ views: number; likes: number; comments: number; follows: number }>): MetricsSummary =>
  rows.reduce<MetricsSummary>(
    (acc, row) => ({
      views: acc.views + (row.views ?? 0),
      likes: acc.likes + (row.likes ?? 0),
      comments: acc.comments + (row.comments ?? 0),
      follows: acc.follows + (row.follows ?? 0)
    }),
    { views: 0, likes: 0, comments: 0, follows: 0 }
  );
