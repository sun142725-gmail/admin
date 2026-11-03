// 内置演示信号（方案 §2.4）：MA 快慢线交叉。防未来函数重点对象——
// 第 i 根的判定只读 sma[·][i] 与 sma[·][i-1]，二者只依赖 closes[0..i]（sma 滑动窗口实现，因果）。
// HTTP 层不接受外部信号数组：信号只由本函数在服务端生成。
// 无 I/O、不依赖 Nest 容器。
import { sma } from '../indicators.util';
import { Bar, Signal } from './backtest.types';

/**
 * MA 交叉演示信号：fast 上穿 slow（prevFast<=prevSlow && fast>slow，双非空）→ buy；
 * 下穿（prevFast>=prevSlow && fast<slow）→ sell。信号 date=T 日（成交在 T+1 开盘，由撮合内核保证）。
 */
export function maCrossDemoSignals(bars: Bar[], fastN = 5, slowN = 20): Signal[] {
  const closes = bars.map((bar) => bar.close);
  const fast = sma(closes, fastN);
  const slow = sma(closes, slowN);
  const signals: Signal[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prevFast = fast[i - 1];
    const prevSlow = slow[i - 1];
    const currFast = fast[i];
    const currSlow = slow[i];
    if (prevFast == null || prevSlow == null || currFast == null || currSlow == null) {
      continue;
    }
    if (prevFast <= prevSlow && currFast > currSlow) {
      signals.push({ date: bars[i].date, action: 'buy' });
    } else if (prevFast >= prevSlow && currFast < currSlow) {
      signals.push({ date: bars[i].date, action: 'sell' });
    }
  }
  return signals;
}
