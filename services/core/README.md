# core —— Go 微服务标准脚手架

多语言架构中的 Go 服务标准模板：**暂无业务**，只含示例接口与工程基建。
由 Node 网关（`backend` 的 `/api/svc/*`）统一转发接入，前端不直连本服务。

## 目录结构

```
services/core/
├── cmd/server/main.go            # 入口：装配 + 优雅停机（不写业务）
├── internal/
│   ├── config/                   # 环境变量配置（12-Factor）
│   ├── router/                   # 路由注册（新业务模块在此挂子分组）
│   ├── middleware/
│   │   ├── jwt.go                # 与 Node 共用 JWT_ACCESS_SECRET 的验签中间件
│   │   └── observability.go      # X-Request-Id 透传 + 访问日志
│   └── handler/
│       ├── health.go             # /healthz /readyz 探针
│       └── example.go            # 示例接口（列表/详情404/创建/SSE 流式）
├── pkg/response/                 # 统一响应结构（与 Node ResponseInterceptor 同构）
├── Dockerfile                    # 多阶段构建（compose 里 build: ./services/core）
└── Makefile                      # make run / build / test / vet / docker-build
```

接业务时的推荐分层：`handler`（参数校验）→ `service`（业务逻辑）→ `repo`（数据访问），目录建在 `internal/` 下。

## 本地运行

```bash
cd services/core
make run          # 监听 :8081；未配 JWT_ACCESS_SECRET 时跳过鉴权（开发模式）

# 配置项（环境变量）
# PORT=8081
# JWT_ACCESS_SECRET=rbac_access_secret   # 与 backend/.env 一致则可验签 Node 签发的 token
# GIN_MODE=release
```

直连验证：

```bash
curl http://127.0.0.1:8081/healthz
curl http://127.0.0.1:8081/api/v1/examples
```

经 Node 网关访问（需先登录拿 accessToken）：

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:3000/api/svc/core/examples
curl -N -H "Authorization: Bearer <token>" http://127.0.0.1:3000/api/svc/core/examples/1/stream   # SSE 透传演示
```

## 与 Node 网关的对接关系

- 前端 → `Node /api/svc/core/<rest>` → `Go <PROXY_CORE_TARGET>/<rest>`（默认 `http://127.0.0.1:8081/api/v1`）
- 注册位置：`backend/src/modules/proxy/proxy-registry.ts`；目标地址用环境变量 `PROXY_CORE_TARGET` 覆盖
- Node 负责鉴权 + 访问审计；Go 侧对 JWT 再验签一次（纵深防御），业务事件自行写审计库

## 部署

- compose 服务名 `core`（根目录 `docker-compose.yml`），网关在 compose 网络内访问 `http://core:8081/api/v1`
- 发布面板（deploy-panel）已注册 `core` 按钮，或命令行 `bash deploy-panel/scripts/deploy-core.sh`
