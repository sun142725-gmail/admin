// base 层弹窗：默认 className='app-form-modal'（styles/global.css 的 18px 20px 内边距），外部 className 追加。
// 宽度刻度 sm=520/md=640/lg=720（types/ui.ts），number|string 原样透传（响应式合法值）。
// okText/cancelText 默认「确定/取消」与 zh_CN locale 一致（视觉零变化），外部透传优先。
// 禁默认 destroyOnHidden/forceRender：保住「reset→setFieldsValue→open」受控回填时序（基座不接管重置，
// 由 useFormModal(openForm) 承载），长内容滚动容器由调用方在 body 内自组。
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

export const SelfModal: React.FC<SelfModalProps> = ({ className, width, okText, cancelText, ...rest }) => (
  <Modal
    {...rest}
    className={className ? `${SELF_MODAL_CLASS} ${className}` : SELF_MODAL_CLASS}
    width={resolveModalWidth(width)}
    okText={okText ?? '确定'}
    cancelText={cancelText ?? '取消'}
  />
);
