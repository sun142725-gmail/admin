# Task List: 字典管理与多端枚举查询

Directory: `helloagents/plan/202601251700_dict_management/`

---

## 1. 后端字典模块与数据模型
- [√] 1.1 新增字典实体与关系 `backend/src/common/entities/dict.entity.ts`、`backend/src/common/entities/dict-item.entity.ts`，verify why.md#requirement-字典管理-字典维护
- [√] 1.2 新增字典模块与接口 `backend/src/modules/dict/*`，verify why.md#requirement-字典管理-字典维护, depends on task 1.1
- [√] 1.3 批量查询与多语言支持 `backend/src/modules/dict/dict.service.ts`，verify why.md#requirement-批量字典查询-多-code-查询, depends on task 1.2

## 2. 缓存与菜单权限
- [√] 2.1 Redis 缓存封装与失效策略 `backend/src/modules/dict/dict-cache.service.ts`，verify why.md#requirement-redis-缓存-缓存失效
- [√] 2.2 新增系统配置菜单与权限码 `backend/src/modules/seed/seed.service.ts`、`backend/src/modules/resources/*`，verify why.md#requirement-字典管理-字典维护

## 3. 前端字典管理
- [√] 3.1 新增字典列表与详情页 `frontend/src/pages/dict/*`，verify why.md#requirement-字典管理-字典维护
- [√] 3.2 字典管理路由与菜单适配 `frontend/src/router/index.tsx`、`frontend/src/layouts/MainLayout.tsx`，verify why.md#requirement-字典管理-字典维护
- [√] 3.3 新增字典接口封装 `frontend/src/api/dict.ts`，verify why.md#requirement-批量字典查询-多-code-查询

## 4. 安全检查
- [√] 4.1 执行安全检查（输入校验、权限控制、缓存一致性）

## 5. 文档更新
- [√] 5.1 更新知识库 `helloagents/wiki/modules/dict.md`、`helloagents/wiki/api.md`、`helloagents/wiki/data.md`、`helloagents/wiki/overview.md`、`helloagents/wiki/arch.md`

## 6. 测试
- [√] 6.1 新增字典查询与 CRUD 测试 `backend/test/dict.spec.ts`
