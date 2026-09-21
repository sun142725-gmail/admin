// 第二幕：三枚铜钱 + 碗，逐爻掷币。点一下卜一下，掷币按钮触发单爻动画。
// 铜钱只在点击掷币时播放一次动画，落定后保持本爻结果，等待下一次点击。
import { Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Coin } from './Coin';
import type { DivinationRecord } from '../types';

const YAO_LABELS = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

interface CastPanelProps {
  record: DivinationRecord;
  /** 已揭晓爻数：正在摇的是第 revealedCount 爻（0 起始）。 */
  revealedCount: number;
  /** 是否正在摇掷中（按钮置灰、碗身摇晃）。 */
  tossing: boolean;
  onToss: () => void;
  /** 紧凑模式：成卦后碗区移居左侧，隐藏掷币操作。 */
  compact?: boolean;
}

export const CastPanel: React.FC<CastPanelProps> = ({
  record,
  revealedCount,
  tossing,
  onToss,
  compact = false
}) => {
  // 每次点击掷币（tossing 由 false 变 true）时动画代数 +1，触发铜钱重掷。
  const [generation, setGeneration] = useState(0);
  const prevTossing = useRef(false);
  useEffect(() => {
    if (tossing && !prevTossing.current) {
      setGeneration((value) => value + 1);
    }
    prevTossing.current = tossing;
  }, [tossing]);

  // 铜钱展示的是最近一爻的结果：掷第 revealedCount+1 爻时（还没揭晓）用 lines[revealedCount]。
  const tossIndex = tossing ? Math.min(revealedCount, record.lines.length - 1) : Math.max(0, revealedCount - 1);
  const currentLine = record.lines[tossIndex] ?? record.lines[0];
  const yangFlags = currentLine
    ? [0, 1, 2].map((index) => currentLine.signStr[index] === '正')
    : [true, true, true];
  const finished = revealedCount >= record.lines.length;

  return (
    <div className="cast-panel">
      <div className={`cast-bowl${tossing ? ' cast-bowl-shaking' : ''}`}>
        <div className="cast-coins">
          {yangFlags.map((yang, index) => (
            <Coin key={index} yang={yang} delay={index * 80} playId={generation} />
          ))}
        </div>
        <div className="cast-bowl-body">
          <span className="cast-bowl-rim" />
        </div>
        <span className="cast-bowl-shadow" />
      </div>
      <div className="cast-progress">
        {finished ? (
          <span className="cast-step">六爻已就</span>
        ) : compact ? (
          <span className="cast-step">摇卦中</span>
        ) : (
          <>
            <span className="cast-step">
              第 {revealedCount + 1} 爻 · {YAO_LABELS[revealedCount]}
            </span>
            <Button
              type="primary"
              className="toss-button"
              size="small"
              disabled={tossing}
              onClick={onToss}
            >
              {tossing ? '掷币中…' : '掷 币'}
            </Button>
          </>
        )}
      </div>
      {!compact && (
        <div
          className="cast-progress-bar"
          style={{ width: `${(revealedCount / record.lines.length) * 100}%` }}
        />
      )}
    </div>
  );
};
