// resolveStatusMeta 纯函数单测：map 命中/fallback/原值兜底三路径。
import { describe, expect, it } from 'vitest';
import { resolveStatusMeta } from './StatusTag';
import type { StatusMeta } from '../../types/ui';

const META: Record<string | number, StatusMeta> = {
  pending: { label: '排队中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  1: { label: '启用', color: 'green' }
};

describe('resolveStatusMeta', () => {
  it('map 命中返回 meta', () => {
    expect(resolveStatusMeta('running', META)).toEqual({ label: '运行中', color: 'processing' });
  });

  it('number key 命中（启用/禁用数字状态）', () => {
    expect(resolveStatusMeta(1, META)).toEqual({ label: '启用', color: 'green' });
  });

  it('未命中回退 fallback（RunPanel.tsx:36 原值兜底模式）', () => {
    const fallback: StatusMeta = { label: 'cancelled', color: 'default' };
    expect(resolveStatusMeta('cancelled', META, fallback)).toBe(fallback);
  });

  it('未命中且无 fallback 返回 undefined（组件退化为原值 Tag）', () => {
    expect(resolveStatusMeta('unknown', META)).toBeUndefined();
  });

  it('value 为 null/undefined 直接返回 undefined', () => {
    expect(resolveStatusMeta(null, META)).toBeUndefined();
    expect(resolveStatusMeta(undefined, META)).toBeUndefined();
  });

  it('value 为 0 时不被短路（0 是合法状态值）', () => {
    const zeroMeta: Record<string | number, StatusMeta> = { 0: { label: '禁用', color: 'default' } };
    expect(resolveStatusMeta(0, zeroMeta)).toEqual({ label: '禁用', color: 'default' });
  });
});
