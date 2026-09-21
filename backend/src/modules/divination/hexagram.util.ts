// 卦名工具用于根据六爻符号推算本卦与变卦名称。
// 约定：阳爻 = '—' 或 'O'（老阳），阴爻 = '--' 或 '×'（老阴）。

const TRIGRAM_BY_PATTERN: Record<string, string> = {
  '111': '乾',
  '110': '兑',
  '101': '离',
  '100': '震',
  '011': '巽',
  '010': '坎',
  '001': '艮',
  '000': '坤'
};

// key 为 `${上卦}${下卦}`，上卦取四~上爻，下卦取初~三爻。
const HEXAGRAM_BY_KEY: Record<string, string> = {
  乾乾: '乾为天',
  乾兑: '天泽履',
  乾离: '天火同人',
  乾震: '天雷无妄',
  乾巽: '天风姤',
  乾坎: '天水讼',
  乾艮: '天山遁',
  乾坤: '天地否',
  兑乾: '泽天夬',
  兑兑: '兑为泽',
  兑离: '泽火革',
  兑震: '泽雷随',
  兑巽: '泽风大过',
  兑坎: '泽水困',
  兑艮: '泽山咸',
  兑坤: '泽地萃',
  离乾: '火天大有',
  离兑: '火泽睽',
  离离: '离为火',
  离震: '火雷噬嗑',
  离巽: '火风鼎',
  离坎: '火水未济',
  离艮: '火山旅',
  离坤: '火地晋',
  震乾: '雷天大壮',
  震兑: '雷泽归妹',
  震离: '雷火丰',
  震震: '震为雷',
  震巽: '雷风恒',
  震坎: '雷水解',
  震艮: '雷山小过',
  震坤: '雷地豫',
  巽乾: '风天小畜',
  巽兑: '风泽中孚',
  巽离: '风火家人',
  巽震: '风雷益',
  巽巽: '巽为风',
  巽坎: '风水涣',
  巽艮: '风山渐',
  巽坤: '风地观',
  坎乾: '水天需',
  坎兑: '水泽节',
  坎离: '水火既济',
  坎震: '水雷屯',
  坎巽: '水风井',
  坎坎: '坎为水',
  坎艮: '水山蹇',
  坎坤: '水地比',
  艮乾: '山天大畜',
  艮兑: '山泽损',
  艮离: '山火贲',
  艮震: '山雷颐',
  艮巽: '山风蛊',
  艮坎: '山水蒙',
  艮艮: '艮为山',
  艮坤: '山地剥',
  坤乾: '地天泰',
  坤兑: '地泽临',
  坤离: '地火明夷',
  坤震: '地雷复',
  坤巽: '地风升',
  坤坎: '地水师',
  坤艮: '地山谦',
  坤坤: '坤为地'
};

const isYang = (symbol: string): boolean => symbol === '—' || symbol === 'O';

const toTrigram = (symbols: string[]): string => {
  const pattern = symbols
    .slice(0, 3)
    .map((symbol) => (isYang(symbol) ? '1' : '0'))
    .join('');
  return TRIGRAM_BY_PATTERN[pattern] ?? '乾';
};

const resolveHexagramName = (symbols: string[]): string => {
  const lower = toTrigram(symbols.slice(0, 3));
  const upper = toTrigram(symbols.slice(3, 6));
  return HEXAGRAM_BY_KEY[`${upper}${lower}`] ?? '未知卦';
};

export interface HexagramNames {
  hexagramName: string;
  changedHexagramName?: string;
}

// 根据六爻符号（自初爻至上爻）推算本卦名；老阳(O)变阴、老阴(×)变阳后推算变卦名。
export const getHexagramNames = (symbols: string[]): HexagramNames => {
  const hexagramName = resolveHexagramName(symbols);
  const changedSymbols = symbols.map((symbol) =>
    symbol === 'O' ? '--' : symbol === '×' ? '—' : symbol
  );
  const hasChange = changedSymbols.some((symbol, index) => symbol !== symbols[index]);
  return {
    hexagramName,
    changedHexagramName: hasChange ? resolveHexagramName(changedSymbols) : undefined
  };
};
