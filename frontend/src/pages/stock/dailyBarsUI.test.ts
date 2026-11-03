// 日线行情库展示纯函数单测（vitest 显式 import，照 complianceReportUI.test.ts 头部范式）：
// 覆盖四码中文映射与未知兜底、anomalyTagMeta 四色+未知灰、staleDaysTagMeta 三态边界(0/7/8)、
// gapMeta 窗口外/窗口内两态、三个文案常量非空。
import { describe, expect, it } from 'vitest';
import {
  ANOMALY_LABELS,
  GAP_HINT_TEXT,
  TRIGGER_CONFLICT_TEXT,
  TRIGGER_STARTED_TEXT,
  anomalyLabel,
  anomalyTagMeta,
  gapMeta,
  staleDaysTagMeta
} from './dailyBarsUI';

describe('ANOMALY_LABELS / anomalyLabel', () => {
  it('四码中文名映射写死（零成交量/非正价格/高低点倒挂/开收越界）', () => {
    expect(ANOMALY_LABELS).toEqual({
      zero_volume: '零成交量',
      non_positive_price: '非正价格',
      high_low_inverted: '高低点倒挂',
      oc_out_of_range: '开收越界'
    });
    expect(anomalyLabel('zero_volume')).toBe('零成交量');
    expect(anomalyLabel('non_positive_price')).toBe('非正价格');
    expect(anomalyLabel('high_low_inverted')).toBe('高低点倒挂');
    expect(anomalyLabel('oc_out_of_range')).toBe('开收越界');
  });

  it('未知码兜底回显原码', () => {
    expect(anomalyLabel('unknown_code')).toBe('unknown_code');
  });
});

describe('anomalyTagMeta', () => {
  it('四色映射：零成交量/开收越界橙、非正价格/高低倒挂红', () => {
    expect(anomalyTagMeta('zero_volume')).toEqual({ color: 'orange', text: '零成交量' });
    expect(anomalyTagMeta('oc_out_of_range')).toEqual({ color: 'orange', text: '开收越界' });
    expect(anomalyTagMeta('non_positive_price')).toEqual({ color: 'red', text: '非正价格' });
    expect(anomalyTagMeta('high_low_inverted')).toEqual({ color: 'red', text: '高低点倒挂' });
  });

  it('未知码灰色兜底回显原码', () => {
    expect(anomalyTagMeta('brand_new_code')).toEqual({ color: 'default', text: 'brand_new_code' });
  });
});

describe('staleDaysTagMeta', () => {
  it('=0 绿「已最新」', () => {
    expect(staleDaysTagMeta(0)).toEqual({ color: 'green', text: '已最新' });
  });

  it('1~7 无 Tag（null 不渲染），边界 7 含在内', () => {
    expect(staleDaysTagMeta(1)).toBeNull();
    expect(staleDaysTagMeta(3)).toBeNull();
    expect(staleDaysTagMeta(7)).toBeNull();
  });

  it('>7 橙「停更 N 天」，边界 8 起标警', () => {
    expect(staleDaysTagMeta(8)).toEqual({ color: 'orange', text: '停更 8 天' });
    expect(staleDaysTagMeta(30)).toEqual({ color: 'orange', text: '停更 30 天' });
  });
});

describe('gapMeta', () => {
  it('窗口外缺口 → purple「窗口外,需手动 full 重抓」', () => {
    expect(gapMeta({ outsideAutoWindow: true })).toEqual({ color: 'purple', text: '窗口外,需手动 full 重抓' });
  });

  it('窗口内缺口 → null（缺口本身已入表，不渲染额外 Tag）', () => {
    expect(gapMeta({ outsideAutoWindow: false })).toBeNull();
  });
});

describe('文案常量', () => {
  it('缺口口径提示/触发成功/触发冲突三个文案非空', () => {
    expect(GAP_HINT_TEXT.length).toBeGreaterThan(0);
    expect(TRIGGER_STARTED_TEXT.length).toBeGreaterThan(0);
    expect(TRIGGER_CONFLICT_TEXT.length).toBeGreaterThan(0);
  });
});
