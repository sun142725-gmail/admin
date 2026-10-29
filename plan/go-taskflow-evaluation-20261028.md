# 模块 1-3 后端服务承接 Go（services/core）评估报告

- 日期：2026-10-28 立项；2026-10-29 前序执行者成稿；2026-10-30 基于当前 HEAD（a176995）重新勘察并全文修订。
- 范围：只评估，不改码（未改动 `services/core` 与 backend 任何文件）。评估对象为本次迭代落地的后端服务：
  1. **分镜片段级控制**（novel_shots 创作控制字段、单镜配置更新 / AI 重新规划 / 单镜重生成、提示词合成纯函数、produceVideo i2v 首帧衔接）
  2. **TTS 节点与配音字幕**（flow 引擎 tts 节点、小说管线逐镜配音 + ffprobe 实测时长、SRT 字幕纯函数落盘、重新生成端点）
  3. **图片提示词库**（prompt_templates + prompt_hash 幂等、批量 sync、筛选/统计、细粒度权限）
  4. **Go 服务承接评估**（本报告）
- 结论先行：**四个服务全部「本迭代暂缓（留 Node）」；提示词库是唯一二期候选**。Go 侧承接就绪度比原方案预估的高（gorm+DB 已就位、TTS/PromptTemplate 回调链已通），但迁移收益仍为负。

## 0. 评估基线（当前 HEAD 实测，修正原方案两处过时认知）

**修正 1：services/core 已非「无 ORM/DB 依赖的纯无状态脚手架」。**
- `services/core/go.mod:41-42` 已引入 `gorm.io/gorm v1.31.2`、`gorm.io/driver/mysql v1.6.0`（另 `go-sql-driver/mysql v1.8.1`，:21）；注意 gorm 两行仍标 `// indirect`，而 `internal/store/db.go:9-10` 直接 import——`go mod tidy` 会重新归类，属装饰性问题，不影响构建（build 已验证）。
- `internal/store/db.go:18-45`：gorm 打开与 backend 共用的 MySQL；`DB_HOST` 为空时返回 nil 降级（:19-21）；**只 AutoMigrate Go 侧自有表**（graphic_stories/graphic_scenes，:40），:39 注释明确「Node 的表（含 prompt_templates）由 TypeORM synchronize 维护」。
- 已有真实业务：图文/动漫流水线 `internal/graphic`（service/persist/hub/media + 测试），路由挂点 `internal/router/router.go:31-34`（DB+Client 就绪才装配，缺依赖 503 降级）。`README.md:3` 仍写「暂无业务」、`proxy-registry.ts:26` 仍写「标准脚手架，暂无业务」，两处描述均已过时（本报告按现实评估，不改码）。
- AI 能力走「回调 Node」链路：`internal/aiclient/client.go` 提供 Chat/Image/**TTS（:170-187，调 Node `/api/internal/ai/tts`，base64 音频回传）**/PromptTemplate（:190-196，读模板并让 Node 引用计数 +1），X-Internal-Token 鉴权（:70），统一响应解包校验 `env.Code != 0`（:113）。Go 侧不自持模型路由/密钥。
- 工程基建：JWT 共验 `internal/middleware/jwt.go:14-50`（HS256 + `typ=="access"` 校验，与 Node 共用 `JWT_ACCESS_SECRET`，空则跳过仅限开发）；统一响应 `pkg/response/response.go:11-17`（`Body{code,message,data,timestamp,traceId}`，与 Node ResponseInterceptor 同构，网关透传不二次包装）；分层建议 `README.md:25`（handler→service→repo，目录建 `internal/` 下）。

**修正 2：本机 Go 工具链可用（绝对路径），三连检查本次实跑全绿。**
原方案「本机无 go 命令、vet/test/build 未运行过」已过时。本次实际执行：

