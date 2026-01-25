// 主布局提供菜单、头部与内容容器。
import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Menu, Breadcrumb, Dropdown, Space, message } from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  FileTextOutlined,
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
      '/users': <UserOutlined />,
      '/roles': <TeamOutlined />,
      '/permissions': <SafetyOutlined />,
      '/logs/audit': <FileTextOutlined />,
      '/logs/track': <FileSearchOutlined />,
      '/logs/frontend': <FileSearchOutlined />,
      '/logs/error': <FileSearchOutlined />,
      '/divination': <ExperimentOutlined />,
      '/dicts': <BookOutlined />,
      '/profile': <IdcardOutlined />
    };
    return pathIconMap[item.path];
  }
  const nameIconMap: Record<string, React.ReactNode> = {
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

  useEffect(() => {
    fetchProfile().then((data) => dispatch(setProfile(data)));
    fetchMenuTree().then((data) => setMenuTree(data));
  }, [dispatch]);

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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        collapsedWidth={72}
        collapsed={collapsed}
        theme="light"
        onMouseEnter={() => setCollapsed(false)}
        onMouseLeave={() => setCollapsed(true)}
      >
        <div style={{ padding: 16, fontWeight: 600 }}>
          <Link
            to="/"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <AppstoreOutlined />
            {!collapsed && <span>RBAC 管理后台</span>}
          </Link>
        </div>
        <Menu mode="inline" items={items} selectedKeys={[location.pathname]} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px' }}>
          <Space style={{ float: 'right' }}>
            <span>{profile?.nickname ?? profile?.username}</span>
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
              <a onClick={(e) => e.preventDefault()}>
                <UserOutlined />
              </a>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: '16px 24px' }}>
          <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 16 }} />
          <div style={{ background: '#fff', padding: 24, minHeight: 360 }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};
