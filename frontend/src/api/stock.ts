// 股市圆桌 API 封装：行情查询 / 会议发起与 SSE 订阅 / 历史记录。
import http from './http';
import { streamSse } from './sse';

// ---------- 行情类型 ----------

export interface QuoteSnapshot {
  symbol: string;
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
  amountWan: number;
  turnover?: number | null;
  pe?: number | null;
  pb?: number | null;
  amplitude?: number | null;
  floatMarketCap?: number | null;
  totalMarketCap?: number | null;
  timestamp?: string;
}

export interface KlineItem {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude?: number;
  pct?: number;
  turnover?: number;
}

export type IndicatorSeries = (number | null)[];

export interface KlineIndicators {
  ma5: IndicatorSeries;
  ma10: IndicatorSeries;
  ma20: IndicatorSeries;
  ma60: IndicatorSeries;
  macd: { dif: IndicatorSeries; dea: IndicatorSeries; histogram: IndicatorSeries };
  kdj: { k: IndicatorSeries; d: IndicatorSeries; j: IndicatorSeries };
  rsi6: IndicatorSeries;
  rsi12: IndicatorSeries;
  rsi24: IndicatorSeries;
  boll: { mid: IndicatorSeries; upper: IndicatorSeries; lower: IndicatorSeries };
  volumeRatio: number | null;
}

export interface KlineResult {
  name: string;
  items: KlineItem[];
  indicators: KlineIndicators | null;
}

export interface SectorItem {
  code: string;
  name: string;
  pct: number | null;
  upCount?: number;
  downCount?: number;
  leaderName?: string;
  leaderCode?: string;
  leaderPct?: number | null;
}

export interface MarketOverview {
  indexes: QuoteSnapshot[];
  breadth: { up: number; down: number; approximate: boolean } | null;
  topSectors: SectorItem[];
  bottomSectors: SectorItem[];
}

export interface SearchItem {
  symbol: string;
  code: string;
  name: string;
  type: 'stock' | 'index';
}

export interface SearchResult {
  stocks: SearchItem[];
  sectors: SectorItem[];
}

// ---------- 会议类型 ----------

export type SubjectType = 'market' | 'index' | 'sector' | 'stock';
export type RoundtableMode = 'quick' | 'standard' | 'deep';
export type SessionStatus = 'preparing' | 'round1' | 'debating' | 'summarizing' | 'completed' | 'failed';
export type StanceDirection = 'bull' | 'bear' | 'neutral';
export type ConclusionDirection = 'bull' | 'bear' | 'neutral' | 'watch';

export interface Stance {
  direction: StanceDirection;
  confidence: number;
  keyPoints: string;
}

export interface VoteTally {
  bull: number;
  bear: number;
  neutral: number;
}

export interface StanceSummary {
  code: string;
  name: string;
  direction: StanceDirection;
  label: string;
  confidence: number;
  keyPoints: string;
  round: number;
}

export interface RoundtableConsensus {
  conclusion: ConclusionDirection;
  conclusionLabel: string;
  votes: VoteTally;
  stances: StanceSummary[];
  /** 生成引擎统计：命中模型与本地规则占比（模型渠道异常时 degraded=true）。 */
  engine?: {
    degraded: boolean;
    /** 模式要求辩论但第一轮无 LLM 专家时为 true（纯规则不开辩论）。 */
    debateSkipped?: boolean;
    llmCount: number;
    localCount: number;
    models: string[];
  };
}

export interface RoundtableListItem {
  id: number;
  subjectType: SubjectType;
  subjectCode: string | null;
  subjectName: string;
  question: string | null;
  mode: RoundtableMode;
  modelId?: number | null;
  status: SessionStatus;
  errorMessage: string | null;
  consensus: RoundtableConsensus | null;
  createdAt: string;
  updatedAt: string;
}

/** 可选模型（发起会议时的下拉数据）。 */
export interface StockModelOption {
  id: number;
  displayName: string;
  modelKey: string;
}

export interface RoundtableTurn {
  id: number;
  round: number;
  expertCode: string;
  expertName: string;
  content: string | null;
  stance: Stance | null;
  status: string;
  createdAt: string;
}

export interface RoundtableDetail extends Omit<RoundtableListItem, 'consensus'> {
  brief: {
    snapshot?: QuoteSnapshot | null;
    summary?: unknown;
    sectorInfo?: { name: string; pct: number | null; upCount?: number; downCount?: number; leaderName?: string } | null;
    constituents?: Array<{ name: string; pct: number | null }> | null;
    overview?: {
      indexes: Array<{ symbol: string; name: string; price: number; changePct: number }>;
      breadth: { up: number; down: number; approximate: boolean } | null;
      topSectors: SectorItem[];
      bottomSectors: SectorItem[];
    } | null;
  } | null;
  summaryText: string | null;
  consensus: RoundtableConsensus | null;
  turns: RoundtableTurn[];
}