| 命令 | 结果 |
| --- | --- |
| `/Users/sunjihong/sdk/go/bin/go version` | `go version go1.23.4 darwin/arm64` |
| `/Users/sunjihong/sdk/go/bin/go -C services/core vet ./...` | 退出码 0，无输出 |
| `GOPROXY=off /Users/sunjihong/sdk/go/bin/go -C services/core test ./...` | 通过但为缓存；追加 `-count=1` 强制重跑：`ok rbac-core/internal/aiclient 0.394s`、`ok rbac-core/internal/graphic 1.219s`，退出码 0 |
| `GOPROXY=off /Users/sunjihong/sdk/go/bin/go -C services/core build ./...` | 退出码 0 |

（非交互 shell 的 PATH 无 go，故一律走绝对路径；测试/构建加 `GOPROXY=off` 离线跑，依赖缓存齐备。）

**Node 网关转发机制（勘察属实）**：`backend/src/modules/proxy/proxy-registry.ts:19-28` 目前仅登记 `core` 一条（targetEnv=PROXY_CORE_TARGET，默认 `http://127.0.0.1:8081/api/v1`，`timeoutMs: 0`）；:24 注释明确「接入真实业务后按需收紧（长任务建议改为 taskId 异步模式）」。`proxy.controller.ts:16-17` `/api/svc/*` 先过 Node JWT；:39-135 通用转发——未注册 404（:42-44）、JSON 重序列化/multipart 流式透传（:56-64）、透传 authorization + 注入 x-request-id/x-forwarded-user（:66-79）、超时只约束拿到响应头（:81-108）、`@Res` 直写绕过 ResponseInterceptor 不二次包装（:110-134）、finish 旁路写审计 `svc_proxy`（:118-126）。因此前端 axios 的 `code!==0` 判定对 Go 接口同样成立，调 Go 写相对路径 `/svc/core/...` 即可。

## 1. 承接建议矩阵

| 服务 | 建议 | 理由摘要 | 依赖缺口 |
| --- | --- | --- | --- |
| 分镜 CRUD / 单镜重规划 / 单镜重生成 | **留 Node（暂缓）** | 与 TypeORM 实体（novel_shots/novel_projects）、ModelRouterService 多候选路由、usageLog 用量落库、uploads 落盘强耦合；IO 等待型负载（LLM/视频上游），无 CPU 热点 | Go 侧需复刻模型路由+密钥解密+用量落库；表迁移真相会变双份——全为负收益 |
| flow tts 节点与 TTS 上游适配 | **留 Node（暂缓）** | 节点执行依赖 NODE_HANDLERS 注册表（`node-handlers.ts:430-437`）+ DAG 调度 + RunEventsService SSE 进度 + usageLog('tts')；上游适配走 `candidatesByCapability('tts')` + `adapter.speech` 逐候选故障转移（:358-368） | Go 虽已有 aiclient.TTS 回调链（graphic anime 在用），但 flow 引擎/进度广播生态整体在 Node，单摘节点无意义 |
| SRT / 提示词纯函数（subtitle.util / shot-prompt.util / tts.util） | **留 Node（暂缓）** | 无状态、可迁、Go 实现容易；但调用点全部在 Node 管线内，迁走等于每个调用点加一跳 RPC，跨服务成本 > 收益 | 无硬缺口，纯成本问题；Go graphic 侧已有自己的字幕/合成交现成实现（`internal/graphic/media.go`），无须复用 Node 版 |
| 提示词库 CRUD + 幂等同步 | **本迭代暂缓、二期候选** | 领域独立（单表、无跨实体事务），是唯一边界清晰的服务；Go 已有 gorm+DB，就绪度高于原方案预估；但写真相/权限/菜单在 Node | hash 幂等规则需跨语言逐字节一致；唯一冲突语义双实现；TypeORM synchronize 与 gorm AutoMigrate 不能同时管一张表 |

## 2. 逐服务评估

### 2.1 分镜 CRUD / 单镜重规划 / 单镜重生成 → 暂缓

