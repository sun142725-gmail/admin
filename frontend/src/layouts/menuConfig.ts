// 左侧菜单的图标解析与构建逻辑（纯函数，不依赖 React / 网络，便于单测）。
// 约定：同一父目录下的菜单项，图标「要么都有、要么都没有」，不允许有/无混排——
// 混排会让 antd inline 菜单的文字起始位置参差不齐。
import type { MenuTreeNode } from '../api/resources';

// 图标 key 是渲染层图标组件的唯一凭据；新增 key 必须同步在
// MainLayout.tsx 的 ICON_COMPONENTS（Record<MenuIconKey, ReactNode>）里补齐，由 tsc 强制约束。
export const MENU_ICON_KEY = {
  home: 'home',
  user: 'user',
  team: 'team',
  safety: 'safety',
  fund: 'fund',
  fileText: 'fileText',
  apartment: 'apartment',
  fileSearch: 'fileSearch',
  experiment: 'experiment',
  database: 'database',
  robot: 'robot',
  message: 'message',
  picture: 'picture',
  gateway: 'gateway',
  stock: 'stock',
  filter: 'filter',
  star: 'star',
  lineChart: 'lineChart',
  history: 'history',
  videoCamera: 'videoCamera',
  fileImage: 'fileImage',
  snippets: 'snippets',
  book: 'book',
  idcard: 'idcard',
  send: 'send',
  setting: 'setting',
  thunderbolt: 'thunderbolt',
  appstore: 'appstore'
} as const;

export type MenuIconKey = (typeof MENU_ICON_KEY)[keyof typeof MENU_ICON_KEY];

// 未登记图标的菜单若与有图标的兄弟节点同级，用该默认图标补齐。
export const DEFAULT_ICON_KEY: MenuIconKey = MENU_ICON_KEY.appstore;

// 叶子菜单按 path 取图标。新增菜单页时务必在此登记，否则由同级一致性规则补默认图标。
export const PATH_ICON_KEYS: Record<string, MenuIconKey> = {
  '/': MENU_ICON_KEY.home,
  '/users': MENU_ICON_KEY.user,
  '/roles': MENU_ICON_KEY.team,
  '/permissions': MENU_ICON_KEY.safety,
  '/logs/overview': MENU_ICON_KEY.fund,
  '/logs/audit': MENU_ICON_KEY.fileText,
  '/logs/session': MENU_ICON_KEY.apartment,
  '/logs/track': MENU_ICON_KEY.fileSearch,
  '/logs/frontend': MENU_ICON_KEY.fileSearch,
  '/logs/error': MENU_ICON_KEY.fileSearch,
  '/divination': MENU_ICON_KEY.experiment,
  '/ai/models': MENU_ICON_KEY.database,
  '/ai/agents': MENU_ICON_KEY.robot,
  '/ai/chat': MENU_ICON_KEY.message,
  '/ai/images': MENU_ICON_KEY.picture,
  '/ai/canvas': MENU_ICON_KEY.gateway,
  '/ai/usage': MENU_ICON_KEY.fund,
  '/stock': MENU_ICON_KEY.stock,
  '/stock/screener': MENU_ICON_KEY.filter,
  '/stock/watchlist': MENU_ICON_KEY.star,
  '/stock/strategy': MENU_ICON_KEY.lineChart,
  '/flow': MENU_ICON_KEY.apartment,
  '/flow/runs': MENU_ICON_KEY.history,
  '/flow/novel': MENU_ICON_KEY.videoCamera,
  '/graphic': MENU_ICON_KEY.fileImage,
  '/prompts': MENU_ICON_KEY.snippets,
  '/dicts': MENU_ICON_KEY.book,
  '/notifications/templates': MENU_ICON_KEY.book,
  '/notifications/publish': MENU_ICON_KEY.fileText,
  '/notifications/inbox': MENU_ICON_KEY.idcard,
  '/publisher': MENU_ICON_KEY.send,
  '/profile': MENU_ICON_KEY.idcard
};

// 目录（无 path 的节点）按名称取图标；同时保留历史名称，兼容线上尚未执行更名 SQL 的库。
export const NAME_ICON_KEYS: Record<string, MenuIconKey> = {
  系统首页: MENU_ICON_KEY.home,
  系统管理: MENU_ICON_KEY.setting,
  系统配置: MENU_ICON_KEY.setting,
  日志管理: MENU_ICON_KEY.fileSearch,
  'AI 中心': MENU_ICON_KEY.thunderbolt,
  'AI 管理': MENU_ICON_KEY.thunderbolt,
  股市: MENU_ICON_KEY.stock,
  股市圆桌: MENU_ICON_KEY.stock,
  工具: MENU_ICON_KEY.appstore,
  'AI 制片厂': MENU_ICON_KEY.videoCamera,
  任务流: MENU_ICON_KEY.videoCamera
};

// 先按 path 匹配，未登记时回退到名称匹配；两者都未登记返回 undefined，交由同级规则处理。
export const getMenuIconKey = (item: MenuTreeNode): MenuIconKey | undefined => {
  if (item.path && PATH_ICON_KEYS[item.path]) {
    return PATH_ICON_KEYS[item.path];
  }
  return NAME_ICON_KEYS[item.name];
};

/**
 * 同级图标一致性：
 * - 整组都没有图标 → 全部保持 undefined（要没有都没有，不凭空造图标）；
 * - 组内至少有一项有图标 → 缺失项补默认图标（要有都有，文字缩进对齐）。
 * 返回新数组，不修改入参。
 */
export const alignSiblingIconKeys = (
  keys: readonly (MenuIconKey | undefined)[]
): (MenuIconKey | undefined)[] => {
  if (!keys.some((key) => key !== undefined)) {
    return [...keys];
  }
  return keys.map((key) => key ?? DEFAULT_ICON_KEY);
};

export interface BuiltMenuItem {
  key: string;
  name: string;
  path?: string;
  iconKey?: MenuIconKey;
  children?: BuiltMenuItem[];
}

/**
 * 由后端菜单树构建渲染用的中间结构：先按权限过滤可见项，再逐层对齐图标。
 * 图标一致性基于「过滤后实际可见的兄弟节点」计算，避免被隐藏的菜单影响对齐结果。
 */
export const buildMenuTree = (
  items: readonly MenuTreeNode[],
  permissions: readonly string[],
  includeChildren = true
): BuiltMenuItem[] => {
  const visible = items.filter(
    (item) => !item.permissionCode || permissions.includes(item.permissionCode)
  );
  const aligned = alignSiblingIconKeys(visible.map(getMenuIconKey));

  return visible.map((item, index) => {
    const children =
      includeChildren && item.children?.length
        ? buildMenuTree(item.children, permissions)
        : undefined;
    return {
      key: item.path ?? String(item.id),
      name: item.name,
      path: item.path,
      iconKey: aligned[index],
      children: children?.length ? children : undefined
    };
  });
};
