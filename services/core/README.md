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

## 图文流水线（graphic）

第一个真实业务：原文 →（LLM 分幕）→ 提示词模板渲染 → 并发生图 → 落盘 `uploads/graphic/` → SSE 进度。

```
internal/
├── entity/graphic.go        # graphic_stories / graphic_scenes（GORM，Go 侧自有表，启动 AutoMigrate）
├── store/db.go              # 复用 backend 的 MySQL；DB_HOST 为空则以 503 降级
├── aiclient/client.go       # 回调 Node /api/internal/ai/chat|image 与提示词模板（X-Internal-Token 鉴权）
└── graphic/                 # 流水线：分幕/渲染/并发生图（信号量限流）/断点重跑/取消/事件广播
```

- 接口：`/api/v1/graphic/stories`（列表/详情/创建/run/cancel/stream，经 Node 网关 `/api/svc/core/...` 访问）
- 关键约定：gpt-image 类渠道可能返回数百 KB 的 base64 data URL，**统一落盘换成本地相对路径**（与 novel-pipeline 的本地化约定一致）
- 环境变量：`DB_*`（复用 backend 的库）、`NODE_BASE_URL`（默认 http://127.0.0.1:3000）、`INTERNAL_API_TOKEN`（与 backend 一致，未配置时 Node 内部接口 fail-closed）、`UPLOAD_DIR`（默认 ../../backend/uploads，compose 内 /app/uploads 同卷）、`IMAGE_CONCURRENT`（默认 3）
- 前端：`/graphic` 页面 + `frontend/src/api/graphic.ts`；提示词库 CRUD 在 Node `/api/prompt-templates`（模板 `{{content}}` 占位由 Go 渲染）

## 二期：动漫模式（anime）

`mode=anime` 的故事在生图之外追加：**首帧延续 → TTS 配音 → ffmpeg 合成成片**。

- **首帧延续**（`continuity`，动漫默认开）：上一幕成图转 data URL 作参考图，走 Node 的 `/images/edits` 图生图通道，保持角色/画风连贯；顺序生成（每幕依赖上一幕）
- **TTS 配音**：逐幕对分幕内容调 `/internal/ai/tts`（OpenAI 兼容 `/audio/speech` 渠道，AI 模型管理里配 `tts` 能力模型即可）。**TTS 失败不致命**——该幕静音（默认 4s）兜底，事件流里有 warning
- **合成**（`internal/graphic/media.go`）：每幕 图（1280x720 裁切 + 缓动推近）+ 配音 + 字幕 → 分段 mp4 → concat 成片 `final.mp4`
- **字幕降级**：启动时探测 ffmpeg 是否带 `subtitles` 滤镜（libass）——有则逐幕烧录；没有（如精简版 ffmpeg）则产出全时间轴 `final.srt` 外挂字幕，装全量 ffmpeg 后自动恢复烧录
- 产物：`uploads/graphic/story-{id}/final.mp4`（+ `final.srt`），`story.video_url` 落库
- 依赖：ffmpeg/ffprobe（Dockerfile 已装 ffmpeg + font-noto-cjk；macOS 本机需自行 `brew install ffmpeg`，缺 libass 时字幕自动降级为外挂）
- 环境变量：`FFMPEG_BIN` / `FFPROBE_BIN`（默认 PATH）、`SUBTITLE_FONT`（容器内 Noto Sans CJK SC，本机默认 PingFang SC）

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
