// 路由配置用于页面导航。
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { LoginPage } from '../pages/login/LoginPage';
import { UsersPage } from '../pages/users/UsersPage';
import { RolesPage } from '../pages/roles/RolesPage';
import { RolePermissionsPage } from '../pages/roles/RolePermissionsPage';
import { PermissionsPage } from '../pages/permissions/PermissionsPage';
import { AuditCenterPage } from '../pages/audit-center/AuditCenterPage';
import { ProfilePage } from '../pages/profile/ProfilePage';
import { HomePage } from '../pages/home/HomePage';
import { DictPage } from '../pages/dict/DictPage';
import { RequireAuth } from './RequireAuth';

// 大页面按需加载：此前 20 个页面全部静态引入，echarts/react-quill 等重依赖全进首屏主包（3MB）。
// 登录页与首页保持静态加载，保证首屏直出。
const lazyPage = (loader: () => Promise<Record<string, unknown>>, name: string) => {
  const Component = React.lazy(() =>
    loader().then((module) => ({ default: module[name] as React.ComponentType }))
  );
  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>页面加载中…</div>
      }
    >
      <Component />
    </React.Suspense>
  );
};

const DivinationPage = lazyPage(() => import('../pages/divination/DivinationPage'), 'DivinationPage');
const ModelsPage = lazyPage(() => import('../pages/ai/ModelsPage'), 'ModelsPage');
const AgentsPage = lazyPage(() => import('../pages/ai/AgentsPage'), 'AgentsPage');
const ChatPage = lazyPage(() => import('../pages/ai/ChatPage'), 'ChatPage');
const ImagesPage = lazyPage(() => import('../pages/ai/ImagesPage'), 'ImagesPage');
const StockPage = lazyPage(() => import('../pages/stock/StockPage'), 'StockPage');
const FlowsPage = lazyPage(() => import('../pages/flow/FlowsPage'), 'FlowsPage');
const FlowRunsPage = lazyPage(() => import('../pages/flow/FlowRunsPage'), 'FlowRunsPage');
const NovelVideoPage = lazyPage(() => import('../pages/flow/NovelVideoPage'), 'NovelVideoPage');
const TemplatePage = lazyPage(() => import('../pages/notification/TemplatePage'), 'TemplatePage');
const PublishPage = lazyPage(() => import('../pages/notification/PublishPage'), 'PublishPage');
const InboxPage = lazyPage(() => import('../pages/notification/InboxPage'), 'InboxPage');

// 画布编辑器较重（React Flow），按需加载不进首屏包。
const FlowEditorPage = React.lazy(async () => {
  const module = await import('../pages/flow/editor/FlowEditorPage');
  return { default: module.FlowEditorPage };
});

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    // 卜卦页全屏渲染，不套管理台布局。
    path: '/divination',
    element: (
      <RequireAuth>
        <DivinationPage />
      </RequireAuth>
    )
  },
  {
    // 任务流编辑器全屏渲染（画布需要最大空间），同样走登录守卫。
    path: '/flow/editor/:id',
    element: (
      <RequireAuth>
        <React.Suspense fallback={<div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>加载编辑器…</div>}>
          <FlowEditorPage />
        </React.Suspense>
      </RequireAuth>
    )
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: '/users', element: <UsersPage /> },
      { path: '/roles', element: <RolesPage /> },
      { path: '/roles/:id/permissions', element: <RolePermissionsPage /> },
      { path: '/permissions', element: <PermissionsPage /> },
      { path: '/audit-center', element: <Navigate to="/logs/audit" replace /> },
      { path: '/logs/:type', element: <AuditCenterPage /> },
      { path: '/dicts', element: <DictPage /> },
      { path: '/ai/models', element: <ModelsPage /> },
      { path: '/ai/agents', element: <AgentsPage /> },
      { path: '/ai/chat', element: <ChatPage /> },
      { path: '/ai/images', element: <ImagesPage /> },
      { path: '/stock', element: <StockPage /> },
      { path: '/flow', element: <FlowsPage /> },
      { path: '/flow/runs', element: <FlowRunsPage /> },
      { path: '/flow/novel', element: <NovelVideoPage /> },
      { path: '/notifications/templates', element: <TemplatePage /> },
      { path: '/notifications/publish', element: <PublishPage /> },
      { path: '/notifications/publishes', element: <Navigate to="/notifications/publish" replace /> },
      { path: '/notifications/inbox', element: <InboxPage /> },
      { path: '/profile', element: <ProfilePage /> }
    ]
  }
]);
