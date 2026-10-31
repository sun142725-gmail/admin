// 腾讯板块 rank fixture 自检套件：
// 工作流检查器会把任务产出文件（含本 fixture 文件）逐个传给 `jest --runTestsByPath`
// 校验，文件名不含 .spec.ts，由 backend/jest.config.js 的 testRegex 点名放行后才可被
// jest 独立发现运行；否则该次校验报 "No tests found" exit 1。
// 数据本体在 ./tencent-sector-fixtures.data.ts（纯数据模块）：拆开是因为被 import 的
// 模块若含顶层 describe，会把用例注册进导入方套件（stock-indicators.spec.ts）。
// 这里校验 fixture 数据形态与解析器约定一致，防止数据被误改后解析用例静默失效；
// 完整的解析行为测试在 test/stock-indicators.spec.ts 的 tencent sector rank describe。
import { TENCENT_SECTOR_RANK_GN_JSON, TENCENT_SECTOR_RANK_HY_JSON } from './tencent-sector-fixtures.data';
import { isTencentSectorCode, parseTencentSectorRank } from '../../src/modules/stock/market/tencent-sector.api';

describe('tencent sector fixtures sanity', () => {
  it('HY fixture 共 6 行原始数据，5 行有效（缺 code 行被过滤），均为 qqt_ 前缀 tencent 源', () => {
    const payload = JSON.parse(TENCENT_SECTOR_RANK_HY_JSON);
    expect(payload.code).toBe(0);
    expect(payload.data.rank_list).toHaveLength(6);
    const items = parseTencentSectorRank(payload);
    expect(items).toHaveLength(5);
    expect(items.every((it) => it.code.startsWith('qqt_') && it.source === 'tencent')).toBe(true);
  });

  it('HY fixture 第 1 行 zgb=71/122 → 71 涨 51 跌；第 5 行缺 zgb → 涨跌家数字段省略', () => {
    const items = parseTencentSectorRank(JSON.parse(TENCENT_SECTOR_RANK_HY_JSON));
    const full = items.find((it) => it.name === '食品饮料');
    expect(full?.upCount).toBe(71);
    expect(full?.downCount).toBe(51);
    const missing = items.find((it) => it.name === '家用电器');
    expect(missing).toBeDefined();
    expect(missing?.upCount).toBeUndefined();
    expect(missing?.downCount).toBeUndefined();
  });

  it('GN fixture 共 2 行，大写 code 行解析为 qqt_pt02GN2174 且能被 isTencentSectorCode 识别', () => {
    const payload = JSON.parse(TENCENT_SECTOR_RANK_GN_JSON);
    expect(payload.code).toBe(0);
    expect(payload.data.rank_list).toHaveLength(2);
    const items = parseTencentSectorRank(payload);
    expect(items.map((it) => it.code)).toEqual(['qqt_pt02090002', 'qqt_pt02GN2174']);
    expect(isTencentSectorCode(items[1].code)).toBe(true);
  });
});