- **数据耦合**：`novel-shot.entity.ts` 本次新增 8 个控制/产物列（lockedSourceText :33-34、visualTask :37-38、progression :41-42、shotMode :45-46、firstFrameLocked :49-50、audioUrl/audioFile/audioDurationMs :63-72），与 `novel_projects.config`（storyboardModelId/ttsVoice/ttsModelId）同属 Node ENTITIES 清单，由 TypeORM synchronize 维护。Go 直写同表即出现双份迁移真相（`store/db.go:39` 的约定明确反对）。
- **上游耦合**：重新规划/重生成经 `ModelRouterService` 多候选故障转移 + usageLog 用量落库；Go 侧等价物 aiclient 只会回调 Node（`aiclient/client.go`），迁移等于「Go 转发回 Node 的路由器」，纯增一跳。
- **负载特征**：单镜操作均为一次性 LLM/上游调用（IO 等待），无 CPU 密集计算，goroutine 并发优势用不上。
- **端点现状**：`novel-video.controller.ts:91`（/shots/:shotId/replan）、:102（/shots/:shotId/regenerate）、:114（/subtitle），与既有 CRUD 同控制器。
- **结论：留 Node。** 若未来出现「整本书百章级并发重规划」的性能瓶颈，再评估把批量批处理下沉 Go。

### 2.2 flow tts 节点与 TTS 上游适配 → 暂缓

- **引擎耦合**：`dag.util.ts:6` 的 `EXECUTABLE_NODE_TYPES` 白名单含 'tts'；`node-handlers.ts:430-437` `NODE_HANDLERS` 注册表挂 `tts: ttsHandler`；执行进度经 RunEventsService SSE 广播直达前端——三层扩展点都是 Node 内闭环生态。
- **上游适配**：`ttsHandler`（:324-399）按 `candidatesByCapability('tts')` 路由候选、`adapter.speech` 逐个故障转移（:358-368）、用量按 kind 'tts' 落库（:386/:399；`usage-log.service.ts:10` kind 枚举含 'tts'）、音频落盘 `tts/` 目录输出 URL。模型注册与密钥 AES 解密都在 Node（ai_models 表）。
- **Go 侧现状**：aiclient.TTS（`client.go:170-187`）→ Node `/internal/ai/tts`（`internal-ai.controller.ts:25-27`）回调链已通，graphic anime 模式已在消费——即「Go 做 TTS」的正确姿势（回调 Node 路由）已存在，无需为 flow 节点再建一套。
- **结论：留 Node。** 节点引擎、SSE 进度、模型路由三件事迁移成本远超收益；上游适配层（adapter.speech）本就是薄封装，无可下沉空间。

### 2.3 SRT / 提示词纯函数 → 暂缓

- `subtitle.util.ts`（formatSrtTime + 时间轴累加，纯字符串拼装无 IO）、`shot-prompt.util.ts`（首帧/运动提示词拼接 + I2V_MOTION_SUFFIX）、`tts.util.ts`（normalizeTtsText / estimateSpeechMs / parseFfprobeDuration）均为无副作用纯函数，各有单测（`backend/test/subtitle.util.spec.ts`、`shot-prompt.util.spec.ts`、`tts.util.spec.ts`）。
- **可迁性**：无状态、无依赖，Go 复刻半天工作量；**不该迁**：三个函数的全部调用点在 Node 管线/节点处理器内（`novel-pipeline.service.ts:19`、`node-handlers.ts:9`），迁走意味着每个调用点跨一次 `/api/svc` RPC——延迟、失败面、部署耦合三头增加，收益为零。
- 另外 Go 侧 graphic anime 已有自己的 SRT/合成实现（`internal/graphic/media.go`，含 libass 探测降级），两边场景不同无须统一。
- **结论：留 Node。** 「能迁」不等于「该迁」，跨服务调用成本 > 收益。

### 2.4 提示词库 CRUD + 幂等同步 → 本迭代暂缓、二期候选

