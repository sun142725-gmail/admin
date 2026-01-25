# 技术设计：字典管理与多端枚举查询

## 技术方案
### 核心技术
- NestJS 10 + TypeORM + Redis
- React 18 + Ant Design

### 实现要点
- 字典表 `dicts` + 字典项表 `dict_items`，字典项支持多语言字段
- 提供批量查询接口 `/api/dicts?codes=a,b&lang=zh-CN`
- Redis 缓存策略：按 `dict:{code}:{lang}` 缓存，变更后失效，TTL 6 小时
- 管理端字典页面：列表/详情/新增/编辑/删除
- 系统配置菜单分组：系统配置 → 字典管理

## 架构决策 ADR
### ADR-005：字典分表 + Redis 缓存
**Context:** 字典查询频繁且多端需要批量获取与多语言支持。  
**Decision:** 使用字典与字典项分表，结合 Redis 缓存。  
**Rationale:** 便于扩展多语言字段与缓存键管理。  
**Alternatives:** 单表 JSON 字段 → 拒绝原因：查询与更新复杂，缓存粒度不清晰。  
**Impact:** 新增模块与缓存依赖，增加缓存一致性逻辑。

## API 设计
### GET /api/dicts
- **Request:** { codes, lang? }
- **Response:** { [code]: items[] }

### GET /api/dicts/:code
- **Request:** { lang? }
- **Response:** dict detail + items

### POST /api/dicts
- **Request:** { code, name, description?, status }
- **Response:** dict

### PATCH /api/dicts/:id
- **Request:** { name, description?, status }
- **Response:** dict

### DELETE /api/dicts/:id
- **Response:** void

### POST /api/dicts/:id/items
- **Request:** { value, label, labelEn?, sortOrder, status, extra? }
- **Response:** item

### PATCH /api/dict-items/:id
- **Request:** { value?, label?, labelEn?, sortOrder?, status?, extra? }
- **Response:** item

### DELETE /api/dict-items/:id
- **Response:** void

## 数据模型
```sql
CREATE TABLE dicts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE dict_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dict_id BIGINT NOT NULL,
  value VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  label_en VARCHAR(128) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 1,
  extra JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

## 安全与性能
- **安全:** 权限码控制（list/create/update/delete），输入校验与唯一性校验
- **性能:** Redis 缓存 + 批量查询 + 分页索引

## 测试与部署
- **测试:** 字典批量查询与 CRUD 测试
- **部署:** Redis 可用时启用缓存，缺失时降级直查 DB
