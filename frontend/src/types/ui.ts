// 公共 UI 类型与档位常量：仅类型 + 字面量常量，不引入任何运行时依赖（node 环境可直测）。
// 三张刻度表（间距 / 弹层宽度 / 状态色）的数值契约集中于此，组件默认值与页面迁移共同遵守。

/** 状态标签元信息：label 文案 + antd 预设色词（收编 flowRunUI/GraphicPage/AuditCenterPage 等映射表）。 */
export interface StatusMeta {
  label: string;
  color: string;
}

/** 抽屉宽度档位：sm=480 / md=560 / lg=720（md=560 贴现状最大簇，迁移变更面最小）。 */
export type DrawerWidthScale = 'sm' | 'md' | 'lg';
export const DRAWER_WIDTH: Record<DrawerWidthScale, number> = {
  sm: 480,
  md: 560,
  lg: 720
};

/** 弹窗宽度档位：sm=520 / md=640 / lg=720（现状散值 520/640/720/760 收敛）。 */
export type ModalWidthScale = 'sm' | 'md' | 'lg';
export const MODAL_WIDTH: Record<ModalWidthScale, number> = {
  sm: 520,
  md: 640,
  lg: 720
};

/** Space 间距四档：xs=4 / sm=8 / md=12 / lg=16（现状 0/2/4/6/8/12/16/large 八种散值归一）。 */
export type SpaceScale = 'xs' | 'sm' | 'md' | 'lg';
export const SPACE_SIZE: Record<SpaceScale, number> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16
};
