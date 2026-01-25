# 任务清单: 个人中心与日志中心模块

Directory: `helloagents/plan/202601251353_profile_audit_center/`

---

## 1. Backend - Audit Center 模块
- [√] 1.1 新增 audit-center 模块与接口在 `backend/src/modules/audit-center/*`
- [√] 1.2 实现日志分页/筛选/详情在 `backend/src/modules/audit-center/*`

## 2. Backend - Profile 模块
- [√] 2.1 新增 profile 模块与接口在 `backend/src/modules/profile/*`
- [√] 2.2 实现资料更新、改密、头像上传在 `backend/src/modules/profile/*`
- [√] 2.3 扩展用户实体 avatarUrl 字段与迁移逻辑

## 3. Frontend - 日志中心页面
- [√] 3.1 新增日志中心路由与页面在 `frontend/src/pages/audit-center/*`
- [√] 3.2 实现筛选/分页/详情弹窗在 `frontend/src/pages/audit-center/*`

## 4. Frontend - 个人中心页面
- [√] 4.1 新增个人中心路由与页面在 `frontend/src/pages/profile/*`
- [√] 4.2 右上角菜单增加个人中心入口

## 5. 权限与菜单
- [√] 5.1 新增权限码与菜单资源

## 6. Security Check
- [√] 6.1 执行安全检查（上传校验/敏感信息/权限控制）

## 7. Documentation
- [√] 7.1 更新 `helloagents/wiki/modules/profile.md`、`helloagents/wiki/modules/audit-center.md`
- [√] 7.2 更新 `helloagents/wiki/api.md` 与 `helloagents/wiki/data.md`

## 8. Testing
- [-] 8.1 新增 profile 与 audit-center 测试用例
> Note: 已实现功能，但未补充测试用例
