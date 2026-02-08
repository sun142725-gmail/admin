# Task List: 通知管理模块

Directory: `helloagents/plan/202602072234_notification-module/`

---

## 1. Notification Backend Module
- [√] 1.1 Create notification module skeleton in `backend/src/modules/notification/notification.module.ts`, `backend/src/modules/notification/notification.controller.ts`, `backend/src/modules/notification/notification.service.ts`, verify why.md#requirement-通知模板管理-富文本变量插入
- [√] 1.2 Add entities and DTOs for templates/publish/messages in `backend/src/modules/notification/**`, verify why.md#requirement-通知模板管理-富文本变量插入
- [√] 1.3 Implement template CRUD and list APIs in `backend/src/modules/notification/**`, verify why.md#requirement-通知模板管理-富文本变量插入, depends on task 1.2
- [√] 1.4 Implement publish APIs and status tracking in `backend/src/modules/notification/**`, verify why.md#requirement-通知发送与通道管理-多通道发布, depends on task 1.3
- [√] 1.5 Implement retry API with idempotency guard in `backend/src/modules/notification/**`, verify why.md#requirement-发布记录与状态追踪-手动重试, depends on task 1.4

## 2. Channel Providers
- [√] 2.1 Implement provider abstraction and registry in `backend/src/modules/notification/providers/**`, verify why.md#requirement-通知发送与通道管理-多通道发布
- [√] 2.2 Implement inbox provider and feishu provider in `backend/src/modules/notification/providers/**`, verify why.md#requirement-通知发送与通道管理-多通道发布, depends on task 2.1

## 3. Frontend Pages
- [√] 3.1 Add notification template management page in `frontend/src/pages/notification/TemplatePage.tsx`, verify why.md#requirement-通知模板管理-富文本变量插入
- [√] 3.2 Add publish records page in `frontend/src/pages/notification/PublishPage.tsx`, verify why.md#requirement-发布记录与状态追踪-手动重试
- [√] 3.3 Add notification module routes and menu in `frontend/src/router/index.tsx` and `frontend/src/layouts/MainLayout.tsx`, verify why.md#requirement-通知发送与通道管理-多通道发布
- [√] 3.4 Add notification API client in `frontend/src/api/notification.ts`, verify why.md#requirement-通知模板管理-富文本变量插入

## 4. Security Check
- [√] 4.1 Execute security check (per G9: input validation, sensitive info handling, permission control, EHRB risk avoidance)

## 5. Documentation Update
- [√] 5.1 Update `helloagents/wiki/modules/notification.md`
- [√] 5.2 Update `helloagents/wiki/api.md` and `helloagents/wiki/data.md`

## 6. Testing
- [√] 6.1 Implement template rendering unit test in `backend/test/notification/template-render.spec.ts`: placeholder render and custom variables
- [√] 6.2 Implement publish flow integration test in `backend/test/notification/publish-flow.spec.ts`: publish + retry