- **领域独立性（支持迁移的一面）**：单表 `prompt_templates`（`prompt-template.entity.ts:7-9`，`prompt_hash` 唯一索引 `uk_prompt_templates_hash`），无跨实体事务；服务层 CRUD + sync + search + stats 全部围绕单表（`prompt-library.service.ts`）。原方案「需 Go 引入 ORM+DB 依赖」的缺口已不存在——gorm+MySQL 已在 `store/db.go` 运行。
- **但本迭代仍暂缓（反对迁移的一面）**：
  1. **建表真相单一**：该表由 TypeORM synchronize 维护（`store/db.go:39` 注释点名 prompt_templates）；Go 接管写入就必须同时接管或冻结建表，改动面波及 Node。
  2. **幂等规则跨语言一致**：`hashPrompt` = sha256(trim(template)) hex（`prompt-library.service.ts:28-30`）；Go 侧 `crypto/sha256` 复刻必须逐字节一致，否则同一 prompt 两边各存一份，幂等键反成脏数据源。
  3. **唯一冲突语义双实现**：Node `isUniqueViolation`（:236-239，正则匹配 UNIQUE constraint/ER_DUP_ENTRY/duplicate key）需在 gorm 侧对应实现。
  4. **权限/菜单在 Node**：权限码 `flow:prompt:view/manage` 与菜单「图片提示词库」由 seed 维护（`seed.service.ts:123-124, 759-760, 780`）；Go 接口要么复用 Node 权限体系（经网关已鉴权，可行），要么自建——自建即打破单一事实源。
  5. **现状无性能压力**：sync 单次上限 200 条（`prompt-template.dto.ts:137` ArrayMaxSize(200)），单条 ≤20000 字符；逐条插入 + 唯一索引兜底，远未触及 Node 边界。
- **读写分离格局已经形成**：Go graphic 流水线经 `internal/prompt-templates`（X-Internal-Token，`internal-prompt-library.controller.ts:9-17`）读模板且读取即计引用——「写归 Node、读回调」是当前稳定态，没有迁移的燃眉点。
- **结论：本迭代暂缓；二期唯一候选。** 触发条件：单次 sync 规模需扩到数千条、或出现多客户端持续性高频导入、或提示词库独立成面向外部工具的产品。

## 3. 落地路径（仅提示词库二期迁移时适用）

1. **分层**：按 `README.md:25` 建议，`internal/promptlibrary/{handler,service,repo}`；handler 参数校验、service 业务（hash/去重/计数）、repo 数据访问。
2. **路由挂点**：`router.go` 的 `registerV1`（:37-45）挂 `/prompt-library` 子分组，照 `registerGraphic`（:47-57）模式；依赖经 `Deps`（:15-18）注入 DB；DB 未配置时 503 降级照 `store/db.go:19-21` 既有约定。**经现有 core 代理通道即可达（前端 `/svc/core/prompt-library/...`），无需在 `PROXY_SERVICES` 新增条目**；仅当拆独立 Go 进程时才在 `proxy-registry.ts:19` 数组登记新服务。
3. **超时收紧**：沿用 core 条目须按 `proxy-registry.ts:24` 注释把 `timeoutMs: 0` 收紧（如 60000）；若 sync 扩容为长任务，改 taskId 异步模式（提交返回 taskId + 轮询/查询端点），SSE 型端点保持 0。
4. **JWT 共验**：`middleware/jwt.go:14-50` 已就绪（HS256 + typ==access + sub→userId）；compose 注入与 Node 一致的 `JWT_ACCESS_SECRET` 即可，纵深防御语义不变（`proxy.controller.ts:66-79` 透传 authorization）。
5. **响应契约**：Go 侧一律走 `pkg/response` 的 Ok/Fail（`response.go:29-40`，Body{code,message,data,timestamp,traceId}）；前端 `http.ts` 的 `code!==0` 判定对 Go 接口直接成立。
6. **数据访问与建表交接**：接管写入时该表的迁移真相必须单边化——推荐「Node 冻结该表 synchronize、Go AutoMigrate 接管」或「Go 只 DML 不 DDL」，二选一写进二期设计，严禁两边同时管。
7. **幂等与冲突**：Go 复刻 `sha256(trim(template))` hex，跨语言同一 fixture 单测断言 hash 相等；gorm 侧唯一冲突判定对齐 Node `isUniqueViolation`（`prompt-library.service.ts:236-239`）。
8. **验收**：每个 Go 业务带 `go test`（aiclient/graphic 已有范式）；CI 以 `GOPROXY=off` 下 vet/test/build 三连核验（本次本机已验证可行，见第 0 节）。

