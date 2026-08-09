# Task List: 家庭大事纪服务端接口

Directory: `helloagents/plan/202608081814_family_milestone_api/`

---

## 1. 数据模型
- [√] 1.1 新增 `backend/src/common/entities/family-milestone.entity.ts`，验证 why.md#requirement-家庭大事纪接口-scenario-创建和维护大事纪
- [√] 1.2 注册实体到 `backend/src/app.module.ts` 与 `backend/src/modules/family/family.module.ts`，依赖任务 1.1

## 2. 接口与业务逻辑
- [√] 2.1 新增大事纪 DTO，验证 why.md#requirement-家庭大事纪接口-scenario-创建和维护大事纪
- [√] 2.2 扩展 `backend/src/modules/family/family.service.ts` 实现列表、详情、创建、更新、删除、核心标记、汇总，验证 why.md#requirement-家庭大事纪接口-scenario-权限控制
- [√] 2.3 扩展 `backend/src/modules/family/family.controller.ts` 暴露移动端文档约定接口，依赖任务 2.2

## 3. Security Check
- [√] 3.1 执行安全检查，覆盖输入校验、家庭成员权限、房主权限、无敏感信息硬编码

## 4. Documentation Update
- [√] 4.1 更新 `helloagents/wiki/modules/family.md`
- [√] 4.2 更新 `helloagents/wiki/api.md`
- [√] 4.3 更新 `helloagents/wiki/data.md`
- [√] 4.4 更新 `helloagents/CHANGELOG.md`

## 5. Testing
- [√] 5.1 执行后端构建验证，检查新增代码类型与编译结果

## 执行备注
- `npm run build` 通过。
- `npm test` 已执行，失败点为既有测试环境问题：短信验证码测试缺少 `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET`；部分 e2e 用例请求 `/api/auth/login` 返回 404。沙箱内还曾出现端口监听 `EPERM`，沙箱外复测后端口问题消失。
