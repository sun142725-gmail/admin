// 六爻生成工具用于生成单爻结果。
export type LineResult = {
  signs: string[];
  signStr: string;
  numericValues: number[];
  sum: number;
  symbol: 'O' | '×' | '—' | '--';
  name: '老阳' | '老阴' | '少阳' | '少阴';
};

export const randomSigns = (count = 3): LineResult => {
  const signs: string[] = [];
  const numericValues: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const isPositive = Math.random() < 0.5;
    signs.push(isPositive ? '正' : '负');
    numericValues.push(isPositive ? 3 : 2);
  }

  const signStr = signs.join('');
  const sum = numericValues.reduce((a, b) => a + b, 0);

  let symbol: LineResult['symbol'];
  let name: LineResult['name'];

  switch (sum) {
    case 9:
      symbol = 'O';
      name = '老阳';
      break;
    case 6:
      symbol = '×';
      name = '老阴';
      break;
    case 7:
      symbol = '—';
      name = '少阳';
      break;
    case 8:
      symbol = '--';
      name = '少阴';
      break;
    default:
      symbol = '—';
      name = '少阳';
  }

  return {
    signs,
    signStr,
    numericValues,
    sum,
    symbol,
    name
  };
};
