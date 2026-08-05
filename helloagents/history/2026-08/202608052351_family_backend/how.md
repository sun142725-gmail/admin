# 技术方案

## Design
- 新增 `FamilyModule`，集中注册家庭、成员、邀请码、待办、公告和用户设置相关实体。
- 新增 `FamilyService` 统一处理成员身份校验、房主权限、邀请码生命周期、待办权限和公告权限。
- 新增 `FamilyController` 暴露 `/api/family/*` 路由。
- 新增 `MobileUserController` 暴露 `/api/user/*` 移动端接口。
- Auth profile 补充手机号与当前家庭 ID。

## Security
- 所有家庭与用户设置接口均使用 `JwtAuthGuard`。
- 家庭详情、成员、待办、公告和 dashboard 均校验当前用户属于目标家庭。
- 房主接口统一校验 `role=owner`。
- 待办编辑/删除限制为创建人或房主。

## Constraints
- 加入申请接口按一期说明预留，当前返回空列表或成功占位。
- 使用现有 TypeORM synchronize 机制，不新增迁移脚本。
