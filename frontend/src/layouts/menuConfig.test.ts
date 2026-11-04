// 左侧菜单「同一目录下图标要么都有、要么都没有」的纯函数单测。
import { describe, expect, it } from 'vitest';
import type { MenuTreeNode } from '../api/resources';
import {
  DEFAULT_ICON_KEY,
  MENU_ICON_KEY,
  PATH_ICON_KEYS,
  alignSiblingIconKeys,
  buildMenuTree,
  getMenuIconKey
} from './menuConfig';
import type { BuiltMenuItem } from './menuConfig';

let nextId = 1;
const leaf = (name: string, path: string, permissionCode?: string): MenuTreeNode => ({
  id: nextId++,
  name,
  path,
  permissionCode
});
const group = (name: string, children: MenuTreeNode[]): MenuTreeNode => ({
  id: nextId++,
  name,
  children
});

// 与后端 seed.service.ts / 线上 SQL 中 resources 表一致的菜单树快照。
const realMenuTree = (): MenuTreeNode[] => [
  group('系统管理', [
    leaf('系统首页', '/'),
    leaf('用户管理', '/users'),
    leaf('角色管理', '/roles'),
    leaf('权限管理', '/permissions')
  ]),
  group('系统配置', [
    leaf('字典管理', '/dicts'),
    leaf('通知模板', '/notifications/templates'),
    leaf('通知发布', '/notifications/publish'),
    leaf('站内信', '/notifications/inbox')
  ]),
  group('日志管理', [
    leaf('日志概览', '/logs/overview'),
    leaf('会话链路', '/logs/session'),
    leaf('审计日志', '/logs/audit'),
    leaf('打点日志', '/logs/track'),
    leaf('前端日志', '/logs/frontend'),
    leaf('错误日志', '/logs/error')
  ]),
  group('工具', [leaf('六爻占卜', '/divination')]),
  group('AI 中心', [
    leaf('模型管理', '/ai/models'),
    leaf('智能体管理', '/ai/agents'),
    leaf('AI 对话', '/ai/chat'),
    leaf('AI 生图', '/ai/images'),
    leaf('AI 画布', '/ai/canvas'),
    leaf('用量报表', '/ai/usage')
  ]),
  group('股市', [
    leaf('股市圆桌', '/stock'),
    leaf('选股器', '/stock/screener'),
    leaf('自选股', '/stock/watchlist'),
    leaf('策略管理', '/stock/strategy')
  ]),
  group('AI 制片厂', [
    leaf('流程管理', '/flow'),
    leaf('运行历史', '/flow/runs'),
    leaf('小说转视频', '/flow/novel'),
    leaf('AI 生成漫画', '/graphic'),
    leaf('图片提示词库', '/prompts'),
    leaf('发布矩阵', '/publisher')
  ])
];

// 递归断言：每一层兄弟节点的 iconKey 不能出现「有/无」混排。
const expectSiblingIconsConsistent = (nodes: BuiltMenuItem[]) => {
  const flags = nodes.map((node) => node.iconKey !== undefined);
  expect(new Set(flags).size).toBeLessThanOrEqual(1);
  nodes.forEach((node) => {
    if (node.children) {
      expectSiblingIconsConsistent(node.children);
    }
  });
};

describe('getMenuIconKey', () => {
  it('按 path 命中已登记图标', () => {
    expect(getMenuIconKey(leaf('用户管理', '/users'))).toBe(MENU_ICON_KEY.user);
  });

  it('后加的六个菜单路径均已登记（股市策略 + AI 制片厂组）', () => {
    const addedPaths = [
      '/stock/strategy',
      '/flow',
      '/flow/runs',
      '/flow/novel',
      '/graphic',
      '/prompts'
    ];
    addedPaths.forEach((path) => {
      expect(getMenuIconKey(leaf('任意名称', path))).toBeDefined();
    });
  });

  it('path 未登记时回退按名称匹配', () => {
    expect(getMenuIconKey(leaf('股市', '/unknown-path'))).toBe(MENU_ICON_KEY.stock);
  });

  it('一级目录按名称命中，且兼容线上未更名的旧名称', () => {
    expect(getMenuIconKey(group('AI 制片厂', []))).toBe(MENU_ICON_KEY.videoCamera);
    expect(getMenuIconKey(group('任务流', []))).toBe(MENU_ICON_KEY.videoCamera);
    expect(getMenuIconKey(group('AI 管理', []))).toBe(MENU_ICON_KEY.thunderbolt);
    expect(getMenuIconKey(group('股市圆桌', []))).toBe(MENU_ICON_KEY.stock);
  });

  it('path 与 name 都未登记时返回 undefined', () => {
    expect(getMenuIconKey(leaf('全新页面', '/brand-new'))).toBeUndefined();
  });
});

describe('alignSiblingIconKeys', () => {
  it('全部有图标时原值不变', () => {
    const keys = [MENU_ICON_KEY.home, MENU_ICON_KEY.user] as const;
    expect(alignSiblingIconKeys(keys)).toEqual([MENU_ICON_KEY.home, MENU_ICON_KEY.user]);
  });

  it('全部没有图标时保持全部没有（要没有都没有）', () => {
    expect(alignSiblingIconKeys([undefined, undefined, undefined])).toEqual([
      undefined,
      undefined,
      undefined
    ]);
  });

  it('有/无混排时给缺失项补默认图标（要有都有）', () => {
    expect(alignSiblingIconKeys([MENU_ICON_KEY.stock, undefined, MENU_ICON_KEY.star])).toEqual([
      MENU_ICON_KEY.stock,
      DEFAULT_ICON_KEY,
      MENU_ICON_KEY.star
    ]);
    expect(alignSiblingIconKeys([undefined, MENU_ICON_KEY.send, undefined])).toEqual([
      DEFAULT_ICON_KEY,
      MENU_ICON_KEY.send,
      DEFAULT_ICON_KEY
    ]);
  });

  it('空目录返回空数组且不修改入参', () => {
    const input = [MENU_ICON_KEY.home, undefined];
    const output = alignSiblingIconKeys(input);
    expect(alignSiblingIconKeys([])).toEqual([]);
    expect(input).toEqual([MENU_ICON_KEY.home, undefined]);
    expect(output).not.toBe(input);
  });
});

