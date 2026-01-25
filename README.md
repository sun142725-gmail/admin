# 企业级 RBAC 权限管理系统

## 1. 项目结构设计
```
.
├── backend/                 # NestJS 后端
├── frontend/                # React 前端
├── nginx/                   # Nginx 配置
├── docker-compose.yml       # Docker Compose
├── .env.example             # 环境变量示例
└── helloagents/             # 知识库与方案包
```

## 2. 数据库表设计
- users / roles / permissions / resources / user_roles / role_permissions / audit_logs
- 详情见 `helloagents/wiki/data.md`

## 3. 后端模块与接口
- Auth：登录/刷新/退出/获取 profile
- Users：用户 CRUD、禁用、重置密码、分配角色
- Roles：角色 CRUD、分配权限、查看绑定用户
- Permissions：权限 CRUD
- Resources：菜单树、资源 CRUD
- Audit：审计日志查询
- 接口文档：`/api/docs`

## 4. 前端路由与页面
- 登录页 `/login`
- 主布局：左侧菜单 + 顶部用户信息 + 面包屑
- 用户管理 `/users`
- 角色管理 `/roles`
- 权限管理 `/permissions`
- 六爻占卜 `/divination`
- 日志中心 `/audit-center`
- 个人中心 `/profile`

## 5. docker-compose / nginx
- `docker-compose.yml` 包含 mysql、redis、backend、frontend、nginx
- Nginx 代理 `/api` 到后端，静态资源由 Nginx 提供

## 6. 初始化数据与测试
- 默认账号：`admin` / `password`
- 默认角色：管理员（admin）
- 默认权限码：`system:user:list` 等（详见下方权限清单）
- 测试：`backend/test/auth.spec.ts`

---

## 本地运行（Node 20）

### 后端
```bash
cd backend
cp .env.example .env
npm install
npm run start:dev
```

### 前端
```bash
cd frontend
npm install
npm run dev
```

访问：
- 前端：http://localhost:5173
- Swagger：http://localhost:3000/api/docs

## Docker 运行
```bash
docker-compose up --build
```

访问：
- Nginx：http://localhost
- Swagger：http://localhost:3000/api/docs

---

## 默认账号密码
- 用户名：`admin`
- 密码：`password`

## 示例权限码清单
- system:user:list / create / update / disable / delete / reset / assign
- system:role:list / create / update / delete / assign / users
- system:permission:list / create / update / delete
- system:resource:create / update / delete
- system:audit:list
- system:audit:center
- system:profile:view / update / password / avatar
- system:divination:use

## 项目说明
- 统一响应结构：`{ code, message, data, timestamp }`
- refreshToken 仅用于刷新（tokenVersion 策略）
- 密码使用 bcrypt 加密
