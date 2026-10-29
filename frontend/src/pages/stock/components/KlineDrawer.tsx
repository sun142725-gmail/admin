// K 线抽屉：在自选股 / 选股结果等列表里点击股票，弹出日K（蜡烛 + MA + 成交量 + 副图指标）。
// 数据走 GET /api/stock/market/kline（后端算好指标），支持个股 / 指数 / 东财板块代码。
import React, { useEffect, useState } from 'react';
import { Alert, Drawer, Spin } from 'antd';
import { KlineResult, fetchKline } from '../../../api/stock';
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

  useEffect(() => {
    if (!open || !symbol) {
      setResult(null);
      setError(null);
      return;
    }
    let stopped = false;
    setLoading(true);
    setError(null);
    setResult(null);
    fetchKline(symbol)
      .then((res) => {
        if (stopped) {
          return;
        }
        if (!res.items.length) {
          setError('该标的暂无日K数据');
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
  }, [open, symbol]);

  const last = result?.items[result.items.length - 1];
  const displayName = result?.name || name || symbol || '';
  const pct = last?.pct;

  return (
    <Drawer
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
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Spin tip="加载K线数据…" />
        </div>
      ) : error ? (
        <Alert type="warning" showIcon message={error} />
      ) : result && last ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold font-mono" style={{ color: (pct ?? 0) > 0 ? '#cf1322' : (pct ?? 0) < 0 ? '#3f8600' : undefined }}>
              {last.close.toFixed(2)}
            </span>
            {pct != null && (
              <span className="text-sm font-mono" style={{ color: pct > 0 ? '#cf1322' : pct < 0 ? '#3f8600' : undefined }}>
                {pct > 0 ? '+' : ''}
                {pct.toFixed(2)}%
              </span>
            )}
            <span className="text-xs text-text-sub">
              {last.date} 收盘
            </span>
          </div>
          <KlineChart result={result} height={520} />
        </div>
      ) : null}
    </Drawer>
  );
};