describe('buildMenuTree 同级图标一致性', () => {
  it('真实菜单树的每一层都不出现有/无混排，且全部目录都有图标', () => {
    const built = buildMenuTree(realMenuTree(), []);
    expectSiblingIconsConsistent(built);
    built.forEach((node) => {
      expect(node.iconKey).toBeDefined();
      expect(node.children?.every((child) => child.iconKey !== undefined)).toBe(true);
    });
  });

  it('股市组此前 3 有 1 无，现在四项都有图标', () => {
    const built = buildMenuTree(realMenuTree(), []);
    const stockGroup = built.find((node) => node.name === '股市');
    expect(stockGroup?.children?.map((child) => child.iconKey)).toEqual([
      MENU_ICON_KEY.stock,
      MENU_ICON_KEY.filter,
      MENU_ICON_KEY.star,
      MENU_ICON_KEY.lineChart
    ]);
  });

  it('AI 制片厂组此前仅 /publisher 有图标，现在六项都有图标', () => {
    const built = buildMenuTree(realMenuTree(), []);
    const studio = built.find((node) => node.name === 'AI 制片厂');
    expect(studio?.children).toHaveLength(6);
    expect(studio?.children?.every((child) => child.iconKey !== undefined)).toBe(true);
  });

  it('整组都未登记图标时保持整组无图标，不凭空造图标', () => {
    const built = buildMenuTree(
      [group('新分组', [leaf('页面 A', '/a'), leaf('页面 B', '/b')])],
      []
    );
    expect(built[0].iconKey).toBeUndefined();
    expect(built[0].children?.map((child) => child.iconKey)).toEqual([undefined, undefined]);
  });

  it('同一层里新菜单未登记图标时自动补默认图标', () => {
    const built = buildMenuTree(
      [leaf('用户管理', '/users'), leaf('全新页面', '/brand-new')],
      []
    );
    expect(built.map((node) => node.iconKey)).toEqual([
      MENU_ICON_KEY.user,
      DEFAULT_ICON_KEY
    ]);
  });

  it('各层独立计算：顶层全有图标、子层混排只补子层', () => {
    const built = buildMenuTree(
      [
        group('系统管理', [leaf('用户管理', '/users'), leaf('全新页面', '/brand-new')]),
        group('工具', [leaf('六爻占卜', '/divination')])
      ],
      []
    );
    expect(built.map((node) => node.iconKey)).toEqual([
      MENU_ICON_KEY.setting,
      MENU_ICON_KEY.appstore
    ]);
    expect(built[0].children?.map((child) => child.iconKey)).toEqual([
      MENU_ICON_KEY.user,
      DEFAULT_ICON_KEY
    ]);
  });

  it('权限过滤后按「实际可见的兄弟节点」计算一致性', () => {
    const tree = [
      group('受限组', [
        leaf('有图标项', '/users', 'user:view'),
        leaf('无图标项', '/brand-new')
      ])
    ];
    // 有权限：两项可见 → 混排补齐
    expect(buildMenuTree(tree, ['user:view'])[0].children?.map((c) => c.iconKey)).toEqual([
      MENU_ICON_KEY.user,
      DEFAULT_ICON_KEY
    ]);
    // 无权限：只剩无图标项 → 整组保持无图标
    expect(buildMenuTree(tree, [])[0].children?.map((c) => c.iconKey)).toEqual([undefined]);
  });

  it('权限过滤掉的子项不会留下空 children', () => {
    const built = buildMenuTree(
      [group('系统管理', [leaf('用户管理', '/users', 'user:view')])],
      []
    );
    expect(built[0].children).toBeUndefined();
  });

  it('折叠态不下发 children，但顶层图标一致性不变', () => {
    const built = buildMenuTree(realMenuTree(), [], false);
    expect(built.every((node) => node.children === undefined)).toBe(true);
    expect(built.every((node) => node.iconKey !== undefined)).toBe(true);
  });

  it('保留 key / name / path，目录无 path 时用 id 兜底', () => {
    const built = buildMenuTree([{ id: 42, name: '系统管理' }, leaf('用户管理', '/users')], []);
    expect(built[0].key).toBe('42');
    expect(built[0].name).toBe('系统管理');
    expect(built[1]).toMatchObject({ key: '/users', name: '用户管理', path: '/users' });
  });
});

describe('图标映射完整性', () => {
  it('真实菜单树的每个 path 都在 PATH_ICON_KEYS 中登记（新增菜单需同步登记）', () => {
    const paths: string[] = [];
    const walk = (nodes: MenuTreeNode[]) => {
      nodes.forEach((node) => {
        if (node.path) paths.push(node.path);
        if (node.children) walk(node.children);
      });
    };
    walk(realMenuTree());
    paths.forEach((path) => {
      expect(PATH_ICON_KEYS[path], `菜单 ${path} 缺少图标登记`).toBeDefined();
    });
  });

  it('所有已登记的图标 key 都在 MENU_ICON_KEY 白名单内', () => {
    const allowed = new Set<string>(Object.values(MENU_ICON_KEY));
    Object.values(PATH_ICON_KEYS).forEach((key) => expect(allowed.has(key)).toBe(true));
  });
});
