// useFillTableHeight：列表页表格撑满（SelfTable fill）测量基座。
// 口径：容器 clientHeight − thead 实测高 − 分页器实测高 = antd Table scroll.y；
// 分页器查不到（pagination={false}）按 0 扣；结果下限 MIN_FILL_SCROLL_Y 防极矮容器塌缩。
// 未测量完成 fillScrollY===undefined：首帧正常渲染不滚动，ResizeObserver 首次回调后注入 y，无跳变。
// 容器高度由页面 flex 链决定、不随 y 变化，setScrollY 同值 React 跳过重渲染，无测量循环。
import { useCallback, useEffect, useRef, useState } from 'react';

export const MIN_FILL_SCROLL_Y = 200;

/**
 * 纯函数：撑满模式 scroll.y 计算。
 * containerHeight==null（未测量）返回 undefined；否则 Math.max(下限, 容器高−表头−分页器)。
 */
/** 外框盒高度：getBoundingClientRect 不含 margin，antd 分页器自带 margin: 16px 0 必须一并扣减。 */
export const outerHeight = (el: HTMLElement | null): number => {
  if (!el) {
    return 0;
  }
  const style = getComputedStyle(el);
  return el.getBoundingClientRect().height + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
};

export const computeFillScrollY = (
  containerHeight: number | null | undefined,
  headerHeight: number,
  paginationHeight: number
): number | undefined => {
  if (containerHeight == null) {
    return undefined;
  }
  return Math.max(MIN_FILL_SCROLL_Y, containerHeight - headerHeight - paginationHeight);
};

/**
 * 测量容器 hook：返回 containerRef（挂到表格包裹 div 上）与 fillScrollY。
 * ResizeObserver 观察容器 + window resize 兜底重测；连续触发经 rAF 合并只保留最后一帧（防抖动）。
 * ResizeObserver 环境缺失（如 node 测试环境）时退化为仅 window resize 兜底。
 */
export const useFillTableHeight = <T extends HTMLElement>() => {
  const containerRef = useRef<T | null>(null);
  const rafRef = useRef<number | null>(null);
  const [fillScrollY, setFillScrollY] = useState<number | undefined>(undefined);

  const measure = useCallback(() => {
    // rAF 合并：连续 resize/observe 回调只保留最后一次测量，等一帧待布局稳定再 setState
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = containerRef.current;
      if (!el) {
        return;
      }
      // thead / 分页器实测高（querySelector 不到按 0 扣，对应 pagination={false}）
      const headerHeight =
        el.querySelector<HTMLElement>('.ant-table-thead')?.getBoundingClientRect().height ?? 0;
      const paginationHeight =
        outerHeight(el.querySelector<HTMLElement>('.ant-table-pagination'));
      setFillScrollY(computeFillScrollY(el.clientHeight, headerHeight, paginationHeight));
    });
  }, []);

  useEffect(() => {
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && containerRef.current) {
      observer.observe(containerRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return { containerRef, fillScrollY };
};
