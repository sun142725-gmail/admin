// 专家卡片：头像/流派/立场徽章/置信度 + 当前轮次流式发言。
import React, { useEffect, useRef } from 'react';
import { Progress, Tag, Tooltip } from 'antd';
import type { ExpertRuntime } from '../useRoundtableFlow';
import { STANCE_COLOR, STANCE_LABEL, expertOf } from '../experts';

interface Props {
  runtime: ExpertRuntime;
  /** 展示的轮次（取该专家最新有内容的轮次）。 */
  activeRound: number;
}

export const ExpertCard: React.FC<Props> = ({ runtime, activeRound }) => {
  const meta = expertOf(runtime.code);
  const textRef = useRef<HTMLDivElement>(null);

  const rounds = Object.keys(runtime.contents)
    .map(Number)
    .filter((round) => (runtime.contents[round] ?? '').length > 0 || runtime.stances[round]);
  const latestRound = rounds.includes(activeRound) ? activeRound : rounds[rounds.length - 1] ?? activeRound;
  const content = runtime.contents[latestRound] ?? '';
  const stance = runtime.stances[latestRound] ?? null;
  const fallbackStance =
    stance ??
    (Object.values(runtime.stances).filter(Boolean) as NonNullable<typeof stance>[]).slice(-1)[0] ??
    null;

  // 流式输出时自动滚到底部。
  useEffect(() => {
    const node = textRef.current;
    if (node && runtime.speaking) {
      node.scrollTop = node.scrollHeight;
    }
  }, [content, runtime.speaking]);

  return (
    <div className={`expert-card ${runtime.speaking ? 'expert-card-speaking' : ''}`} style={{ borderColor: runtime.speaking ? meta.color : undefined }}>
      <div className="flex items-center gap-2">
        <span className="expert-avatar" style={{ background: `${meta.color}1a`, color: meta.color }}>
          {meta.avatar}
        </span>
        <div className="min-w-0">
          <div className="font-medium text-sm leading-5">
            {meta.name}
            <span className="text-text-sub text-xs ml-1">{meta.school}</span>
          </div>
          <div className="flex items-center gap-1">
            {fallbackStance ? (
              <Tag
                color={fallbackStance.direction === 'bull' ? 'red' : fallbackStance.direction === 'bear' ? 'green' : 'default'}
                style={{ marginInlineEnd: 0 }}
              >
                {STANCE_LABEL[fallbackStance.direction]}
              </Tag>
            ) : (
              <Tag style={{ marginInlineEnd: 0 }}>{runtime.failed ? '离线' : '待发言'}</Tag>
            )}
            {fallbackStance && (
              <Tooltip title={`置信度 ${fallbackStance.confidence}`}>
                <div className="w-14">
                  <Progress
                    percent={fallbackStance.confidence}
                    size="small"
                    showInfo={false}
                    strokeColor={STANCE_COLOR[fallbackStance.direction]}
                    trailColor="#f0f0f0"
                  />
                </div>
              </Tooltip>
            )}
            {rounds.length > 1 && <span className="text-xs text-text-sub">R{latestRound}</span>}
          </div>
        </div>
      </div>
      <div ref={textRef} className="expert-content text-xs text-text-main leading-5">
        {content || <span className="text-text-sub">{runtime.speaking ? '正在思考…' : '等待发言'}</span>}
        {runtime.speaking && <span className="caret-blink">▍</span>}
      </div>
    </div>
  );
};
