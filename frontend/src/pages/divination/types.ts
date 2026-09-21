// 占卜模块类型定义，与后端 DTO 对齐（C 端 Vue 可直接复制字段结构）。

export interface DivinationLineResult {
  lineIndex: number;
  /** 三次掷币原始符号串，如"正负正"。 */
  signStr: string;
  /** 组合数字：6 老阴 / 7 少阳 / 8 少阴 / 9 老阳。 */
  sum: number;
  /** 爻符号：O 老阳 / × 老阴 / — 少阳 / -- 少阴。 */
  symbol: string;
  /** 爻名称：老阳 / 老阴 / 少阳 / 少阴。 */
  name: string;
}

export type DivinationStatus = 'casting' | 'interpreting' | 'completed' | 'failed';

export interface DivinationRecord {
  id: number;
  topic: string;
  status: DivinationStatus;
  /** 本卦名，如"地天泰"。 */
  hexagramName?: string | null;
  /** 变卦名，存在动爻时才有。 */
  changedHexagramName?: string | null;
  errorMessage?: string | null;
  interpretation?: string | null;
  lines: DivinationLineResult[];
  createdAt?: string;
}

export interface DivinationSummary {
  id: number;
  topic: string;
  status: DivinationStatus;
  hexagramName?: string | null;
  changedHexagramName?: string | null;
  createdAt?: string;
}

export interface DivinationListResult {
  items: DivinationSummary[];
  total: number;
  page: number;
  pageSize: number;
}
