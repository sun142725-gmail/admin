// 铜钱：写实乾隆通宝风格 SVG。
// 钱币学：乾隆通宝四字面为正面（字面），满文泉源面为背面。
// 占卜传统：背为阳、字为阴 —— 泉源面（背）朝上为阳（3 分），乾隆通宝面（字）朝上为阴（2 分）。
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

const CoinObverse = () => (
  <svg className="coin-svg" viewBox="0 0 100 100" aria-hidden>
    <defs>
      <radialGradient id="coin-bronze" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#eed398" />
        <stop offset="45%" stopColor="#cda457" />
        <stop offset="80%" stopColor="#a37c34" />
        <stop offset="100%" stopColor="#7c5a22" />
      </radialGradient>
      <linearGradient id="coin-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
        <stop offset="30%" stopColor="rgba(255,255,255,0.08)" />
        <stop offset="60%" stopColor="rgba(62,42,10,0.1)" />
        <stop offset="100%" stopColor="rgba(40,26,4,0.4)" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#coin-bronze)" stroke="#5f451c" strokeWidth="2.5" />
    <circle cx="50" cy="50" r="43" fill="none" stroke="#a37f3a" strokeWidth="1.4" opacity="0.9" />
    {/* 方孔：深色内壁模拟穿孔纵深 */}
    <rect x="39.5" y="39.5" width="21" height="21" fill="#3f2f10" stroke="#6d5122" strokeWidth="1.6" />
    <rect x="41" y="41" width="18" height="18" fill="#553f16" />
    {/* 四字对读：上乾 下通 右隆 左宝 */}
    <g
      fill="#5c431a"
      fontFamily="'Kaiti SC','KaiTi','STKaiti','Noto Serif SC',serif"
      fontWeight="700"
      fontSize="20"
      textAnchor="middle"
      dominantBaseline="central"
    >
      <text x="50" y="28">乾</text>
      <text x="50" y="72">通</text>
      <text x="72" y="50">隆</text>
      <text x="28" y="50">宝</text>
    </g>
    {/* 包浆斑点 */}
    <circle cx="24" cy="36" r="3.2" fill="rgba(94,115,74,0.22)" />
    <circle cx="76" cy="68" r="2.6" fill="rgba(94,115,74,0.18)" />
    <circle cx="70" cy="26" r="1.8" fill="rgba(74,55,20,0.25)" />
    <circle cx="30" cy="72" r="2.2" fill="rgba(120,90,40,0.2)" />
    {/* 金属光泽 */}
    <circle cx="50" cy="50" r="48" fill="url(#coin-sheen)" />
  </svg>
);

const CoinReverse = () => (
  <svg className="coin-svg" viewBox="0 0 100 100" aria-hidden>
    <circle cx="50" cy="50" r="48" fill="url(#coin-bronze)" stroke="#5f451c" strokeWidth="2.5" />
    <circle cx="50" cy="50" r="43" fill="none" stroke="#a37f3a" strokeWidth="1.4" opacity="0.9" />
    <rect x="39.5" y="39.5" width="21" height="21" fill="#3f2f10" stroke="#6d5122" strokeWidth="1.6" />
    {/* 背面满文记号：左右两列星月纹 + 竖排宝泉印 */}
    <g
      fill="#5c431a"
      fontFamily="'Kaiti SC','KaiTi','STKaiti',serif"
      fontWeight="700"
      fontSize="14"
      textAnchor="middle"
      dominantBaseline="central"
    >
      <text x="26" y="50">泉</text>
      <text x="74" y="50">源</text>
    </g>
    <circle cx="27" cy="32" r="2" fill="#6d5122" />
    <circle cx="73" cy="32" r="2" fill="#6d5122" />
    <circle cx="24" cy="66" r="3" fill="rgba(94,115,74,0.22)" />
    <circle cx="78" cy="38" r="2.4" fill="rgba(94,115,74,0.18)" />
    <circle cx="50" cy="50" r="48" fill="url(#coin-sheen)" />
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
          {/* 静止面：背面（泉源）＝阳，掷出“正”时朝上。 */}
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
