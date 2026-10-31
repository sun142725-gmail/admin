// K 线抽屉：在自选股 / 选股结果等列表里点击股票，弹出 K 线（蜡烛 + MA + 成交量 + 副图指标 + 周期页签）。
// 数据走 GET /api/stock/market/kline（后端算好指标），支持个股 / 指数 / 东财板块代码。
import React, { useEffect, useState } from 'react';
import Alert from 'antd/es/alert';
import Spin from 'antd/es/spin';
import { KlineFreq, KlineResult, fetchKline } from '../../../api/stock';
import { SelfDrawer } from '../../../components/base/SelfDrawer';
import { KlineChart } from './KlineChart';

interface Props {
  open: boolean;
  symbol: string | null;
  name?: string | null;
  onClose: () => void;
}

/** 列表行点击复用的守卫：点到按钮/链接/输入框/弹层时不当作「点击股票」处理。 */
export const isStockRowClickIgnored = (event: React.MouseEvent): boolean =>
  Boolean(
    (event.target as HTMLElement | null)?.closest(
      'button, a, input, textarea, .ant-popover, .ant-modal, .ant-dropdown, .ant-tooltip'
    )
  );

export const KlineDrawer: React.FC<Props> = ({ open, symbol, name, onClose }) => {
  const [result, setResult] = useState<KlineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 周期与各复用方独立记忆（不进 redux）：切换标的时保留用户所选周期
  const [freq, setFreq] = useState<KlineFreq>('day');

  useEffect(() => {
    if (!open || !symbol) {
      setResult(null);
      setError(null);
      return;
    }
    let stopped = false;
    setLoading(true);
    setError(null);
    // 保留旧 result：切周期时旧图继续渲染，新数据到达后原位替换（防抽屉内容整块闪烁）
    fetchKline(symbol, 250, freq)
      .then((res) => {
        if (stopped) {
          return;
        }
        if (!res.items.length) {
          setError('该标的暂无K线数据');
        } else {
          setResult(res);
        }
      })
      .catch(() => {
        if (!stopped) {
          setError('K线数据加载失败，请稍后重试');
        }
      })
      .finally(() => {
        if (!stopped) {
          setLoading(false);
        }
      });
    return () => {
      stopped = true;
    };
  }, [open, symbol, freq]);

  const last = result?.items[result.items.length - 1];
  const displayName = result?.name || name || symbol || '';
  const pct = last?.pct;

  return (
    // 900 为刻度外散值（README 归档映射要求专项截图比对后方可收敛，未复核前保持透传；80vw wrapper 兜底小屏）
    <SelfDrawer
      open={open}
      onClose={onClose}
      width={900}
      title={
        <span>
          <span className="font-medium">{displayName}</span>
          {symbol && <span className="ml-2 font-mono text-xs text-text-sub">{symbol.toUpperCase()}</span>}
        </span>
      }
    >
      {error && !result ? (
        <Alert type="warning" showIcon message={error} />
      ) : result && last ? (
        <div className="relative flex flex-col gap-2">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-black/40">
              <Spin tip="加载K线数据…" />
            </div>
          )}
          <div className="flex items-baseline gap-3">
            <span className={`text-2xl font-semibold font-mono ${(pct ?? 0) > 0 ? 'text-stock-up' : (pct ?? 0) < 0 ? 'text-stock-down' : undefined}`}>
              {last.close.toFixed(2)}
            </span>
            {pct != null && (
              <span className={`text-sm font-mono ${pct > 0 ? 'text-stock-up' : pct < 0 ? 'text-stock-down' : undefined}`}>
                {pct > 0 ? '+' : ''}
                {pct.toFixed(2)}%
              </span>
            )}
            <span className="text-xs text-text-sub">
              {last.date} 收盘
            </span>
          </div>
          <KlineChart result={result} height={520} loading={loading} freq={freq} onFreqChange={setFreq} />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <Spin tip="加载K线数据…" />
        </div>
      ) : null}
    </SelfDrawer>
  );
};
