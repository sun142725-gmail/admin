# Task List: 日志中心与前端埋点日志增强

Directory: `helloagents/plan/202601251534_log_center_enhance/`

---

## 1. 后端日志中心与数据模型
- [√] 1.1 新增日志实体 `backend/src/common/entities/track-log.entity.ts`、`backend/src/common/entities/frontend-log.entity.ts`、`backend/src/common/entities/error-log.entity.ts`，verify why.md#requirement-日志中心新增多日志类型-日志中心筛选与分页
- [√] 1.2 新增日志中心模块与查询接口 `backend/src/modules/log-center/log-center.module.ts`、`backend/src/modules/log-center/log-center.controller.ts`、`backend/src/modules/log-center/log-center.service.ts`，verify why.md#requirement-日志中心新增多日志类型-日志中心筛选与分页, depends on task 1.1
- [√] 1.3 新增批量日志上报接口 DTO `backend/src/modules/log-center/dto/`（events），verify why.md#requirement-前端埋点上报-pv记录, depends on task 1.2
- [√] 1.4 响应体注入 traceId 与端来源字段处理 `backend/src/common/interceptors/response.interceptor.ts`，verify why.md#requirement-日志中心新增多日志类型-日志中心筛选与分页

## 2. 后端清理任务与权限
- [√] 2.1 增加 7 天定时清理任务 `backend/src/modules/log-center/log-cleanup.service.ts`，verify why.md#requirement-7-天数据保留-定时清理
- [-] 2.2 更新权限与菜单资源 `backend/src/modules/seed/seed.service.ts`（日志中心新增类型入口可选），verify why.md#requirement-日志中心新增多日志类型-日志中心筛选与分页, depends on task 2.1
> Note: 复用现有日志中心菜单，无需新增入口。

## 3. 前端日志中心与公共表格
- [√] 3.1 新增公共表格组件 `frontend/src/components/AppTable.tsx`，统一分页文案与分页条数，verify why.md#requirement-公共表格组件-统一分页文案
- [√] 3.2 替换全站表格使用公共组件（用户/角色/权限/日志中心/其他），verify why.md#requirement-公共表格组件-统一分页文案, depends on task 3.1
- [√] 3.3 日志中心新增类型切换与查询接口 `frontend/src/pages/audit-center/AuditCenterPage.tsx`、`frontend/src/api/logCenter.ts`，verify why.md#requirement-日志中心新增多日志类型-日志中心筛选与分页, depends on task 3.2

## 4. 前端埋点与日志上报
- [√] 4.1 路由 PV 埋点上报（页面 code）`frontend/src/router/index.tsx`、`frontend/src/api/logCenter.ts`，verify why.md#requirement-前端埋点上报-pv记录
> Note: 在 `frontend/src/layouts/MainLayout.tsx` 中完成 PV 上报。
- [√] 4.2 前端日志缓冲与批量上报（统一事件队列，包含 sessionId/traceId）`frontend/src/utils/logBatcher.ts`、`frontend/src/api/logCenter.ts`，verify why.md#requirement-前端埋点上报-pv记录, depends on task 4.1
- [√] 4.3 前端错误日志上报（全局错误监听接入批量队列）`frontend/src/main.tsx` 或 `frontend/src/utils/errorReporter.ts`，verify why.md#requirement-日志中心新增多日志类型-日志中心筛选与分页, depends on task 4.2

## 5. 安全检查
- [√] 5.1 执行安全检查（输入校验、敏感信息、权限控制、EHRB 风险避免）

## 6. 文档更新
- [√] 6.1 更新知识库 `helloagents/wiki/modules/frontend.md`、`helloagents/wiki/modules/audit-center.md`、`helloagents/wiki/modules/log-center.md`、`helloagents/wiki/api.md`、`helloagents/wiki/data.md`、`helloagents/wiki/arch.md`

## 7. 测试
- [√] 7.1 新增日志中心上报与查询测试 `backend/test/log-center.e2e-spec.ts`
> Note: 实际新增文件为 `backend/test/log-center.spec.ts`。
