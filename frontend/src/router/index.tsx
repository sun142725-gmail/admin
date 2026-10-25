// 路由配置用于页面导航。
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { LoginPage } from '../pages/login/LoginPage';
import { UsersPage } from '../pages/users/UsersPage';
import { RolesPage } from '../pages/roles/RolesPage';
import { RolePermissionsPage } from '../pages/roles/RolePermissionsPage';
import { PermissionsPage } from '../pages/permissions/PermissionsPage';
import { DivinationPage } from '../pages/divination/DivinationPage';
import { ModelsPage } from '../pages/ai/ModelsPage';
import { AgentsPage } from '../pages/ai/AgentsPage';
import { ChatPage } from '../pages/ai/ChatPage';
import { ImagesPage } from '../pages/ai/ImagesPage';
import { AuditCenterPage } from '../pages/audit-center/AuditCenterPage';
import { ProfilePage } from '../pages/profile/ProfilePage';
import { HomePage } from '../pages/home/HomePage';
import { DictPage } from '../pages/dict/DictPage';
import { TemplatePage } from '../pages/notification/TemplatePage';
import { PublishPage } from '../pages/notification/PublishPage';
import { InboxPage } from '../pages/notification/InboxPage';
import { StockPage } from '../pages/stock/StockPage';
import { FlowsPage } from '../pages/flow/FlowsPage';
import { FlowRunsPage } from '../pages/flow/FlowRunsPage';
import { NovelVideoPage } from '../pages/flow/NovelVideoPage';
import { RequireAuth } from './RequireAuth';

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
