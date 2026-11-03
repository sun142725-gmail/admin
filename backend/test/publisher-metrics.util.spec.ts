// 数据回流纯函数单测（不依赖网络与 Nest 容器）：CSV 状态机解析 RFC4180 子集边界 + 爆款阈值边界。
// CSV 转义口径与 frontend/src/utils/csv.test.ts（escapeCell 互逆）、行终结符与 frontend 导出（CRLF）对称。
import { parseCsvContent } from '../src/modules/publisher/metrics/csv-parse.util';
import {
  DEFAULT_HOT_ENGAGEMENT_RATE,
  DEFAULT_HOT_VIEWS_THRESHOLD,
  engagementRate,
  markHotMetrics,
  resolveHotThresholds
} from '../src/modules/publisher/metrics/hot-metrics.util';

describe('parseCsvContent（RFC4180 子集状态机）', () => {
  it('基本切分：首行为表头，其余为数据行（含物理行号）', () => {
    const result = parseCsvContent('h1,h2\n1,2\n3,4\n');
    expect(result.header).toEqual(['h1', 'h2']);
    expect(result.rows).toEqual([
      { line: 2, cells: ['1', '2'] },
      { line: 3, cells: ['3', '4'] }
    ]);
    expect(result.errors).toEqual([]);
  });

  it('引号内 CRLF 原样保留（与前端导出口径对称，不做归一预处理）', () => {
    const result = parseCsvContent('a,"x\r\ny",b');
    expect(result.header).toEqual(['a', 'x\r\ny', 'b']);
  });

  it('字段内 "" 转义为字面引号（escapeCell 互逆）', () => {
    const result = parseCsvContent('a,b\n1,"he said ""hi"""');
    expect(result.rows[0].cells[1]).toBe('he said "hi"');
  });

  it('引号内逗号不切分', () => {
    const result = parseCsvContent('h1,h2,h3\na,"x,y",b\n');
    expect(result.rows).toEqual([{ line: 2, cells: ['a', 'x,y', 'b'] }]);
  });

  it('空行跳过且占物理行号（后续行号不错位）', () => {
    const result = parseCsvContent('h1,h2\n\n1,2\n');
    expect(result.rows).toEqual([{ line: 3, cells: ['1', '2'] }]);
    expect(result.errors).toEqual([]);
  });

  it('BOM 剥离（\\uFEFF）', () => {
    const result = parseCsvContent('\uFEFFh1,h2\n1,2\n');
    expect(result.header).toEqual(['h1', 'h2']);
  });

  it('列数不符记行级错误不中断，后续合法行照常收集', () => {
    const result = parseCsvContent('h1,h2\n1,2,3\n4,5\n');
    expect(result.rows).toEqual([{ line: 3, cells: ['4', '5'] }]);
    expect(result.errors).toEqual([
      { line: 2, reason: expect.stringContaining('列数不符') }
    ]);
  });

  it('文件尾无终结符的末行正常收尾', () => {
    const result = parseCsvContent('h1,h2\n1,2');
    expect(result.rows).toEqual([{ line: 2, cells: ['1', '2'] }]);
  });

  it('引号内换行不推进记录行号（数据行 line 从 2 起）', () => {
    const result = parseCsvContent('h1,h2\n"x\ny",1\n');
    expect(result.rows).toEqual([{ line: 2, cells: ['x\ny', '1'] }]);
  });
});

describe('resolveHotThresholds（env 解析）', () => {
  it('缺省回落默认常量', () => {
    expect(resolveHotThresholds({})).toEqual({
      viewsThreshold: DEFAULT_HOT_VIEWS_THRESHOLD,
      engagementRateThreshold: DEFAULT_HOT_ENGAGEMENT_RATE
    });
    expect(DEFAULT_HOT_VIEWS_THRESHOLD).toBe(10000);
    expect(DEFAULT_HOT_ENGAGEMENT_RATE).toBe(0.05);
  });

  it('非法值（非数字/负数/空串/Infinity）回落默认', () => {
    expect(resolveHotThresholds({ AI_HOT_VIEWS_THRESHOLD: 'abc' }).viewsThreshold).toBe(DEFAULT_HOT_VIEWS_THRESHOLD);
    expect(resolveHotThresholds({ AI_HOT_ENGAGEMENT_RATE: '-0.1' }).engagementRateThreshold).toBe(
      DEFAULT_HOT_ENGAGEMENT_RATE
    );
    // 空串特判：Number('') === 0，不得把「留空」误判为合法阈值 0
    expect(resolveHotThresholds({ AI_HOT_VIEWS_THRESHOLD: '' }).viewsThreshold).toBe(DEFAULT_HOT_VIEWS_THRESHOLD);
    expect(resolveHotThresholds({ AI_HOT_ENGAGEMENT_RATE: 'Infinity' }).engagementRateThreshold).toBe(
      DEFAULT_HOT_ENGAGEMENT_RATE
    );
  });

  it('合法值覆盖默认（0 视为显式配置合法）', () => {
    expect(resolveHotThresholds({ AI_HOT_VIEWS_THRESHOLD: '20000', AI_HOT_ENGAGEMENT_RATE: '0.1' })).toEqual({
      viewsThreshold: 20000,
      engagementRateThreshold: 0.1
    });
    expect(resolveHotThresholds({ AI_HOT_VIEWS_THRESHOLD: '0' }).viewsThreshold).toBe(0);
  });
});

describe('markHotMetrics / engagementRate（爆款打标）', () => {
  it('engagementRate 正常比率与零播放分母保护', () => {
    expect(engagementRate(5, 100)).toBe(0.05);
    expect(engagementRate(999, 0)).toBe(0);
    expect(engagementRate(0, 0)).toBe(0);
  });

  it('播放等值命中阈值 → isHot（>= 保证等值命中）', () => {
    const [row] = markHotMetrics([{ views: 10000, likes: 0 }]);
    expect(row.isHot).toBe(true);
  });

  it('播放低于阈值且互动率低于阈值 → 不命中', () => {
    const [row] = markHotMetrics([{ views: 9999, likes: 100 }]);
    expect(row.isHot).toBe(false);
  });

  it('互动率等值命中阈值 → isHot（0.05 等值）', () => {
    const [row] = markHotMetrics([{ views: 100, likes: 5 }]);
    expect(row.isHot).toBe(true);
  });

  it('零播放分母保护：likes 再高也不因 NaN 误判爆款', () => {
    const [row] = markHotMetrics([{ views: 0, likes: 9999 }]);
    expect(row.isHot).toBe(false);
  });

  it('自定义阈值生效', () => {
    const [row] = markHotMetrics([{ views: 500, likes: 0 }], { viewsThreshold: 500, engagementRateThreshold: 0.5 });
    expect(row.isHot).toBe(true);
  });

  it('全量混合输入批量打标：结果长度一致、原数组不被修改（纯函数）', () => {
    const rows = [
      { views: 10000, likes: 0 },
      { views: 100, likes: 1 }
    ];
    const marked = markHotMetrics(rows);
    expect(marked).toHaveLength(2);
    expect(marked[0].isHot).toBe(true);
    expect(marked[1].isHot).toBe(false);
    expect(rows[0]).not.toHaveProperty('isHot');
  });
});
