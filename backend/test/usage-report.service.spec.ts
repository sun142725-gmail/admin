// computeCost 纯函数与 usage-report service 金额类型单测（随模块B同批入库：
// computeCost 在 usage-cost.util.ts 的模块B部分、service 是模块B新增文件）。
// service 金额输出 typeof 断言用 stub repo 模拟 MySQL string 形态（不依赖 Nest 容器与网络）。
import { computeCost } from '../src/modules/ai/core/usage-cost.util';
import { UsageReportService } from '../src/modules/ai/admin/usage-report.service';

describe('computeCost', () => {
  const chatPrice = { inputPrice: 0.001, outputPrice: 0.002, currency: 'CNY', unit: 'tokens_1k' };
  const unitPrice = { inputPrice: 0, outputPrice: 0.5, currency: 'CNY', unit: 'image' };

  it('chat 按输入/输出分别计价：prompt/1000×输入价 + completion/1000×输出价', () => {
    // 1000/1000×0.001 + 2000/1000×0.002 = 0.001 + 0.004 = 0.005（输入输出价不等时无交叉项高估）。
    expect(computeCost('chat', 1000, 2000, 0, chatPrice)).toBeCloseTo(0.005, 10);
  });

  it('chat token=0 时金额为 0', () => {
    expect(computeCost('chat', 0, 0, 0, chatPrice)).toBe(0);
  });

  it('roundtable 归 chat 口径', () => {
    // 1000/1000×0.001 + 0/1000×0.002 = 0.001，与 chat 同公式。
    expect(computeCost('roundtable', 1000, 0, 0, chatPrice)).toBeCloseTo(0.001, 10);
  });

  it('image/video/tts 按 unitCount × 单价（单价承载在 outputPrice）', () => {
    expect(computeCost('image', 0, 0, 3, unitPrice)).toBe(1.5);
    expect(computeCost('video', 0, 0, 5, { ...unitPrice, outputPrice: 1, unit: 'second' })).toBe(5);
    expect(computeCost('tts', 0, 0, 120, { ...unitPrice, outputPrice: 0.0002, unit: 'char' })).toBeCloseTo(0.024, 10);
  });

  it('unitCount=0（失败调用）金额为 0', () => {
    expect(computeCost('image', 0, 0, 0, unitPrice)).toBe(0);
  });

  it('price=null（无价无兜底）返回 null', () => {
    expect(computeCost('chat', 1000, 1000, 0, null)).toBeNull();
    expect(computeCost('image', 0, 0, 3, null)).toBeNull();
  });
});

// usage-report service 金额输出字段类型兜底断言：sqlite 聚合返回 number 已由 e2e 固化，
// 这里用 stub repo 模拟 MySQL string 形态（getRawMany 返回 string 聚合值），断言输出金额恒 typeof number。

// QueryBuilder 链式 stub：getRawMany 返回预置原始行。
const mockQb = (rows: Array<Record<string, unknown>>): Record<string, unknown> => {
  const qb: Record<string, unknown> = {};
  for (const method of ['select', 'addSelect', 'andWhere', 'groupBy', 'addGroupBy']) {
    qb[method] = () => qb;
  }
  qb.getRawMany = () => Promise.resolve(rows);
  return qb;
};

describe('UsageReportService 金额输出类型', () => {
  const buildService = (rawRows: Array<Record<string, unknown>>) => {
    const usageRepo = { createQueryBuilder: () => mockQb(rawRows) };
    const priceRepo = {
      find: async () => [
        {
          id: 1,
          modelId: undefined,
          kind: 'tts',
          inputPrice: '0',
          outputPrice: '0.0002',
          unit: 'char',
          currency: 'CNY',
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z')
        }
      ]
    };
    const modelRepo = { find: async () => [{ id: 5, displayName: 'TTS 模型' }] };
    const projectRepo = { find: async () => [{ id: 3, name: '测试项目' }] };
    return new UsageReportService(
      usageRepo as never,
      priceRepo as never,
      modelRepo as never,
      projectRepo as never
    );
  };

  it('聚合值/金额字段（MySQL string 形态入参）输出恒为 number', async () => {
    // 模拟 MySQL：calls/tokens/unitCount 以 string 返回。
    const service = buildService([
      {
        day: '2026-11-01',
        modelId: '5',
        projectId: '3',
        kind: 'tts',
        calls: '3',
        tokens: '0',
        promptTokens: '0',
        completionTokens: '0',
        unitCount: '150'
      }
    ]);
    const vo = await service.report({});
    expect(typeof vo.summary.calls).toBe('number');
    expect(typeof vo.summary.tokens).toBe('number');
    expect(typeof vo.summary.unitCount).toBe('number');
    expect(typeof vo.summary.uncoveredCalls).toBe('number');
    expect(vo.summary.calls).toBe(3);
    expect(vo.summary.unitCount).toBe(150);
    expect(typeof vo.summary.costByCurrency.CNY).toBe('number');
    // 150 字符 × 0.0002 = 0.03
    expect(vo.summary.costByCurrency.CNY).toBeCloseTo(0.03, 10);
    expect(typeof vo.byDay[0].cost).toBe('number');
    expect(typeof vo.byModel[0].cost).toBe('number');
    expect(vo.byModel[0].modelName).toBe('TTS 模型');
    expect(typeof vo.byProject[0].cost).toBe('number');
    expect(vo.byProject[0].projectName).toBe('测试项目');
  });

  it('无价分组计入 uncoveredCalls、币种混合时视图行金额为 null', async () => {
    const service = buildService([
      {
        day: '2026-11-01',
        modelId: null,
        projectId: null,
        kind: 'image', // 无价格行也无 env 默认（stub 未配 process.env）→ 未覆盖
        calls: '2',
        tokens: '0',
        promptTokens: '0',
        completionTokens: '0',
        unitCount: '2'
      },
      {
        day: '2026-11-02',
        modelId: null,
        projectId: '3',
        kind: 'tts',
        calls: '1',
        tokens: '0',
        promptTokens: '0',
        completionTokens: '0',
        unitCount: '100'
      }
    ]);
    const vo = await service.report({});
    expect(vo.summary.uncoveredCalls).toBe(2);
    expect(vo.byDay[0].cost).toBeNull(); // 该天混合：有 tts 金额 + image 未覆盖 → null
    expect(vo.byProject.length).toBe(1); // projectId null 不入 byProject
    expect(vo.byModel[0].modelName).toBe('未知模型');
  });
});
