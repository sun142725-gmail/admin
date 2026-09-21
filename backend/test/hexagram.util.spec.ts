// 卦名推算工具单元测试。
import { getHexagramNames } from '../src/modules/divination/hexagram.util';

describe('hexagram.util', () => {
  it('六爻全阳为本卦乾为天且无变卦', () => {
    const result = getHexagramNames(['—', '—', '—', '—', '—', '—']);
    expect(result.hexagramName).toBe('乾为天');
    expect(result.changedHexagramName).toBeUndefined();
  });

  it('六爻全阴为本卦坤为地且无变卦', () => {
    const result = getHexagramNames(['--', '--', '--', '--', '--', '--']);
    expect(result.hexagramName).toBe('坤为地');
    expect(result.changedHexagramName).toBeUndefined();
  });

  it('下乾上坤为地天泰', () => {
    const result = getHexagramNames(['—', '—', '—', '--', '--', '--']);
    expect(result.hexagramName).toBe('地天泰');
  });

  it('下坤上乾为天地否', () => {
    const result = getHexagramNames(['--', '--', '--', '—', '—', '—']);
    expect(result.hexagramName).toBe('天地否');
  });

  it('下离上坎为水火既济', () => {
    const result = getHexagramNames(['—', '--', '—', '--', '—', '--']);
    expect(result.hexagramName).toBe('水火既济');
  });

  it('初爻老阳动变出地风升', () => {
    const result = getHexagramNames(['O', '—', '—', '--', '--', '--']);
    expect(result.hexagramName).toBe('地天泰');
    expect(result.changedHexagramName).toBe('地风升');
  });

  it('多爻动时同时给出本卦与变卦', () => {
    // 本卦：初爻、五爻老阳 → 下乾(111)上乾(111) → 乾为天
    // 变卦：O→阴 后 下巽(011)上离(101) → 离巽 → 火风鼎
    const result = getHexagramNames(['O', '—', '—', '—', 'O', '—']);
    expect(result.hexagramName).toBe('乾为天');
    expect(result.changedHexagramName).toBe('火风鼎');
  });

  it('64 卦查表无遗漏', () => {
    const trigrams = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
    const allNames = new Set<string>();
    for (const upper of trigrams) {
      for (const lower of trigrams) {
        allNames.add(getHexagramNamesByTrigram(upper, lower));
      }
    }
    expect(allNames.size).toBe(64);
  });
});

// 通过三爻符号组合查表，辅助验证 64 卦完整性。
const getHexagramNamesByTrigram = (upper: string, lower: string): string => {
  const patternToTrigram: Record<string, string> = {
    '111': '乾',
    '110': '兑',
    '101': '离',
    '100': '震',
    '011': '巽',
    '010': '坎',
    '001': '艮',
    '000': '坤'
  };
  const symbolsFor = (trigram: string): string[] => {
    const pattern = Object.keys(patternToTrigram).find((key) => patternToTrigram[key] === trigram)!;
    return pattern.split('').map((bit) => (bit === '1' ? '—' : '--'));
  };
  return getHexagramNames([...symbolsFor(lower), ...symbolsFor(upper)]).hexagramName;
};
