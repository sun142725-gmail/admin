# 任务清单: 企业级 RBAC 权限管理系统

Directory: `helloagents/plan/202601250851_rbac_system/`

---

## 1. Backend - 基础工程与通用能力
- [√] 1.1 初始化 NestJS 工程与全局配置（响应体/异常过滤器/Swagger）在 `backend/src/main.ts`
- [√] 1.2 配置 TypeORM 与基础实体基类在 `backend/src/common/database/*`
- [√] 1.3 配置 CORS 与限流中间件在 `backend/src/common/middleware/*`

## 2. Backend - Auth 模块
- [√] 2.1 实现 Auth 模块登录/刷新/退出在 `backend/src/modules/auth/*`, 对齐 why.md#认证与权限控制-登录与刷新
- [√] 2.2 实现 JWT Guard 与权限码校验在 `backend/src/common/guards/*`
- [√] 2.3 实现 profile 与权限码聚合在 `backend/src/modules/auth/*`

## 3. Backend - Users/Roles/Permissions/Resources
- [√] 3.1 实现用户管理与角色分配在 `backend/src/modules/users/*`, 对齐 why.md#用户/角色/权限管理-分配角色与权限
- [√] 3.2 实现角色管理与权限分配在 `backend/src/modules/roles/*`
- [√] 3.3 实现权限码管理在 `backend/src/modules/permissions/*`
- [√] 3.4 实现资源树与菜单接口在 `backend/src/modules/resources/*`, 对齐 why.md#菜单与资源-动态菜单

## 4. Backend - 审计日志与初始化数据
- [√] 4.1 实现审计日志记录在 `backend/src/modules/audit/*`
- [√] 4.2 实现初始化数据与默认账号在 `backend/src/seed/*`

## 5. Frontend - 基础框架与认证
- [√] 5.1 初始化 Vite + React + Ant Design 在 `frontend/src/main.tsx`
- [√] 5.2 实现 axios 封装与 token 刷新在 `frontend/src/api/http.ts`
- [√] 5.3 实现登录页与鉴权路由在 `frontend/src/pages/login/*`

## 6. Frontend - 主布局与权限页面
- [√] 6.1 实现主布局与菜单树渲染在 `frontend/src/layouts/*`
- [√] 6.2 实现用户/角色/权限页面与表单在 `frontend/src/pages/*`
- [√] 6.3 实现权限码按钮级控制在 `frontend/src/components/permission/*`

## 7. Infra - Docker 与 Nginx
- [√] 7.1 编写 docker-compose 与环境变量在 `docker-compose.yml` 与 `.env.example`
- [√] 7.2 编写 Nginx 配置与前端生产镜像在 `nginx/*`

## 8. Documentation
- [√] 8.1 编写 README 启动说明在 `README.md`
- [√] 8.2 补充 Swagger 接口说明与初始化权限清单在 `backend/src/modules/*`

## 9. Security Check
- [√] 9.1 执行安全检查（输入校验/敏感信息/权限控制/EHRB 风险规避）

## 10. Testing
- [-] 10.1 实现 Auth 登录/刷新与 Guard 单元测试在 `backend/test/auth.spec.ts`
> Note: 已编写测试用例，但未在当前环境执行
