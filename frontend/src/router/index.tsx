// 路由配置用于页面导航。
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { LoginPage } from '../pages/login/LoginPage';
import { UsersPage } from '../pages/users/UsersPage';
import { RolesPage } from '../pages/roles/RolesPage';
import { PermissionsPage } from '../pages/permissions/PermissionsPage';
import { DivinationPage } from '../pages/divination/DivinationPage';
import { AuditCenterPage } from '../pages/audit-center/AuditCenterPage';
import { ProfilePage } from '../pages/profile/ProfilePage';
import { HomePage } from '../pages/home/HomePage';
import { DictPage } from '../pages/dict/DictPage';
import { TemplatePage } from '../pages/notification/TemplatePage';
import { PublishPage } from '../pages/notification/PublishPage';
import { InboxPage } from '../pages/notification/InboxPage';
import { RequireAuth } from './RequireAuth';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
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
      { path: '/permissions', element: <PermissionsPage /> },
      { path: '/divination', element: <DivinationPage /> },
      { path: '/audit-center', element: <Navigate to="/logs/audit" replace /> },
      { path: '/logs/:type', element: <AuditCenterPage /> },
      { path: '/dicts', element: <DictPage /> },
      { path: '/notifications/templates', element: <TemplatePage /> },
      { path: '/notifications/publish', element: <PublishPage /> },
      { path: '/notifications/publishes', element: <Navigate to="/notifications/publish" replace /> },
      { path: '/notifications/inbox', element: <InboxPage /> },
      { path: '/profile', element: <ProfilePage /> }
    ]
  }
]);