## 4. 风险与结论

**总结论：本迭代四个服务全部留 Node，`services/core` 不动。** 推荐分阶段路线：
- **阶段 0（本迭代）**：不迁移。Go 侧唯一动作是修掉 `README.md:3` / `proxy-registry.ts:26` 两处「暂无业务」的过时描述（文案级，非本报告职责）。
- **阶段 1（二期，触发条件见 2.4）**：仅迁提示词库，按第 3 节路径执行；先做 hash 跨语言一致性测试，再动建表真相。
- **阶段 2（音画混流立项时）**：novel-pipeline 的音画混流/字幕烧录（长时 ffmpeg 重编码，CPU 密集、可任务队列化、不依赖 Node 事务）是真正适合 Go 的候选——`internal/graphic/media.go` 已有同型能力（分段 mp4 + concat + 字幕降级），下沉时走「Node 落任务行 → Go 消费 uploads 共享卷产物 → 回写 Node internal 接口」。

**Go 侧前置条件盘点（修正后）**：
- ~~安装 Go 工具链~~ → 已就绪（`/Users/sunjihong/sdk/go/bin/go`，go1.23.4，vet/test/build 本次实跑全绿）。
- ~~DB 依赖选型~~ → 已定（gorm + go-sql-driver/mysql，与 backend 共库，`store/db.go`）。
- 仍需守住的单一事实源：表迁移真相（TypeORM synchronize vs gorm AutoMigrate，`store/db.go:39` 已划界）、prompt_hash 规则、权限码/菜单/seed（`seed.service.ts:123-124,759-760,780`）、SSE 进度链路（`graphic/hub.go` 仅服务 graphic，未通用化）。

**通用风险**：
1. **双实现/双路由/双表**：任何服务在 Go 侧另起炉灶都会撞车（HEAD 已有 prompt-library、TTS 回调、graphic），只能增量扩展。
2. **hash 不一致**：trim/sha256/hex 任一细节偏差即幂等键失效，必须跨语言 fixture 断言。
3. **团队维护成本**：主栈 NestJS；跨服务事务/一致性的心智成本远超当前规模收益——这是「全部暂缓」的根本理由。

## Notes：大纲与 HEAD 的冲突处理记录

1. 大纲基线「无 ORM/DB 依赖 go.mod」→ **与现实不符**：gorm v1.31.2 + mysql 驱动已在 go.mod 与 `store/db.go` 运行，基线按现实改写（第 0 节修正 1）。
2. 大纲基线「本机无 go、vet/test/build 未运行」→ **已过时**：绝对路径 `/Users/sunjihong/sdk/go/bin/go` 可用，三连本次实跑全绿（第 0 节修正 2，含逐条命令与输出）。
3. 大纲服务清单中 `prompt-image.entity.ts` 不存在 → 实际为 `prompt-template.entity.ts`（表 prompt_templates + prompt_hash），提示词库（module/controller/guarded/internal controller/dto/前端页/seed 菜单）已在 HEAD 落地，评估按现实进行。
4. 大纲服务清单中 `tts-upstream.service.ts` 不存在 → TTS 上游适配实为 `node-handlers.ts` ttsHandler 内 `candidatesByCapability('tts')` + `adapter.speech` 逐候选故障转移（:358-368）；engine 目录另有 `video-upstream.service.ts`（视频三段式提交/轮询/取回）。
5. 前序执行者留稿的矩阵为 3 模块口径 → 按大纲改为 4 服务行；留稿声称的 go 检查本次已独立复跑验证（`-count=1` 强制非缓存）。
6. `README.md:3`、`proxy-registry.ts:26` 的「暂无业务」描述与 HEAD 现状（graphic/anime 业务）不符 → 报告按现实评估；描述修正属改码，超出本任务「只评估」边界，未执行。
