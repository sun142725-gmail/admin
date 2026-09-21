// 解卦面板：先补填所问之事（解卦时再写），提交后 SSE 实时逐字输出；失败可重试。
import { Button, Input } from 'antd';
import { useState } from 'react';
import type { DivinationRecord } from '../types';

const TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];

interface InterpretationPanelProps {
  record: DivinationRecord;
  stage: 'topic' | 'interpreting' | 'done' | 'failed';
  streamText: string;
  streamError: string | null;
  submitting: boolean;
  onSubmitTopic: (topic: string) => void;
  onRetry: () => void;
}

export const InterpretationPanel: React.FC<InterpretationPanelProps> = ({
  record,
  stage,
  streamText,
  streamError,
  submitting,
  onSubmitTopic,
  onRetry
}) => {
  const [topicInput, setTopicInput] = useState('');
  const [topicError, setTopicError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = topicInput.trim();
    if (!trimmed) {
      setTopicError('请写下所问之事');
      return;
    }
    setTopicError(null);
    onSubmitTopic(trimmed);
  };

  // 仅在解卦中且尚无内容时展示加载动画（done 后不再转圈）。
  const waiting = stage === 'interpreting' && !streamText && !streamError;

  return (
    <div className="interp-panel">
      <div className="interp-title">
        <span className="interp-title-mark">解卦</span>
      </div>

      {stage === 'topic' && (
        <div className="topic-form">
          <p className="topic-form-tip">写下刚刚心中默念之事：</p>
          <Input
            className="topic-input"
            placeholder="所问之事，如：今年事业走向"
            value={topicInput}
            maxLength={50}
            disabled={submitting}
            onChange={(event) => {
              setTopicInput(event.target.value);
              if (topicError) {
                setTopicError(null);
              }
            }}
            onPressEnter={submit}
          />
          <div className="topic-form-foot">
            <span className="wish-count">{topicInput.length}/50</span>
            {topicError && <span className="wish-error">{topicError}</span>}
            <Button
              type="primary"
              className="toss-button"
              loading={submitting}
              onClick={submit}
            >
              开始解卦
            </Button>
          </div>
        </div>
      )}

      {stage !== 'topic' && (
        <>
          {streamError ? (
            <div className="interp-error">
              <span>⚠ {streamError}</span>
              <Button size="small" className="interp-retry" onClick={onRetry}>
                重新解读
              </Button>
            </div>
          ) : (
            <div className="interp-body">
              {waiting && (
                <div className="bagua-loader" aria-label="解卦生成中">
                  {TRIGRAMS.map((trigram, index) => (
                    <span
                      key={trigram}
                      className="bagua-loader-item"
                      style={{ transform: `rotate(${index * 45}deg) translateY(-34px)` }}
                    >
                      {trigram}
                    </span>
                  ))}
                  <span className="bagua-loader-core">☯</span>
                </div>
              )}
              {record.topic && <p className="interp-topic">所问：「{record.topic}」</p>}
              <p className="interp-text">
                {streamText}
                {!waiting && stage !== 'done' && <span className="interp-caret" />}
                {stage === 'done' && !streamText && <span>卦象已成，本次解读为空。</span>}
              </p>
              {stage === 'done' && <div className="interp-done-mark">—— 卦毕 ——</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
};
