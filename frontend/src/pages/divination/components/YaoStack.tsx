// 六爻堆叠区：SVG 描边动画，从初爻（下）到上爻（上）逐爻画出。
interface YaoMarkProps {
  symbol: string;
}

const YAO_LINE_LENGTH = 160;

export const YaoMark: React.FC<YaoMarkProps> = ({ symbol }) => {
  const yang = symbol === '—' || symbol === 'O';
  return (
    <svg className="yao-mark" viewBox="0 0 220 24" width="220" height="24">
      {yang ? (
        <line
          className="yao-line"
          x1="10"
          y1="12"
          x2={10 + YAO_LINE_LENGTH}
          y2="12"
          pathLength={100}
        />
      ) : (
        <>
          <line className="yao-line" x1="10" y1="12" x2="80" y2="12" pathLength={100} />
          <line className="yao-line" x1="100" y1="12" x2="170" y2="12" pathLength={100} />
        </>
      )}
      {symbol === 'O' && <circle className="yao-change" cx="200" cy="12" r="9" />}
      {symbol === '×' && (
        <g className="yao-change yao-cross">
          <line x1="191" y1="3" x2="209" y2="21" />
          <line x1="209" y1="3" x2="191" y2="21" />
        </g>
      )}
    </svg>
  );
};

interface YaoStackProps {
  lines?: Array<{ symbol: string; name: string }>;
  /** 已揭晓爻数。 */
  revealedCount: number;
  /** 是否处于摇卦中（控制空槽呼吸动画）。 */
  active?: boolean;
}

const YAO_LABELS = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

export const YaoStack: React.FC<YaoStackProps> = ({ lines, revealedCount, active }) => (
  <div className="yao-stack">
    {Array.from({ length: 6 }).map((_, index) => {
      const slot = lines?.[index];
      const revealed = index < revealedCount && slot;
      return (
        <div className={`yao-row${revealed ? ' yao-row-revealed' : ''}`} key={index}>
          <span className={`yao-label${index === revealedCount && active ? ' yao-label-active' : ''}`}>
            {YAO_LABELS[index]}
            {revealed ? ` · ${slot!.name}` : ''}
          </span>
          <div className={`yao-slot${!revealed && active ? ' yao-slot-pending' : ''}`}>
            {revealed ? <YaoMark symbol={slot!.symbol} /> : null}
          </div>
        </div>
      );
    })}
  </div>
);
