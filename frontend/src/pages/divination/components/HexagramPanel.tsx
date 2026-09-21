// 第三幕：成卦展示——卦名毛笔字浮现 + 六爻明细（默认展开，解卦开始时收起，可手动开合）。
import { useEffect, useRef, useState } from 'react';
import type { DivinationRecord } from '../types';

interface HexagramPanelProps {
  record: DivinationRecord;
  stage: 'revealing' | 'topic' | 'interpreting' | 'done' | 'failed';
}

const YAO_LABELS = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

export const HexagramPanel: React.FC<HexagramPanelProps> = ({ record, stage }) => {
  // 默认展开；开始解卦（topic → interpreting）时自动收起，也可手动开合。
  const [expanded, setExpanded] = useState(true);
  const prevStage = useRef(stage);
  useEffect(() => {
    if (prevStage.current === 'topic' && stage === 'interpreting') {
      setExpanded(false);
    }
    prevStage.current = stage;
  }, [stage]);
  const movingLines = record.lines.filter(
    (line) => line.symbol === 'O' || line.symbol === '×'
  );
  const hasChange = movingLines.length > 0;
  const isMoving = (symbol: string) => symbol === 'O' || symbol === '×';

  return (
    <div className="hexagram-panel">
      <div className="hexagram-name brush-reveal">{record.hexagramName ?? '卦象已就'}</div>
      {record.changedHexagramName && (
        <div className="hexagram-changed brush-reveal brush-reveal-delay">
          变卦 · {record.changedHexagramName}
        </div>
      )}
      <div className="hexagram-detail">
        <button
          type="button"
          className="hexagram-detail-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          <span>六爻明细{hasChange ? ` · ${movingLines.length} 爻动` : ' · 六爻安静'}</span>
          <span className={`hexagram-caret${expanded ? ' is-open' : ''}`}>›</span>
        </button>
        {expanded && (
          <div className="hexagram-detail-body">
            <table className="hexagram-table">
              <thead>
                <tr>
                  <th>爻位</th>
                  <th>名称</th>
                  <th>符号</th>
                  <th>组合数</th>
                  <th>掷币</th>
                </tr>
              </thead>
              <tbody>
                {record.lines.map((line, index) => (
                  <tr
                    key={line.lineIndex}
                    className={isMoving(line.symbol) ? 'hexagram-row-moving' : ''}
                  >
                    <td>
                      {YAO_LABELS[index]}
                      {isMoving(line.symbol) && <span className="yao-moving-badge">动</span>}
                    </td>
                    <td>{line.name}</td>
                    <td className="hexagram-symbol">{line.symbol}</td>
                    <td>{line.sum}</td>
                    <td>{line.signStr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hexagram-note">
              {hasChange ? (
                <>
                  本卦主当前事态，{movingLines.length} 个动爻为事之转机；变卦「
                  {record.changedHexagramName}」示所问之事的发展趋势。
                </>
              ) : (
                <>六爻安静，无动爻，以本卦断之。</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
