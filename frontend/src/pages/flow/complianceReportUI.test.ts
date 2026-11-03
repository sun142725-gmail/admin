// 合规报告展示纯函数单测（vitest 显式 import，照 utils/metrics.test.ts 头部范式）：
// 覆盖 verdict Tag 映射三态、字段中文映射与未知兜底、位置格式化、check 请求体构造（trim/布尔归一）。
import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_FIELD_LABELS,
  COMPLIANCE_LEVEL_TAG_COLORS,
  buildCheckPayload,
  fieldLabel,
  formatHitPosition,
  verdictTagMeta
} from './complianceReportUI';

describe('verdictTagMeta', () => {
  it('blocked → 红「阻止发布」', () => {
    expect(verdictTagMeta('blocked')).toEqual({ color: 'red', text: '阻止发布' });
  });

  it('review → 橙「待人工复核」', () => {
    expect(verdictTagMeta('review')).toEqual({ color: 'orange', text: '待人工复核' });
  });

  it('pass → 绿「通过」', () => {
    expect(verdictTagMeta('pass')).toEqual({ color: 'green', text: '通过' });
  });
});

describe('COMPLIANCE_LEVEL_TAG_COLORS', () => {
  it('三级别配色写死：block=red / review=orange / replace=blue', () => {
    expect(COMPLIANCE_LEVEL_TAG_COLORS).toEqual({ block: 'red', review: 'orange', replace: 'blue' });
  });
});

describe('fieldLabel', () => {
  it('四字段中文映射（标题/简介/标签/备注）', () => {
    expect(fieldLabel('title')).toBe('标题');
    expect(fieldLabel('description')).toBe('简介');
    expect(fieldLabel('tags')).toBe('标签');
    expect(fieldLabel('note')).toBe('备注');
  });

  it('未知字段兜底回显原值', () => {
    expect(fieldLabel('unknownField')).toBe('unknownField');
  });

  it('COMPLIANCE_FIELD_LABELS 常量本身与映射一致', () => {
    expect(COMPLIANCE_FIELD_LABELS).toEqual({ title: '标题', description: '简介', tags: '标签', note: '备注' });
  });
});

describe('formatHitPosition', () => {
  it('start-end 拼接（含头不含尾）', () => {
    expect(formatHitPosition(4, 6)).toBe('4-6');
    expect(formatHitPosition(0, 2)).toBe('0-2');
  });
});

describe('buildCheckPayload', () => {
  it('title/note 原样 trim（前端 trim 仅 UX）', () => {
    expect(buildCheckPayload('  赌博标题  ', ' 备注内容 ', true)).toEqual({
      title: '赌博标题',
      note: '备注内容',
      aigcDeclared: true
    });
  });

  it('undefined 字段保持 undefined（JSON 序列化时剔除）', () => {
    expect(buildCheckPayload(undefined, undefined, false)).toEqual({
      title: undefined,
      note: undefined,
      aigcDeclared: false
    });
  });

  it('aigcDeclared 用 === true 归一：undefined/非布尔均落 false，请求体恒显式布尔', () => {
    expect(buildCheckPayload('t', 'n', undefined).aigcDeclared).toBe(false);
    expect(buildCheckPayload('t', 'n', true).aigcDeclared).toBe(true);
    // 表单异常态（值缺失）不会让 aigcDeclared 缺省——后端缺省即 422
    const payload = buildCheckPayload('t', 'n', false);
    expect(Object.prototype.hasOwnProperty.call(payload, 'aigcDeclared')).toBe(true);
  });
});
