// 铜钱：清代制钱形制的 SVG（外郭 → 地章 → 内郭 → 方孔，钱文对读）。
// 钱币学：乾隆通宝字面为正面，满文记局面为背面；钱文对读（上乾 下隆 右通 左宝）。
// 占卜传统：背为阳、字为阴 —— 背面（记号面）朝上为阳（3 分），字面朝上为阴（2 分）。
// 由父组件通过 playId 变化重新触发一次抛掷动画，落定角度由爻结果决定。
import { useEffect, useState } from 'react';

interface CoinProps {
  /** 该枚是否为阳面。 */
  yang: boolean;
  /** 抛起延迟（毫秒），三枚错峰。 */
  delay: number;
  /** 变化时重新播放动画。 */
  playId: number;
}

/** 钱体（郭、地章、方孔）共用结构：光从左上，孔内上亮下暗。 */
const CoinBody: React.FC<{ idPrefix: string }> = ({ idPrefix }) => (
  <>
    <defs>
      {/* 地章：黄铜哑光，左上受光 */}
      <radialGradient id={`${idPrefix}-body`} cx="40%" cy="30%" r="85%">
        <stop offset="0%" stopColor="#e6c98c" />
        <stop offset="38%" stopColor="#d0aa61" />
        <stop offset="74%" stopColor="#ac8442" />
        <stop offset="100%" stopColor="#836029" />
      </radialGradient>
      {/* 外郭：立缘（中段被地章覆盖，只露出外侧环带），外暗内亮 */}
      <radialGradient id={`${idPrefix}-rim`} cx="50%" cy="38%" r="62%">
        <stop offset="0%" stopColor="#c69d52" />
        <stop offset="86%" stopColor="#8a652c" />
        <stop offset="100%" stopColor="#66481d" />
      </radialGradient>
      <filter id={`${idPrefix}-blur`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
    {/* 外郭与地章 */}
    <circle cx="60" cy="60" r="58" fill={`url(#${idPrefix}-rim)`} stroke="#4f3814" strokeWidth="1.8" />
    <circle cx="60" cy="60" r="56.6" fill="none" stroke="rgba(255,232,175,0.32)" strokeWidth="1.1" />
    <circle cx="60" cy="60" r="52" fill={`url(#${idPrefix}-body)`} />
    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(56,39,13,0.5)" strokeWidth="1.2" />
    {/* 地章顶部弧光与底部沉影，撑起钱面弧度 */}
    <path
      d="M 22 40 A 46 46 0 0 1 98 40"
      fill="none"
      stroke="rgba(255,243,208,0.34)"
      strokeWidth="6"
      strokeLinecap="round"
      filter={`url(#${idPrefix}-blur)`}
    />
    <path
      d="M 28 88 A 46 46 0 0 0 92 88"
      fill="none"
      stroke="rgba(52,35,10,0.28)"
      strokeWidth="5"
      strokeLinecap="round"
      filter={`url(#${idPrefix}-blur)`}
    />
    {/* 内郭（方孔凸缘）：外暗内亮双线 */}
    <rect x="40" y="40" width="40" height="40" fill="none" stroke="rgba(58,40,14,0.6)" strokeWidth="1.6" />
    <rect x="42.4" y="42.4" width="35.2" height="35.2" fill="none" stroke="rgba(255,236,185,0.26)" strokeWidth="1" />
    {/* 穿孔：暗腔 + 孔缘受光 + 底部微透光 */}
    <rect x="46" y="46" width="28" height="28" fill="#2a1c08" stroke="rgba(20,13,3,0.6)" strokeWidth="1" />
    <path d="M 46.8 46.8 H 73.2" stroke="rgba(255,238,190,0.4)" strokeWidth="1.2" />
    <path d="M 46.8 46.8 V 73.2" stroke="rgba(255,238,190,0.2)" strokeWidth="1" />
    <rect x="47.4" y="68.6" width="25.2" height="4.4" fill="rgba(212,170,100,0.2)" />
    {/* 包浆：大而淡的色斑（模糊处理，避免脏点感） */}
    <ellipse cx="89" cy="83" rx="10" ry="7" fill="rgba(104,118,82,0.13)" filter={`url(#${idPrefix}-blur)`} />
    <ellipse cx="30" cy="88" rx="8" ry="5.5" fill="rgba(104,118,82,0.1)" filter={`url(#${idPrefix}-blur)`} />
    <ellipse cx="86" cy="33" rx="7" ry="5" fill="rgba(70,52,20,0.14)" filter={`url(#${idPrefix}-blur)`} />
  </>
);

/** 钱文双层：下层投影 + 上层字身，模拟阳文铸字的浮雕感。 */
const Inscription: React.FC<{
  glyph: string;
  x: number;
  y: number;
  size: number;
}> = ({ glyph, x, y, size }) => (
  <g
    fontFamily="'Kaiti SC','KaiTi','STKaiti','Noto Serif SC',serif"
    fontWeight="700"
    fontSize={size}
    textAnchor="middle"
    dominantBaseline="central"
  >
    <text x={x + 0.9} y={y + 1.1} fill="rgba(42,28,8,0.5)">
      {glyph}
    </text>
    <text x={x} y={y} fill="#57401a" stroke="rgba(255,238,195,0.22)" strokeWidth="0.6">
      {glyph}
    </text>
  </g>
);

const CoinObverse = () => (
  <svg className="coin-svg" viewBox="0 0 120 120" aria-hidden>
    <CoinBody idPrefix="coin-ob" />
    {/* 乾隆通宝：对读（上乾 下隆 右通 左宝） */}
    <Inscription glyph="乾" x={60} y={25.5} size={21} />
    <Inscription glyph="隆" x={60} y={94.5} size={21} />
    <Inscription glyph="通" x={94.5} y={60} size={21} />
    <Inscription glyph="宝" x={25.5} y={60} size={21} />
  </svg>
);

const CoinReverse = () => (
  <svg className="coin-svg" viewBox="0 0 120 120" aria-hidden>
    <CoinBody idPrefix="coin-re" />
    {/* 背面记局：满文宝泉/宝源以汉字「泉」「源」示意，分列穿孔左右 */}
    <Inscription glyph="泉" x={27} y={60} size={19} />
    <Inscription glyph="源" x={93} y={60} size={19} />
  </svg>
);

export const Coin: React.FC<CoinProps> = ({ yang, delay, playId }) => {
  const [flying, setFlying] = useState(false);
  const [spins, setSpins] = useState(0);

  useEffect(() => {
    // playId 为 0 表示尚未开始掷币，铜钱静置不动。
    if (playId === 0) {
      setFlying(false);
      setSpins(0);
      return;
    }
    setFlying(false);
    setSpins(0);
    const tossTimer = window.setTimeout(() => {
      setFlying(true);
      setSpins(1080); // 三整圈，过渡动画落定
    }, delay);
    const settleTimer = window.setTimeout(() => {
      setSpins(1080 + (yang ? 0 : 180)); // 再转半圈落到指定面
    }, delay + 850);
    return () => {
      window.clearTimeout(tossTimer);
      window.clearTimeout(settleTimer);
    };
  }, [playId, yang, delay]);

  return (
    <div className={`coin${flying ? ' coin-flying' : ''}`}>
      <div
        className="coin-inner"
        style={{ transform: `rotateX(${spins}deg)`, transition: spins === 0 ? 'none' : undefined }}
      >
        <div className="coin-face">
          {/* 静止面：背面（记号）＝阳，掷出“正”时朝上。 */}
          <CoinReverse />
        </div>
        <div className="coin-face coin-face-yin">
          {/* 翻转面：正面（乾隆通宝）＝字＝阴，掷出“负”时朝上。 */}
          <CoinObverse />
        </div>
      </div>
    </div>
  );
};
