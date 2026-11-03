// 日线行情库质量报表展示纯函数（照 pages/flow/complianceReportUI.ts 先例——映射/Tag 元数据/文案
// 抽纯模块，组件内不做格式化逻辑，vitest 由 dailyBarsUI.test.ts 覆盖）。
// 仅 import type：vitest 单测在 node 环境运行，类型引用编译期擦除，不拖入 api/http 的 axios/store 依赖。
import type { BarAnomalyCode } from '../../api/dailyBars';

// ==================== 异常码映射 ====================

// 异常码中文映射（UI 契约写死）：zero_volume 零成交量 / non_positive_price 非正价格 /
// high_low_inverted 高低点倒挂 / oc_out_of_range 开收越界
export const ANOMALY_LABELS: Record<BarAnomalyCode, string> = {
  zero_volume: '零成交量',
  non_positive_price: '非正价格',
  high_low_inverted: '高低点倒挂',
  oc_out_of_range: '开收越界'
};

// 未知异常码兜底回显原码（后端新增码而前端未同步映射时不至于显示空白，照 fieldLabel 先例）
export const anomalyLabel = (code: string): string =>
  (ANOMALY_LABELS as Record<string, string>)[code] ?? code;

export interface AnomalyTagMeta {
  color: 'orange' | 'red' | 'default';
  text: string;
}

const ANOMALY_TAG_META: Record<BarAnomalyCode, AnomalyTagMeta> = {
  zero_volume: { color: 'orange', text: ANOMALY_LABELS.zero_volume },
  non_positive_price: { color: 'red', text: ANOMALY_LABELS.non_positive_price },
  high_low_inverted: { color: 'red', text: ANOMALY_LABELS.high_low_inverted },
  oc_out_of_range: { color: 'orange', text: ANOMALY_LABELS.oc_out_of_range }
};

// 异常码 → Tag 元数据：零成交量=橙（停牌占位，多为口径噪音）/ 非正价格=红（数据硬伤）/
// 高低倒挂=红 / 开收越界=橙；未知码灰色（antd status 预设 'default'）兜底回显原码。
export const anomalyTagMeta = (code: string): AnomalyTagMeta =>
  (ANOMALY_TAG_META as Record<string, AnomalyTagMeta | undefined>)[code] ?? {
    color: 'default',
    text: anomalyLabel(code)
  };

// ==================== 停更天数三态 ====================

export interface StaleDaysTagMeta {
  color: 'green' | 'orange';
  text: string;
}

// 停更天数 → Tag 三态（UI 契约写死）：=0 绿「已最新」；1~7 null（不渲染 Tag）；>7 橙「停更 N 天」标警
export const staleDaysTagMeta = (days: number): StaleDaysTagMeta | null => {
  if (days === 0) {
    return { color: 'green', text: '已最新' };
  }
  if (days > 7) {
    return { color: 'orange', text: `停更 ${days} 天` };
  }
  return null;
};

// ==================== 缺口窗口外语义 ====================

export interface GapTagMeta {
  color: 'purple';
  text: string;
}

// 缺口行 → 窗口外语义 Tag：outsideAutoWindow=true → {purple,「窗口外,需手动 full 重抓」}
// （自动补抓窗口够不着的第三态归宿）；窗口内缺口返回 null——缺口本身已入表，不渲染额外 Tag。
export const gapMeta = (gap: { outsideAutoWindow: boolean }): GapTagMeta | null =>
  gap.outsideAutoWindow ? { color: 'purple', text: '窗口外,需手动 full 重抓' } : null;

// ==================== 文案常量（UI 契约写死） ====================

// 缺口口径提示：无交易日历，按周一~五推断，法定长假会误报（明细缺口表固定展示）
export const GAP_HINT_TEXT = '按周一~五推断,法定节假日会误报';
// trigger 成功提示：后台执行无 run 表，不轮询进度
export const TRIGGER_STARTED_TEXT = '补抓任务已提交,进度见后端日志';
// trigger 409（已有补抓任务运行中）提示
export const TRIGGER_CONFLICT_TEXT = '已有补抓任务在运行中,请稍后再试';
