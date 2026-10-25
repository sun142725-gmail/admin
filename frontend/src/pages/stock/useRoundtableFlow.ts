// 圆桌会议流状态机：管理会话生命周期、各专家流式文本与投票汇总。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConclusionDirection,
  CreateRoundtablePayload,
  RoundtableConsensus,
  StanceSummary,
  VoteTally,
  createRoundtable,
  getRoundtable,
  streamRoundtable
} from '../../api/stock';

export interface ExpertRuntime {
  code: string;
  /** 每轮发言文本，key 为轮次。 */
  contents: Record<number, string>;
  /** 各轮立场，key 为轮次。 */
  stances: Record<number, import('../../api/stock').Stance | null>;
  /** 当前是否正在发言（任意轮）。 */
  speaking: boolean;
  failed: boolean;
}

export type SessionPhase = 'idle' | 'running' | 'completed' | 'failed';

export interface RoundtableSession {
  id: number | null;
  phase: SessionPhase;
  stage: string;
  stageLabel: string;
  stageRound: number;
  experts: Record<string, ExpertRuntime>;
  votes: VoteTally | null;
  stances: StanceSummary[];
  summaryText: string;
  consensus: RoundtableConsensus | null;
  errorMessage: string | null;
  subjectName: string;
  /** 讨论过程时间线（按发言顺序）。 */
  timeline: TimelineItem[];
  /** 最近一次收敛检测（辩论达到相对平衡点时提示）。 */
  convergence: { round: number; stanceShift: number; converged: boolean; reason: string } | null;
}

/** 时间线条目：一位专家一轮的完整发言。 */
export interface TimelineItem {
  key: string;
  round: number;
  code: string;
  name: string;
  school: string;
  text: string;
  stance: import('../../api/stock').Stance | null;
  speaking: boolean;
  failed: boolean;
}

const emptyExperts = (): Record<string, ExpertRuntime> => {
  const map: Record<string, ExpertRuntime> = {};
  ['stock-trend', 'stock-momentum', 'stock-flow', 'stock-value', 'stock-risk'].forEach((code) => {
    map[code] = { code, contents: {}, stances: {}, speaking: false, failed: false };
  });
  return map;
};

const initialSession: RoundtableSession = {
  id: null,
  phase: 'idle',
  stage: '',
  stageLabel: '',
  stageRound: 0,
  experts: emptyExperts(),
  votes: null,
  stances: [],
  summaryText: '',
  consensus: null,
  errorMessage: null,
  subjectName: '',
  timeline: [],
  convergence: null
};