export interface RoundtableListResult {
  items: RoundtableListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- 行情接口 ----------

export const searchMarket = async (keyword: string): Promise<SearchResult> =>
  http.get('/stock/market/search', { params: { keyword } });

export const fetchQuotes = async (symbols: string[]): Promise<QuoteSnapshot[]> =>
  http.get('/stock/market/quote', { params: { symbols: symbols.join(',') } });

export const fetchKline = async (symbol: string, limit = 250): Promise<KlineResult> =>
  http.get('/stock/market/kline', { params: { symbol, limit } });

export const fetchOverview = async (): Promise<MarketOverview> =>
  http.get('/stock/market/overview');

export const fetchSectors = async (type: 'industry' | 'concept' = 'industry'): Promise<{ total: number; items: SectorItem[] }> =>
  http.get('/stock/market/sectors', { params: { type } });

// ---------- 会议接口 ----------

export interface CreateRoundtablePayload {
  subjectType: SubjectType;
  symbol?: string;
  question?: string;
  mode?: RoundtableMode;
  /** 指定模型行 id（空 = 自动：智能体绑定模型 > 任意 chat 渠道）。 */
  modelId?: number;
}

export const fetchStockModels = async (): Promise<StockModelOption[]> =>
  http.get('/stock/models');

export const createRoundtable = async (payload: CreateRoundtablePayload): Promise<{ id: number }> =>
  http.post('/stock/roundtable', payload);

export const getRoundtable = async (id: number): Promise<RoundtableDetail> =>
  http.get(`/stock/roundtable/${id}`);

export const listRoundtables = async (page = 1, pageSize = 20): Promise<RoundtableListResult> =>
  http.get('/stock/roundtable', { params: { page, pageSize } });

export const removeRoundtable = async (id: number): Promise<{ id: number }> =>
  http.delete(`/stock/roundtable/${id}`);

// ---------- SSE 订阅 ----------

export interface RoundtableStreamState {
  stage: string;
  label: string;
  round?: number;
}

export interface RoundtableStreamHandlers {
  onStage?: (stage: RoundtableStreamState) => void;
  onBrief?: (brief: { subjectType: string; subjectName: string; snapshot?: QuoteSnapshot | null }) => void;
  onExpertStart?: (payload: { round: number; code: string; name: string; school: string }) => void;
  onChunk?: (payload: { round: number; code: string; text: string }) => void;
  onExpertDone?: (payload: {
    round: number;
    code: string;
    name: string;
    stance: Stance | null;
    source?: string;
    modelLabel?: string;
    /** 落库回放时携带完整发言内容。 */
    content?: string;
    replay?: boolean;
  }) => void;
  onExpertError?: (payload: { round: number; code: string; name: string; message: string }) => void;
  onVote?: (payload: { round?: number; tally: VoteTally; stances: StanceSummary[] }) => void;
  onConvergence?: (payload: {
    round: number;
    stanceShift: number;
    flipped: string[];
    converged: boolean;
    tally: VoteTally;
    reason: string;
  }) => void;
  onSummaryChunk?: (text: string) => void;
  onSummaryDone?: (consensus: RoundtableConsensus) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  onThinking?: () => void;
  onFatal?: (error: unknown) => void;
}

// 订阅圆桌会议 SSE 流。
export const streamRoundtable = (
  id: number,
  signal: AbortSignal,
  handlers: RoundtableStreamHandlers
): Promise<void> =>
  streamSse(`/api/stock/roundtable/${id}/stream`, {
    signal,
    onEvent: (type, data) => {
      const payload = (data ?? {}) as Record<string, never> & { message?: string; text?: string };
      switch (type) {
        case 'stage':
          handlers.onStage?.(payload as unknown as RoundtableStreamState);
          break;
        case 'brief':
          handlers.onBrief?.(payload as unknown as Parameters<NonNullable<RoundtableStreamHandlers['onBrief']>>[0]);
          break;
        case 'expert_start':
          handlers.onExpertStart?.(payload as unknown as Parameters<NonNullable<RoundtableStreamHandlers['onExpertStart']>>[0]);
          break;
        case 'chunk':
          handlers.onChunk?.(payload as unknown as Parameters<NonNullable<RoundtableStreamHandlers['onChunk']>>[0]);
          break;
        case 'expert_done':
          handlers.onExpertDone?.(payload as unknown as Parameters<NonNullable<RoundtableStreamHandlers['onExpertDone']>>[0]);
          break;
        case 'expert_error':
          handlers.onExpertError?.(payload as unknown as Parameters<NonNullable<RoundtableStreamHandlers['onExpertError']>>[0]);
          break;
        case 'vote':
          handlers.onVote?.(payload as unknown as Parameters<NonNullable<RoundtableStreamHandlers['onVote']>>[0]);
          break;
        case 'convergence':
          handlers.onConvergence?.(payload as unknown as Parameters<NonNullable<RoundtableStreamHandlers['onConvergence']>>[0]);
          break;
        case 'summary_chunk':
          handlers.onSummaryChunk?.(payload.text ?? '');
          break;
        case 'summary_done':
          handlers.onSummaryDone?.(payload as unknown as RoundtableConsensus);
          break;
        case 'done':
          handlers.onDone?.();
          break;
        case 'error':
          handlers.onError?.(payload.message ?? '会议执行失败');
          break;
        case 'thinking':
          handlers.onThinking?.();
          break;
        default:
          break;
      }
    },
    onError: (error) => handlers.onFatal?.(error)
  });
