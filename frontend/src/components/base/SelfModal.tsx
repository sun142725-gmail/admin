// base 层弹窗：默认 className='app-form-modal'（styles/global.css 的 18px 20px 内边距），外部 className 追加。
// 宽度刻度 sm=520/md=640/lg=720（types/ui.ts），number|string 原样透传（响应式合法值）。
// okText/cancelText 默认「确定/取消」与 zh_CN locale 一致（视觉零变化），外部透传优先。
// 禁默认 destroyOnHidden/forceRender：保住「reset→setFieldsValue→open」受控回填时序（基座不接管重置，
// 由 useFormModal(openForm) 承载）。
// 限高滚动（基座统一）：默认 centered 居中 + body maxHeight=视口-220px（头部/底部/上下留白预算），
// 内容过长时 body 内部滚动，弹窗整体不再撑出视口（「内容滚动而非整个弹窗滚动」）。调用方可
// centered={false} 或 styles.body 覆盖（合并顺序：基座在前、外部可改）。
import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import { MODAL_WIDTH } from '../../types/ui';
import type { ModalWidthScale } from '../../types/ui';

export type SelfModalWidth = number | string | ModalWidthScale;

export const SELF_MODAL_CLASS = 'app-form-modal';

/** 宽度档位解析：缺省 sm=520；'md'/'lg' 取刻度；number|string 透传。 */
export const resolveModalWidth = (width?: SelfModalWidth): number | string => {
  if (width === undefined || width === 'sm') {
    return MODAL_WIDTH.sm;
  }
  if (width === 'md') {
    return MODAL_WIDTH.md;
  }
  if (width === 'lg') {
    return MODAL_WIDTH.lg;
  }
  return width;
};

export interface SelfModalProps extends ModalProps {
  /** 宽度：档位词或 number|string（默认 sm=520）。 */
  width?: SelfModalWidth;
}

export const SelfModal: React.FC<SelfModalProps> = ({ className, width, okText, cancelText, styles, centered = true, ...rest }) => (
  <Modal
    {...rest}
    centered={centered}
    className={className ? `${SELF_MODAL_CLASS} ${className}` : SELF_MODAL_CLASS}
    width={resolveModalWidth(width)}
    okText={okText ?? '确定'}
    cancelText={cancelText ?? '取消'}
    styles={{
      ...styles,
      // 基座限高在前、外部 styles.body 可覆盖单项；内容短时 body 自然高度不受影响
      body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', ...styles?.body }
    }}
  />
);