export const useRoundtableFlow = () => {
  const [session, setSession] = useState<RoundtableSession>(initialSession);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    setSession({ ...initialSession, experts: emptyExperts() });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const attach = useCallback((id: number) => {
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = id;
    void streamRoundtable(id, controller.signal, {
      onStage: (payload) =>
        setSession((prev) => ({
          ...prev,
          stage: payload.stage,
          stageLabel: payload.label,
          stageRound: payload.round ?? prev.stageRound
        })),
      onBrief: (payload) =>
        setSession((prev) => ({ ...prev, subjectName: payload.subjectName ?? prev.subjectName })),
      onExpertStart: (payload) =>
        setSession((prev) => ({
          ...prev,
          experts: {
            ...prev.experts,
            [payload.code]: {
              ...prev.experts[payload.code],
              speaking: true,
              contents: { ...prev.experts[payload.code]?.contents, [payload.round]: '' }
            }
          },
          timeline: [
            ...prev.timeline,
            {
              key: `${payload.round}-${payload.code}`,
              round: payload.round,
              code: payload.code,
              name: payload.name,
              school: payload.school,
              text: '',
              stance: null,
              speaking: true,
              failed: false
            }
          ]
        })),
      onChunk: (payload) =>
        setSession((prev) => {
          const expert = prev.experts[payload.code];
          if (!expert) {
            return prev;
          }
          const current = expert.contents[payload.round] ?? '';
          const timeline = prev.timeline.map((item) =>
            item.key === `${payload.round}-${payload.code}`
              ? { ...item, text: item.text + payload.text }
              : item
          );
          return {
            ...prev,
            timeline,
            experts: {
              ...prev.experts,
              [payload.code]: {
                ...expert,
                contents: { ...expert.contents, [payload.round]: current + payload.text }
              }
            }
          };
        }),
      onExpertDone: (payload) =>
        setSession((prev) => {
          const expert = prev.experts[payload.code];
          if (!expert) {
            return prev;
          }
          const timeline = prev.timeline.map((item) =>
            item.key === `${payload.round}-${payload.code}`
              ? {
                  ...item,
                  speaking: false,
                  stance: payload.stance ?? item.stance,
                  text: payload.replay && payload.content ? payload.content : item.text
                }
              : item
          );
          return {
            ...prev,
            timeline,
            experts: {
              ...prev.experts,
              [payload.code]: {
                ...expert,
                speaking: false,
                failed: false,
                // 进程重启后的落库回放会携带完整 content（replay 标记）。
                contents: payload.replay && payload.content ? { ...expert.contents, [payload.round]: payload.content } : expert.contents,
                stances: { ...expert.stances, [payload.round]: payload.stance }
              }
            }
          };
        }),
      onExpertError: (payload) =>
        setSession((prev) => ({
          ...prev,
          timeline: prev.timeline.map((item) =>
            item.key === `${payload.round}-${payload.code}` ? { ...item, speaking: false, failed: true } : item
          ),
          experts: {
            ...prev.experts,
            [payload.code]: { ...prev.experts[payload.code], speaking: false, failed: true }
          }
        })),
      onVote: (payload) => setSession((prev) => ({ ...prev, votes: payload.tally, stances: payload.stances })),
      onConvergence: (payload) =>
        setSession((prev) => ({
          ...prev,
          convergence: {
            round: payload.round,
            stanceShift: payload.stanceShift,
            converged: payload.converged,
            reason: payload.reason
          }
        })),
      onSummaryChunk: (text) => setSession((prev) => ({ ...prev, summaryText: prev.summaryText + text })),
      onSummaryDone: (consensus) => setSession((prev) => ({ ...prev, consensus })),
      onDone: () =>
        setSession((prev) => ({
          ...prev,
          phase: 'completed',
          stage: 'completed',
          stageLabel: '会议结束'
        })),
      onError: (message) =>
        setSession((prev) => ({ ...prev, phase: 'failed', errorMessage: message })),
      onFatal: () =>
        setSession((prev) =>
          prev.phase === 'running'
            ? { ...prev, phase: 'failed', errorMessage: '连接中断，请稍后在会议记录中查看结果' }
            : prev
        )
    });
  }, []);

  const start = useCallback(
    async (payload: CreateRoundtablePayload, displayName?: string): Promise<string | null> => {
      reset();
      try {
        const { id } = await createRoundtable(payload);
        setSession((prev) => ({
          ...prev,
          id,
          phase: 'running',
          stage: 'preparing',
          stageLabel: '数据准备',
          subjectName:
            displayName ||
            (payload.subjectType === 'market' ? 'A股大盘' : payload.symbol || '圆桌会议')
        }));
        attach(id);
        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : '发起会议失败';
        setSession((prev) => ({ ...prev, phase: 'failed', errorMessage: message }));
        return message;
      }
    },
    [attach, reset]
  );

  /** 从历史记录恢复一场已完成的会议（静态回放，不接 SSE）。 */
  const restore = useCallback(async (id: number) => {
    reset();
    const detail = await getRoundtable(id);
    const experts = emptyExperts();
    const timeline: TimelineItem[] = detail.turns.map((turn) => {
      const runtime = experts[turn.expertCode];
      if (runtime) {
        runtime.contents[turn.round] = turn.content ?? '';
        runtime.stances[turn.round] = turn.stance;
        runtime.failed = turn.status !== 'ok';
      }
      const [school, name] = turn.expertName.split('·');
      return {
        key: `${turn.round}-${turn.expertCode}`,
        round: turn.round,
        code: turn.expertCode,
        name: name ?? turn.expertName,
        school: school ?? '',
        text: turn.content ?? '',
        stance: turn.stance,
        speaking: false,
        failed: turn.status !== 'ok'
      };
    });
    setSession({
      id: detail.id,
      phase: detail.status === 'completed' ? 'completed' : detail.status === 'failed' ? 'failed' : 'running',
      stage: detail.status,
      stageLabel: detail.status === 'completed' ? '会议结束' : '历史回放',
      stageRound: 0,
      experts,
      votes: detail.consensus?.votes ?? null,
      stances: detail.consensus?.stances ?? [],
      summaryText: detail.summaryText ?? '',
      consensus: detail.consensus ?? null,
      errorMessage: detail.errorMessage,
      subjectName: detail.subjectName,
      timeline,
      convergence: null
    });
  }, [reset]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { session, start, reset, stop, restore };
};

export const conclusionColor = (conclusion: ConclusionDirection | undefined): string =>
  conclusion === 'bull' ? '#f5222d' : conclusion === 'bear' ? '#16a34a' : '#737373';
