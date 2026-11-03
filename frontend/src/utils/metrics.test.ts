// 爆款标记纯函数单测（vitest，与源文件同目录照 csv.test.ts 布局）：
// 阈值边界（零分母/等值命中/低于阈值）与聚合函数边界；常量与后端 env 默认值一致性由注释约定。
import { describe, expect, it } from 'vitest';
import {
  HOT_ENGAGEMENT_RATE,
  HOT_VIEWS_THRESHOLD,
  aggregateMetrics,
  engagementRate,
  isHot,
  markHotMetrics
} from './metrics';

describe('engagementRate', () => {
  it('零播放返回 0（分母保护）', () => {
    expect(engagementRate(999, 0)).toBe(0);
    expect(engagementRate(0, 0)).toBe(0);
  });

  it('正常比率', () => {
    expect(engagementRate(5, 100)).toBe(0.05);
    expect(engagementRate(1, 100)).toBe(0.01);
  });
});

describe('isHot', () => {
  it('播放等值命中阈值（>= 保证等值命中）', () => {
    expect(isHot(HOT_VIEWS_THRESHOLD, 0)).toBe(true);
  });

  it('播放低于阈值且互动率低于阈值 → 不命中', () => {
    expect(isHot(HOT_VIEWS_THRESHOLD - 1, 0)).toBe(false);
  });

  it('互动率等值命中阈值（0.05 等值）', () => {
    expect(isHot(100, 5)).toBe(true);
  });

  it('两者皆低 → 不命中', () => {
    expect(isHot(100, 4)).toBe(false);
  });

  it('零播放分母保护：likes 再高也不因 NaN 误判爆款', () => {
    expect(isHot(0, 9999)).toBe(false);
  });

  it('自定义阈值生效', () => {
    expect(isHot(500, 0, { viewsThreshold: 500, engagementRateThreshold: 0.5 })).toBe(true);
  });
});

describe('aggregateMetrics', () => {
  it('多行聚合四项求和', () => {
    expect(
      aggregateMetrics([
        { views: 100, likes: 10, comments: 2, follows: 1 },
        { views: 50, likes: 5, comments: 1, follows: 0 }
      ])
    ).toEqual({ views: 150, likes: 15, comments: 3, follows: 1 });
  });

  it('空数组全零', () => {
    expect(aggregateMetrics([])).toEqual({ views: 0, likes: 0, comments: 0, follows: 0 });
  });
});

describe('markHotMetrics', () => {
  it('批量打标：结果带 isHot、原数组不被修改（纯函数）', () => {
    const rows = [
      { views: HOT_VIEWS_THRESHOLD, likes: 0 },
      { views: 100, likes: 1 }
    ];
    const marked = markHotMetrics(rows);
    expect(marked).toHaveLength(2);
    expect(marked[0].isHot).toBe(true);
    expect(marked[1].isHot).toBe(false);
    expect(rows[0]).not.toHaveProperty('isHot');
  });

  it('常量默认值锁定（与后端 env 默认值同步：10000 / 0.05）', () => {
    expect(HOT_VIEWS_THRESHOLD).toBe(10000);
    expect(HOT_ENGAGEMENT_RATE).toBe(0.05);
  });
});
