// 主布局提供菜单、头部与内容容器。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Menu, Breadcrumb, Dropdown, Space, message, Avatar } from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  IdcardOutlined
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchMenuTree } from '../api/resources';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearTokens, setProfile } from '../store/authSlice';
import { profile as fetchProfile, logout as apiLogout } from '../api/auth';
import { enqueueLogEvent } from '../utils/logBatcher';

const { Header, Sider, Content } = Layout;

interface MenuItem {
  id: number;
  name: string;
  path?: string;
  permissionCode?: string;
  children?: MenuItem[];
}

const getMenuIcon = (item: MenuItem) => {
  if (item.path) {
    const pathIconMap: Record<string, React.ReactNode> = {
      '/': <HomeOutlined />,
      '/users': <UserOutlined />,
      '/roles': <TeamOutlined />,
      '/permissions': <SafetyOutlined />,
      '/logs/audit': <FileTextOutlined />,
      '/logs/track': <FileSearchOutlined />,
      '/logs/frontend': <FileSearchOutlined />,
      '/logs/error': <FileSearchOutlined />,
      '/divination': <ExperimentOutlined />,
      '/dicts': <BookOutlined />,
      '/notifications/templates': <BookOutlined />,
      '/notifications/publish': <FileTextOutlined />,
      '/notifications/inbox': <IdcardOutlined />,
      '/profile': <IdcardOutlined />
    };
    return pathIconMap[item.path];
  }
  const nameIconMap: Record<string, React.ReactNode> = {
    系统首页: <HomeOutlined />,
    系统管理: <SettingOutlined />,
    系统配置: <SettingOutlined />,
    日志管理: <FileSearchOutlined />,
    工具: <AppstoreOutlined />
  };
  return nameIconMap[item.name];
};

const buildMenuItems = (items: MenuItem[], permissions: string[]) => {
  return items
    .filter((item) => !item.permissionCode || permissions.includes(item.permissionCode))
    .map((item) => {
      const childrenItems = item.children?.length
        ? buildMenuItems(item.children, permissions)
        : undefined;
      return {
        key: item.path ?? String(item.id),
        label: item.path ? <Link to={item.path}>{item.name}</Link> : item.name,
        icon: getMenuIcon(item),
        children: childrenItems?.length ? childrenItems : undefined
      };
    });
};

