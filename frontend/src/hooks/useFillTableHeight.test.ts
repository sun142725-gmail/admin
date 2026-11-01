// computeFillScrollY 纯函数直测（node 环境）：撑满模式 scroll.y 口径与下限契约。
// hook 交互（ResizeObserver/事件）为薄封装不入渲染测试（仓库 vitest 为 node 纯函数环境）。
import { describe, expect, it } from 'vitest';
import { computeFillScrollY, MIN_FILL_SCROLL_Y } from './useFillTableHeight';

describe('computeFillScrollY', () => {
  it('口径=容器高−表头−分页器（800−48−64=688）', () => {
    expect(computeFillScrollY(800, 48, 64)).toBe(688);
  });

  it('低于下限时取 MIN_FILL_SCROLL_Y=200（300−48−64=188→200）', () => {
    expect(computeFillScrollY(300, 48, 64)).toBe(200);
    expect(MIN_FILL_SCROLL_Y).toBe(200);
  });

  it('containerHeight==null/undefined（未测量）返回 undefined（首帧不注入 y）', () => {
    expect(computeFillScrollY(null, 48, 64)).toBeUndefined();
    expect(computeFillScrollY(undefined, 48, 64)).toBeUndefined();
  });

  it('表头/分页器实测为 0 时纯扣减（pagination={false} 只扣表头；都查不到=容器高）', () => {
    expect(computeFillScrollY(800, 48, 0)).toBe(752);
    expect(computeFillScrollY(800, 0, 64)).toBe(736);
    expect(computeFillScrollY(800, 0, 0)).toBe(800);
  });

  it('容器高为 0（极端塌缩）也保底 200', () => {
    expect(computeFillScrollY(0, 0, 0)).toBe(200);
  });
});
