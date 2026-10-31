// base 层抽屉：默认 className='app-form-drawer'（styles/global.css 的 18px 头部/内容内边距），外部 className 追加。
// 宽度刻度 sm=480/md=560/lg=720，默认 md=560（贴现状最大簇，迁移变更面最小）；number|string 透传保留
// （如 TemplatePage '66vw' 为响应式合法特例，二期归档）。统一 maxWidth 80vw（antd5 规范：小屏兜底），
// 作用在 styles.wrapper（antd v5 宽度载体 .ant-drawer-content-wrapper）——面板贴屏幕右缘、内容 100% 填满，
// 不能落在 style（落在 .ant-drawer-content 上会左侧露空隙，评审实测 375px 视口破损）。
// 禁默认 destroyOnHidden/forceRender：抽屉关闭不销毁，由页面/hook 控制 reset→setFieldsValue→open 时序。
import React from 'react';
import { Drawer } from 'antd';
import type { DrawerProps } from 'antd';
import { DRAWER_WIDTH } from '../../types/ui';
import type { DrawerWidthScale } from '../../types/ui';

export type SelfDrawerWidth = number | string | DrawerWidthScale;

export const SELF_DRAWER_CLASS = 'app-form-drawer';

/** 宽度档位解析：缺省 md=560；'sm'/'lg' 取刻度；number|string（含 min()/vw 写法）透传。 */
export const resolveDrawerWidth = (width?: SelfDrawerWidth): number | string => {
  if (width === undefined || width === 'md') {
    return DRAWER_WIDTH.md;
  }
  if (width === 'sm') {
    return DRAWER_WIDTH.sm;
  }
  if (width === 'lg') {
    return DRAWER_WIDTH.lg;
  }
  return width;
};

export interface SelfDrawerProps extends DrawerProps {
  /** 宽度：档位词或 number|string（默认 md=560）。 */
  width?: SelfDrawerWidth;
}

export const SelfDrawer: React.FC<SelfDrawerProps> = ({ className, width, styles, ...rest }) => (
  <Drawer
    {...rest}
    className={className ? `${SELF_DRAWER_CLASS} ${className}` : SELF_DRAWER_CLASS}
    width={resolveDrawerWidth(width)}
    // 小屏兜底作用于宽度载体 wrapper（content-wrapper），外部 styles.wrapper 与默认合并、其他槽位透传
    styles={{
      ...styles,
      wrapper: { maxWidth: '80vw', ...styles?.wrapper }
    }}
  />
);