const PAGE_CODE_MAP: Record<string, string> = {
  '/': 'home',
  '/users': 'system_user',
  '/roles': 'system_role',
  '/permissions': 'system_permission',
  '/logs/audit': 'log_audit',
  '/logs/track': 'log_track',
  '/logs/frontend': 'log_frontend',
  '/logs/error': 'log_error',
  '/divination': 'tool_divination',
  '/dicts': 'config_dict',
  '/notifications/templates': 'notification_template',
  '/notifications/publish': 'notification_publish',
  '/notifications/inbox': 'notification_inbox',
  '/profile': 'profile'
};

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.auth.profile);
  const permissions = profile?.permissions ?? [];
  const [collapsed, setCollapsed] = useState(true);
  const [menuTree, setMenuTree] = useState<MenuItem[]>([]);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimers = () => {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (expandMenuTimerRef.current) {
      clearTimeout(expandMenuTimerRef.current);
      expandMenuTimerRef.current = null;
    }
  };

  const handleSiderMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (!collapsed) {
      return;
    }
    enterTimerRef.current = setTimeout(() => {
      setCollapsed(false);
      enterTimerRef.current = null;
    }, 180);
  };

  const handleSiderMouseLeave = () => {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    leaveTimerRef.current = setTimeout(() => {
      setCollapsed(true);
      leaveTimerRef.current = null;
    }, 560);
  };

  useEffect(() => {
    fetchProfile().then((data) => dispatch(setProfile(data)));
    fetchMenuTree().then((data) => setMenuTree(data));
  }, [dispatch]);

  useEffect(() => {
    return () => clearHoverTimers();
  }, []);

  useEffect(() => {
    const pageCode = PAGE_CODE_MAP[location.pathname];
    if (!pageCode) {
      return;
    }
    enqueueLogEvent({
      type: 'track',
      payload: {
        pageCode,
        path: location.pathname,
        referrer: document.referrer,
        userAgent: navigator.userAgent
      }
    });
  }, [location.pathname]);

  const items = useMemo(() => buildMenuItems(menuTree, permissions), [menuTree, permissions]);

  const activeParentKeys = useMemo(() => {
    const findParents = (nodes: MenuItem[], targetPath: string, parents: string[] = []): string[] => {
      for (const node of nodes) {
        const nodeKey = node.path ?? String(node.id);
        if (node.path === targetPath) {
          return parents;
        }
        if (node.children?.length) {
          const matchedParents = findParents(node.children, targetPath, [...parents, nodeKey]);
          if (matchedParents.length) {
            return matchedParents;
          }
        }
      }
      return [];
    };

    return findParents(menuTree, location.pathname);
  }, [location.pathname, menuTree]);

  useEffect(() => {
    if (expandMenuTimerRef.current) {
      clearTimeout(expandMenuTimerRef.current);
      expandMenuTimerRef.current = null;
    }

    if (collapsed) {
      setOpenKeys([]);
      return;
    }

    expandMenuTimerRef.current = setTimeout(() => {
      setOpenKeys(activeParentKeys);
      expandMenuTimerRef.current = null;
    }, 360);

    return () => {
      if (expandMenuTimerRef.current) {
        clearTimeout(expandMenuTimerRef.current);
        expandMenuTimerRef.current = null;
      }
    };
  }, [activeParentKeys, collapsed]);

  const breadcrumbMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (nodes: MenuItem[], parents: string[]) => {
      nodes.forEach((node) => {
        const nextParents = [...parents, node.name];
        if (node.path) {
          map.set(node.path, nextParents);
        }
        if (node.children?.length) {
          walk(node.children, nextParents);
        }
      });
    };
    walk(menuTree, []);
    return map;
  }, [menuTree]);

  const breadcrumbItems = useMemo(() => {
    if (location.pathname === '/') {
      return [{ title: '首页' }];
    }
    if (/^\/roles\/\d+\/permissions$/.test(location.pathname)) {
      return [{ title: '系统管理' }, { title: '角色管理' }, { title: '功能权限' }];
    }
    const custom = {
      '/profile': ['个人中心']
    } as Record<string, string[]>;
    const titles = custom[location.pathname] ?? breadcrumbMap.get(location.pathname);
    if (titles?.length) {
      return titles.map((title) => ({ title }));
    }
    return location.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => ({ title: segment }));
  }, [breadcrumbMap, location.pathname]);

  const onLogout = async () => {
    await apiLogout();
    dispatch(clearTokens());
    message.success('已退出登录');
    navigate('/login');
  };

  const onProfile = () => {
    navigate('/profile');
  };

  const baseSiderWidth = 72;

  return (
    <Layout className={`app-shell ${collapsed ? 'is-collapsed' : 'is-expanded'}`}>
      <Sider
        width={220}
        collapsedWidth={72}
        collapsed={collapsed}
        theme="light"
        onMouseEnter={handleSiderMouseEnter}
        onMouseLeave={handleSiderMouseLeave}
        className="app-sider"
      >
        <div className={`app-brand ${collapsed ? 'is-collapsed' : ''}`}>
          <Link
            to="/"
            className="app-brand-link"
          >
            <span className="app-brand-mark">
              <AppstoreOutlined />
            </span>
            <span className="app-brand-text">RBAC 管理后台</span>
          </Link>
        </div>
        <Menu
          mode="inline"
          items={items}
          selectedKeys={[location.pathname]}
          openKeys={openKeys}
          onOpenChange={(keys) => {
            if (!collapsed) {
              setOpenKeys(keys as string[]);
            }
          }}
          className="app-menu"
        />
      </Sider>
      <Layout
        className={`app-main ${collapsed ? 'is-collapsed' : 'is-expanded'}`}
        style={{ marginLeft: baseSiderWidth }}
      >
        <Header
          className="app-header"
          style={{ left: baseSiderWidth, width: `calc(100vw - ${baseSiderWidth}px)` }}
        >
          <div className="app-header-left">
            <div className="app-header-title-row">
              <div className="app-header-title">企业 RBAC 管理台</div>
            </div>
            <div className="app-header-subtitle">权限、日志、通知与系统配置统一管理</div>
          </div>
          <Space className="app-header-actions" size={16}>
            <span className="app-header-identity">{profile?.nickname ?? profile?.username}</span>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'profile',
                    label: '个人中心',
                    onClick: onProfile
                  },
                  {
                    key: 'logout',
                    label: '退出登录',
                    onClick: onLogout
                  }
                ]
              }}
            >
              <a onClick={(e) => e.preventDefault()} className="app-avatar-trigger">
                <Avatar size={36} icon={<UserOutlined />} />
              </a>
            </Dropdown>
          </Space>
        </Header>
        <Content className="app-content">
          <div className="app-content-inner">
            <Breadcrumb items={breadcrumbItems} className="app-breadcrumb" />
            <div className="app-page-panel">
            <Outlet />
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};
