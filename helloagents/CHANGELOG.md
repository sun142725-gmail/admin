# 变更日志

本文件记录项目的重要变更，格式参考 Keep a Changelog 与语义化版本。

## [未发布]
### 安全加固（全局 review P0/P1，2026-09-21）
- 文件上传 bizType 白名单枚举（common/avatar/divination/chat/notification），multer 落盘阶段格式校验防路径穿越
- 登录/验证码端点加严限流（login/code 10 次/分、发码 5 次/分）；AI 对话/解卦/生图端点 20 次/分兜底，防 LLM 余额被刷
- 修正全局限流默认值：throttler v5 的 ttl 单位为毫秒，原默认 60（=60ms 窗口）形同虚设 → 60000ms；.env.development 与 deploy 模板同步修正；NODE_ENV=test 不注册限流守卫避免测试 429
- 日志上报加上限：单批 ≤50 条、payload ≤4000 字符、字符串字段 MaxLength
- 占卜创建事务化（卦主体+六爻原子写入）；用户管理禁止自操作与停用/删除最后一名可用管理员
- 新增 helmet 安全响应头（CSP 关闭以兼容 Swagger UI 与图片外链，CORP=cross-origin）；生产环境关闭 Swagger（NODE_ENV=production 时 /api/docs 404）
### UI 规范化：Tailwind v4 引入 + antd5 主题 Token 化（2026-09-23，方案见 plan/ui_tailwind_refactor.md）
- 基建：新增 tailwindcss@4 + @tailwindcss/vite（devDeps）；global.css 只引入 theme+utilities 两层并跳过 preflight（防 reset 破坏 antd）；@theme 定义 token（主色/文字/圆角，值与旧 CSS 变量一致）
- antd5 规范落地：ConfigProvider 配置 theme token/components，替代 global.css 中全部 antd !important 全局覆写（卡片 20/表格 18/输入与按钮 12 圆角、表头 #f7faff、hover 行背景、主按钮阴影）；顺带修复按钮圆角 6px 与输入框 12px 的不一致（原按钮覆写已被 antd 压制失效）
- 通用布局类（page-toolbar/actions/breadcrumb/content-inner/role-permissions 居中）改用 @apply 工具类实现，值逐项对齐；复杂渐变/阴影类保留原生 CSS；JSX className 零改动、业务逻辑零改动
### 内联样式清理：54 处静态 style 迁 Tailwind 工具类（2026-09-23，第二批次）
- HomePage 13 / PublishPage 18 / ChatPage 13 / TemplatePage 10 / Images 7 / Agents 5 / 其余 7 处全部清零
- 动态绑定样式（会话高亮、气泡配色、Tag 动态色等）按方案保留 style；ChatPage 气泡对齐改为条件 className
- 层叠规则落地：antd 自带 margin 的组件（Title/Divider/Form.Item）用 Tailwind ! 修饰符（单点受控），无冲突属性用普通工具类
- 提取语义类 preview-card / preview-card-sm / preview-box（通知预览小卡，消除 5 处重复）
### 数据完整性加固（补充 review，2026-09-23）
- 角色删除保护：内置 admin 角色不可删；仍有用户挂载的角色拒绝删除并提示数量
- 权限删除引用检查：仍被角色引用时拒绝；资源删除引用检查：存在子资源时拒绝
- 审计日志写入降级：log() 失败只告警不阻断业务（避免"业务已成功但响应 500"）
- 字典 Redis 缓存读写删全命令 try-catch 降级：缓存故障穿透到 DB，不再 500
### 新增（六爻对接 AI 模块）
- 上线准备目录 deploy/：README（准备事项+脚本执行顺序）、env.production.example 模板、编号脚本（01-sync-ai.sh 引导同步 / 02-generate-ai-sql.sh 拉取开发库 AI 配置生成线上 INSERT IGNORE SQL（线上自添数据不受影响、密钥重加密、按 model_key+base_url 回填模型绑定、强制显式 SOURCE_DB_* 防误连；底层脚本 generate-ai-publish-sql.ts，npm run sync:ai:gen）/ 03-smoke-test.sh 冒烟验证）；docker-compose 补透传 AI_ENCRYPTION_KEY；底层脚本 backend/scripts/sync-divination-agent.ts（npm run sync:ai）与 publish-ai-config.ts（npm run sync:ai:publish）
- ai_agents 新增 code 业务编码字段（唯一可空），业务模块按 code 对接、不依赖自增 id；智能体管理页支持填写
- 解卦链路改为：code=divination 的智能体（其系统提示词/采样参数/绑定模型路由）> 任意 chat 模型路由 > 环境变量直连 > 本地兜底
- seed 幂等迁移：已存在名为「六爻解卦」的智能体自动补上 code=divination
### 重构（AI 中心：渠道并入模型）
- 数据模型简化：渠道字段（协议/请求地址/API Key）直接落到 ai_models，一行模型 = 一个端点；废弃 ai_providers 与 ai_model_channels（seed 启动时自动清理旧表与 /ai/providers 页面资源）
- 模型去重锚点改为 unique(model_key, base_url)：同地址同模型拒绝重复，不同上游同名模型天然合法，多上游互备（优先级/权重）能力保留
- Dify 智能体端点与密钥内聚到 ai_agents（kind=dify 自带 baseUrl + API Key），不再依赖渠道
- 接口变更：移除 /ai/admin/providers* 与渠道映射接口；新增 /ai/admin/models/:id/test 与 /probe-models；ai:provider:manage 权限码停用
- 前端：删除渠道管理页，模型管理页吸收端点表单（含测试/探测），智能体表单 dify 分支改为端点+密钥
- 测试 24/24 通过（含多上游同名模型允许、同端点去重 422、dify 缺凭据 422）
### 调整（AI 中心）
- 菜单更名「AI 管理」→「AI 中心」并加闪电图标（seed 兼容旧数据自动重命名）；五页 Card 内边距收紧（24→12）
### 新增（AI 管理模块 P0）
- 后端：8 张表（providers/models/model_channels/agents/conversations/messages/usage_logs/images）+ 适配器架构（openai-compatible/dify）+ 模型路由（优先级→权重随机→故障转移）+ AES-256-GCM 密钥加密
- 管理端接口：渠道 CRUD/连通测试/模型探测、模型 CRUD（model_key 唯一去重）+ 渠道映射、智能体 CRUD；权限码 ai:provider:manage / ai:model:manage / ai:agent:manage / ai:usage:view
- 使用端接口：AI 对话两段式流（POST 提交 + GET SSE 订阅，多会话、重放、部分收尾）、文生图；seed 幂等写入 AI 管理菜单与权限
- 前端：AI 管理菜单五页（渠道/模型/智能体/AI对话/生图），复用 AppTable/Permission/sse.ts，零新增依赖
- 占卜桥接：AiService.interpretStream 优先走管理端模型路由，未配置时回落环境变量直连（行为完全兼容）
- 测试：crypto 单测 4 项 + AI 管理端 e2e 5 项（含去重/越权/SSE 兑底），全量 23/23 通过
### 文档
- 新增 AI 管理模块产品文档（helloagents/plan/ai_module_prd.md）：渠道/模型/智能体/AI对话/生图五块，含市场参考与 P0-P2 阶段规划
- 新增 AI 管理模块技术设计（helloagents/plan/ai_module_design.md）：适配器架构、模型路由、七张表设计、占卜迁移兼容方案
### 修复（卜卦页二轮评审）
- 铜钱阴阳面遵循传统“背为阳、字为阴”：掷正（阳）落泉源背面，掷负（阴）落乾隆通宝字面（后端正=3 分不变）
- 铜钱重绘为写实乾隆通宝 SVG（金属渐变/双圈轮郭/方孔内影/楷书钱文/包浆），仅点击掷币时转一圈，不再自转或剧透下一爻
- 阴爻两段等长对称（各 70 单位，缺口对齐阳爻中线）
- 六爻明细可折叠：默认展开、开始解卦自动收起；动爻行红字高亮并附变卦说明
- 起卦失败增加可见错误面板与重试入口；未述事记录重试智能回退填主题页（needsTopic）
- revealing 阶段不再提前展示解卦 loading；空解卦时 loading 不再永转
- 返回系统链接移至左下角，与右上角“再占一卦”不再重叠
### 新增
- 卜卦页三幕式重构（祈愿/摇卦/成卦）：CSS 3D 铜钱动画、SVG 描边爻线、毛笔字卦名浮现与八卦 loading，零新增前端依赖
- 占卜后端新增 SSE 流式解卦接口 `GET /api/divinations/:id/interpretation/stream`，AI 增量文本实时推送并落库
- 新增卦名/变卦推算纯函数 `hexagram.util.ts`（64 卦查表）及单元测试
- 新增占卜历史列表、重新解读、删除接口（按当前用户过滤，预留 C 端复用）
- 新增基于 fetch 的零依赖 SSE 客户端（支持 Authorization 头）
- 新增宣纸纹理与水墨远山背景图（public/divination/）
- AI 解卦 prompt 增加本卦名/变卦名/动爻数上下文，要求先点明卦意再结合动爻论变
- 新增 SSE 禁缓冲响应头中间件（X-Accel-Buffering: no），规避 Nest 对 @Sse 路由拦截器时序问题，保障 nginx 代理下流式输出
### 变更
- 占卜交互改为“先摇卦后述事”：创建不带主题（casting），逐爻点击掷币（碗区居中放大，成卦后左移动画展开解卦区），PATCH topic 补填后进入流式解卦
### 变更
- 占卜创建接口改为异步解卦：生成六爻后立即返回，修复前端 axios 10s 超时导致的"假失败"问题
- divinations 表新增 status / hexagram_name / changed_hexagram_name / error_message 字段（DB_SYNC 自动同步）
- ResponseInterceptor 支持按路由跳过统一响应包装（SKIP_RESPONSE_WRAP_KEY，用于 SSE）
- 服务启动时自动将遗留"解卦中"记录标记为失败，支持重新解读
### 新增
- 新增家庭大事纪服务端接口，覆盖列表、详情、创建、更新、删除、核心标记和碑文汇总
- 移动端 `has-doc` 与 `has-web` 接入发布平台，新增 `mobile-has-doc`、`mobile-has-web` 构建服务与 `/has-doc/`、`/has-web/` Nginx 路由
- 新增家庭协作后端模块，覆盖家庭创建/加入、成员、待办、公告、概览与移动端用户设置接口
- 发布面板新增 Dockerfile，并接入根目录 `docker-compose.yml` 的 `deploy-panel` 服务
- 新增 `deploy-panel` 自动化发布面板文档，说明环境变量、发布目标、接口与安全约束
- 新增 `mobile/src/packages/has-web` C 端业务入口，包含登录注册、重置密码、首页、个人中心与接口对接骨架
- 新增移动端 H5 框架说明与 C 端对接说明
- 新增手机号/邮箱验证码登录注册、验证码重置密码与公共文件上传骨架
- 用户主表补充账号类型、注册来源与最近登录时间
- 新增用户登录标识、验证码与文件资源数据模型
- 个人中心返回值补充账号类型与登录来源信息
### 变更
- 移动端发布由单一 `mobile` 目标拆分为 `has-doc` 与 `has-web` 两个独立发布目标
- 发布文档补充首次新增应用/挂载/Nginx 路由需重建 Nginx，日常代码发布无需重启 Nginx 的规则
- 移动端公共组件、工具、常量、hooks、composables 与 locales 统一迁移到 `mobile/src/shared`，并通过 `@shared/*` 引入
- 移除前端、后端与移动端 Dockerfile 的 Docker Hub `docker/dockerfile` 前端依赖，避免弱网环境构建超时
- Auth profile 补充手机号与当前活跃家庭 ID，适配移动端家庭上下文
- Auth 密码登录支持使用手机号或邮箱账号，并兼容原用户名登录
- 前端发布不再重启 `nginx`，依赖 `frontend_dist` 共享卷更新静态资源
- 发布面板不再将 Docker Compose stderr 进度统一标记为 `[ERR]`，改按退出码输出成功或失败
- 发布脚本默认启用 Compose v2 compatibility 模式，减少旧版下划线容器命名迁移影响
- 发布面板项目挂载路径改为与宿主机真实路径一致，修正容器内无法读取 `HOST_PROJECT_PATH/docker-compose.yml` 的问题
- Docker Compose 移除过期 `version` 字段，并为可选外部 API 环境变量补默认空值以减少发布日志 warning
- 发布脚本新增 `HOST_PROJECT_PATH` 并固定 Compose project directory，避免容器内 `/workspace` 路径导致 Nginx 文件挂载失败
- 前端/后端单独发布改为无依赖重建，避免误启动 MySQL/Redis；发布脚本默认固定 Compose 项目名为 `admin`
- 发布脚本新增发布总耗时输出
- 优化前后端 Docker 构建缓存，前端改为镜像构建阶段产物构建并减少运行期重复安装
- 发布脚本增加统一预检查、失败步骤输出、可选构建缓存清理与 BuildKit 构建环境
- 发布面板每次发布前清空上一轮发布日志，仅展示本次发布记录
- 发布面板支持首次使用初始化模式，未配置 `PUBLISH_SECRET` 时仍可启动并在页面首次输入密钥
- 发布面板 Docker Compose 配置改为读取根目录环境变量，避免服务器缺少 `deploy-panel/.env` 导致启动失败
- 发布脚本改为兼容 `docker compose` 与 `docker-compose`
- Docker 镜像源切换为 DaoCloud 仓库
- Docker 构建镜像源固定为阿里云并补齐后端运行阶段编译依赖
- 日志管理菜单拆分为审计/打点/前端/错误日志入口
- 新增系统配置菜单并挂载字典管理
- 响应结构增加 traceId，前端表格统一组件与分页文案
- 全站表单必填提示文案统一为中文
- 日志端来源通过字典 source_type 显示
- 通知模板编辑升级为富文本（ReactQuill）并支持变量 Tag 点击插入
- 通知发布页改为按模板变量自动渲染输入项，避免手工维护 key/value
- 通知模块补齐短信/邮箱发送通道，新增 `MESSAGE_CHANNEL` 字典并接入模板/发布页
- 验证码发送接入邮件投递，验证码记录补齐发送状态与失败原因
- 短信验证码接入阿里云短信，默认使用模板 `SMS_337130257`
- 通知模板新增业务编码 `code`，前端编辑/删除改为优先使用业务码
- 管理后台主布局升级为固定 Header / 固定 Sider / 内容独立滚动
- 登录页、首页、用户/角色/权限/字典页接入统一后台视觉规范
- 六爻占卜页与日志页去除双层边框，优化 Header 与侧栏过渡手感
- 侧栏改为更慢的覆盖式展开，避免主内容区左右抖动
- 角色管理页移除长权限标签堆叠，新增独立角色功能权限配置页
- 角色功能权限页新增右侧模块导航浮窗，支持滚动定位与模块级全选
- 角色功能权限页新增“仅看已选权限”与模块折叠/展开能力
### 修复
- 修复用户修改昵称后家庭成员列表仍显示旧昵称的问题
- 修复 `/api/auth/profile` 未从邮箱登录标识回填 email 的问题
- 修复移动端更新资料时空头像地址被校验拦截的问题
- 修复创建/加入家庭时长账号名写入家庭成员昵称导致数据库字段超长的问题
- 发布面板镜像补充 `openssh-client` 并挂载宿主机 SSH 配置，修复 SSH 仓库 `git pull` 报 `cannot run ssh`
- 发布面板移除页面硬编码发布密钥，补齐服务端密钥必填校验、JSON 解析保护、运行状态接口与任务锁释放兜底
- 补充 NestJS TypeORM 与 sqlite3 依赖，修正 Throttler 配置
- 飞书通知通道改为真实 webhook 发送（环境变量 FEISHU_BOT_WEBHOOK）
### 新增
- 六爻占卜模块与 AI 解卦模块
- 日志中心与个人中心模块
- 首页入口与中文面包屑展示
- 日志中心打点/前端/错误日志与批量上报
- 字典管理与多语言枚举查询
- 通知管理模块（模板、发布记录、站内信与飞书通道）
- 站内信收件箱接口与页面（查询、单条已读、全部已读）
- 新增 `NotificationTriggerService` 供其他业务模块直接注入调用通知发送
- 新增前端视觉规范文档 `helloagents/wiki/frontend-visual.md`

## [0.1.0] - 2025-01-25

### 新增
- NestJS 后端 RBAC 模块、JWT 鉴权与审计日志
- React 管理后台与权限码控制
- Swagger 文档、Docker Compose 与 Nginx 配置
- 初始化数据与 Auth 基础测试
