# 项目技术规范

---

## 技术栈
- **后端:** NestJS 10 / TypeScript / TypeORM / MySQL / Redis
- **前端:** React 18 / Vite / TypeScript / Ant Design / React Router / Redux Toolkit
- **鉴权:** JWT accessToken + refreshToken（tokenVersion 策略）
- **文档:** Swagger
- **部署:** Docker Compose + Nginx
- **发布面板:** `deploy-panel` 提供受控 HTTP 发布入口，详见 `helloagents/wiki/modules/deploy-panel.md`
- **镜像源:** docker.m.daocloud.io/library
- **Alpine apk 源:** mirrors.aliyun.com/alpine（沿用当前 Alpine 版本路径）
- **npm registry:** https://registry.npmmirror.com
- **构建依赖:** 后端运行阶段需 python3/make/g++ 以支持 sqlite3 编译

---

## 开发规范
- **代码风格:** ESLint + Prettier（前后端统一）
- **命名约定:** camelCase（变量/函数），PascalCase（类/组件），snake_case（数据库字段）

---

## 前端视觉规范
- **布局原则:** Header 固定顶部，Sider 固定左侧，主内容区独立滚动
- **容器规范:** 页面主体统一使用卡片化面板与明确留白层级
- **列表页规范:** 工具条、筛选区、表格区分层明确，查询按钮顺序统一
- **表单规范:** 轻量表单使用 Modal，大型编辑与详情优先 Drawer
- **规范文档:** 详见 `helloagents/wiki/frontend-visual.md`

---

## 错误与日志
- **统一响应:** { code, message, data, timestamp }
- **错误码映射:** 401/403/422/500 等统一处理
- **日志策略:** 结构化日志，禁止输出密码/Token/密钥

---

## 测试与流程
- **测试:** Jest 单元测试，测试环境使用 sqlite3
- **提交:** 建议使用 Conventional Commits
