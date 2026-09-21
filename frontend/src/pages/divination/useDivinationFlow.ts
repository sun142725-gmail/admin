// 占卜流程状态机：idle 起卦 → casting 逐爻掷币（点一下卜一爻）→ revealing 成卦
// → topic 补填所问之事 → interpreting 流式解卦 → done / failed。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDivination,
  reinterpretDivination,
  setTopicDivination,
  streamInterpretation
} from '../../api/divination';
import type { DivinationRecord } from './types';

export type DivinationStage =
  | 'idle'
  | 'casting'
  | 'revealing'
  | 'topic'
  | 'interpreting'
  | 'done'
  | 'failed';

/** 单次掷币动画时长（毫秒）：铜钱抛落 1.15s + 爻线描边预留。 */
export const TOSS_DURATION_MS = 1250;
/** 卦名浮现时长（毫秒）。 */
export const NAME_REVEAL_MS = 1400;

export function useDivinationFlow() {
  const [stage, setStage] = useState<DivinationStage>('idle');
  const [topic, setTopic] = useState('');
  const [record, setRecord] = useState<DivinationRecord | null>(null);
  /** 已揭晓的爻数量（0~6，每点一次掷币 +1）。 */
  const [revealedCount, setRevealedCount] = useState(0);
  /** 当前是否正在摇掷（掷币按钮置灰、铜钱动画中）。 */
  const [tossing, setTossing] = useState(false);
  /** 补填主题的提交中状态。 */
  const [submitting, setSubmitting] = useState(false);
  /** SSE 已接收的解卦文本。 */
  const [streamText, setStreamText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const timersRef = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // 起卦：创建记录（不含主题），进入逐爻掷币阶段。
  const start = useCallback(async () => {
    clearTimers();
    abortRef.current?.abort();
    setTopic('');
    setRecord(null);
    setRevealedCount(0);
    setTossing(false);
    setStreamText('');
    setStreamError(null);
    setLoading(true);
    try {
      const data = await createDivination();
      setRecord(data);
      setStage('casting');
    } catch {
      setStreamError('起卦失败，请稍后再试');
      setStage('failed');
    } finally {
      setLoading(false);
    }
  }, [addTimer, clearTimers]);

  // 掷一爻：点一下卜一下。动画结束后揭晓该爻，六爻齐后进入成卦。
  const toss = useCallback(() => {
    if (stage !== 'casting' || !record || tossing || revealedCount >= 6) {
      return;
    }
    setTossing(true);
    const nextCount = revealedCount + 1;
    addTimer(() => {
      setRevealedCount(nextCount);
      addTimer(() => {
        setTossing(false);
        if (nextCount >= 6) {
          addTimer(() => setStage('revealing'), 500);
          addTimer(() => setStage('topic'), 500 + NAME_REVEAL_MS);
        }
      }, 600);
    }, TOSS_DURATION_MS);
  }, [stage, record, tossing, revealedCount, addTimer]);

  const reset = useCallback(() => {
    clearTimers();
    abortRef.current?.abort();
    setStage('idle');
    setTopic('');
    setRecord(null);
    setRevealedCount(0);
    setTossing(false);
    setStreamText('');
    setStreamError(null);
  }, [clearTimers]);

  // 补填主题：填完才进入解卦（心诚后问，卦方有验）。
  const submitTopic = useCallback(
    async (nextTopic: string) => {
      if (!record) {
        return;
      }
      setSubmitting(true);
      try {
        const data = await setTopicDivination(record.id, nextTopic);
        setTopic(data.topic);
        setRecord(data);
        setStage('interpreting');
      } catch {
        setStreamError('提交主题失败，请重试');
        setStage('failed');
      } finally {
        setSubmitting(false);
      }
    },
    [record]
  );

  const retry = useCallback(async () => {
    if (!record) {
      reset();
      return;
    }
    try {
      const data = await reinterpretDivination(record.id);
      // 成卦后还未述事的记录：回到补填主题，而不是徒劳重连。
      if (data.needsTopic) {
        setStreamText('');
        setStreamError(null);
        setStage('topic');
        return;
      }
    } catch {
      // reinterpret 失败也尝试重连流，由服务端判定状态。
    }
    setStreamText('');
    setStreamError(null);
    setStage('interpreting');
  }, [record, reset]);

  // 进入解卦阶段后建立 SSE 长连接，实时接收解卦文本。
  useEffect(() => {
    if (stage !== 'interpreting' || !record) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;
    streamInterpretation(record.id, controller.signal, {
      onChunk: (text) => {
        setStreamText((prev) => prev + text);
      },
      onDone: () => {
        finished = true;
        setStage('done');
      },
      onError: (message) => {
        finished = true;
        setStreamError(message);
        setStage('failed');
      },
      onFatal: () => {
        if (!finished) {
          setStreamError('解卦连接中断');
          setStage('failed');
        }
      }
    });
    return () => {
      controller.abort();
    };
  }, [stage, record]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    stage,
    topic,
    record,
    revealedCount,
    tossing,
    loading,
    submitting,
    streamText,
    streamError,
    start,
    toss,
    reset,
    submitTopic,
    retry
  };
}
