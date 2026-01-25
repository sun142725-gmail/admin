# 技术设计：日志中心与前端埋点日志增强

## 技术方案
### 核心技术
- NestJS 10 + TypeORM + MySQL
- React 18 + Ant Design
- 定时任务：@nestjs/schedule

### 实现要点
- 新增日志类型表：`track_logs`（PV）、`frontend_logs`（前端日志）、`error_logs`（错误日志）
- 统一日志中心查询接口，按类型分页筛选并限制 7 天范围
- 前端路由变更触发 PV 上报，事件与日志合并批量提交
- 全部接口响应增加 traceId；请求携带端来源与 sessionId
- 抽象公共表格组件，分页单位文案改为“页”，分页条数可选 10/20/30/50

## 架构决策 ADR
### ADR-004：日志类型分表 + 统一查询层
**Context:** 日志中心新增打点/前端/错误日志，数据量大且仅保留 7 天。  
**Decision:** 采用类型分表存储，统一查询层聚合展示。  
**Rationale:** 分表便于索引与清理，查询层统一 UI/过滤逻辑。  
**Alternatives:** 单表 type 字段 → 拒绝原因：扩展与清理成本高、字段差异不易演进。  
**Impact:** 新增实体/仓储与定时清理任务，日志中心增加类型切换与过滤策略。

## API 设计
### POST /api/log-center/events
- **Request:** { source, sessionId, events: [{ type, payload, traceId?, createdAt? }] }
- **Response:** { accepted, traceId }

### GET /api/log-center
- **Request:** { type, page, pageSize, userId?, pageCode?, traceId?, module?, start?, end? }
- **Response:** { items, total }

### GET /api/log-center/:type/:id
- **Request:** { type, id }
- **Response:** { detail }

## 数据模型
```sql
CREATE TABLE track_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  page_code VARCHAR(64) NOT NULL,
  path VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  referrer VARCHAR(255) NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE frontend_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  level VARCHAR(16) NOT NULL,
  message VARCHAR(255) NOT NULL,
  stack TEXT NULL,
  meta JSON NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE error_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  message VARCHAR(255) NOT NULL,
  stack TEXT NULL,
  meta JSON NULL,
  created_at DATETIME NOT NULL
);
```

## 安全与性能
- **安全:** 输入校验、限制日志字段长度、接口鉴权与权限码控制
- **性能:** 7 天保留 + 定时清理 + 索引优化 + 分表查询

## 测试与部署
- **测试:** 后端日志上报与查询单测；前端 PV 上报触发测试
- **部署:** 新增 schedule 依赖与数据库迁移/同步
