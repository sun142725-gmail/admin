// 收藏星标按钮：点击直接加入自选；移除需二次确认（高频加、低频删）。
import React, { useEffect, useState } from 'react';
import { Button, Popconfirm, message } from 'antd';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { addToWatchlist, listWatchlist, removeFromWatchlist } from '../../../api/watchlist';

interface WatchStarButtonProps {
  symbol: string;
  name?: string;
  size?: 'small' | 'middle' | 'large';
}

export const WatchStarButton: React.FC<WatchStarButtonProps> = ({ symbol, name, size = 'middle' }) => {
  const [isFavorite, setIsFavorite] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopped = false;
    listWatchlist()
      .then((res) => {
        if (!stopped) {
          setIsFavorite((res.items ?? []).some((item) => item.symbol === symbol));
          setReady(true);
        }
      })
      .catch(() => {
        if (!stopped) {
          setReady(true);
        }
      });
    return () => {
      stopped = true;
    };
  }, [symbol]);

  const add = async () => {
    try {
      await addToWatchlist({ symbol, name: name || symbol });
      setIsFavorite(true);
      message.success('已加入自选');
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : '操作失败');
    }
  };

  const remove = async () => {
    try {
      await removeFromWatchlist(symbol);
      setIsFavorite(false);
      message.success('已移出自选');
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : '操作失败');
    }
  };

  if (isFavorite) {
    return (
      <Popconfirm title="移出自选？" onConfirm={() => void remove()}>
        <Button
          type="text"
          size={size}
          aria-label="移出自选"
          icon={<StarFilled style={{ color: '#faad14' }} />}
        />
      </Popconfirm>
    );
  }
  return (
    <Button
      type="text"
      size={size}
      aria-label="加入自选"
      disabled={!ready}
      onClick={() => void add()}
      icon={<StarOutlined style={{ color: '#8c8c8c' }} />}
    />
  );
};

