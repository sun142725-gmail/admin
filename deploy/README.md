# 上线准备（Deploy Checklist）

本目录集中管理上线准备事项与脚本。**脚本按编号顺序执行**，全部幂等（可重复执行）。

## 目录结构

```
deploy/
├── README.md              # 本文档：准备事项 + 执行顺序
├── env.production.example # 生产环境变量模板（复制为 .env.production 后填真实值）
├── .env.production        # 真实生产环境变量（不入库，已 gitignore）
├── generated/             # 生成的发布 SQL（gitignore，不入库）
└── scripts/
    ├── 01-sync-ai.sh           # 步骤 1：引导同步「六爻解卦」智能体（幂等，首次部署用）
    ├── 02-generate-ai-sql.sh   # 步骤 2：拉取开发库全部模型/智能体，生成线上 INSERT SQL（日常更新用）
    ├── 03-smoke-test.sh        # 步骤 3：上线冒烟验证
    └── 04-sync-stock-agents.sh # 步骤 4：同步「股市圆桌」六位智能体（幂等，也可由步骤 2 覆盖）
```

## 上线准备事项（Checklist）

- [ ] 服务器具备 Node.js 20（宿主机执行脚本用）+ Docker Compose
- [ ] 复制 `env.production.example` 为 `deploy/.env.production`，填入真实值（含 `SOURCE_DB_*` 开发库连接，供步骤 2 生成 SQL 用）
- [ ] **`AI_ENCRYPTION_KEY` 已设置**（加密 AI API Key 用，上线后不可更换，否则已存密钥全部失效）
- [ ] 生产数据库已创建（表结构由应用首启自动建立，无需手工迁移；本次新增 `stock_roundtables` / `stock_roundtable_turns` 两张表随首启自动创建）
- [ ] 「股市圆桌」上线项（详见步骤 4）：6 位圆桌智能体 + `gpt-6.1-sol` 模型行需同步；权限 `stock:roundtable:use` 与菜单随 `SEED=true` 首启自动初始化（幂等，挂在「AI 中心」菜单下）
- [ ] （可选）消息面联网检索：配置 `BOCHA_API_KEY`（博查，国内直连）或 `TAVILY_API_KEY`（Tavily，海外）；不配置则自动降级为"公告 + 同花顺 F10 + 模型知识注入"，主流程不受影响
- [ ] JWT 两把密钥已换成生产专用随机值
- [ ] `docker compose up -d` 后 `docker compose logs backend` 无报错（首启自动建表 + seed 权限菜单）

## 脚本执行顺序

### 步骤 1：引导同步智能体（`01-sync-ai.sh`）——首次部署用

- **作用**：保证线上至少存在可用的「六爻解卦」智能体（`code=divination`）：按脚本内置提示词 upsert，配了 `DEEPSEEK_API_KEY` 时顺带确保模型行并绑定
- **幂等**：是，可重复执行；**日常发版可跳过**（用步骤 2 全量发布）
- **执行**：

```bash
bash deploy/scripts/01-sync-ai.sh
```

- **预期输出**：末尾出现 `✅ 同步完成`，且智能体行显示 `code=divination，modelId=<数字>`
- **失败排查**：缺 `DB_*` / `AI_ENCRYPTION_KEY` 环境变量 → 检查 `deploy/.env.production`；表不存在 → 说明后端首启没跑成，先看 backend 日志

### 步骤 2：生成发布 SQL 并在线上执行（`02-generate-ai-sql.sh`）——日常更新用

- **作用**：拉取**开发库**的全部模型与智能体（含六位 `stock-*` 圆桌智能体与 `gpt-6.1-sol` 模型行），生成线上可执行的 `INSERT IGNORE` SQL（输出到 `deploy/generated/`）。线上已存在的行自动跳过（模型按 `model_key+base_url` 判重、智能体按 `code` 判重），**线上自行添加的数据不受影响**；API Key 已用线上密钥重加密；智能体绑定的模型通过 `model_key+base_url` 关联回填，不依赖自增 id
- **在开发机执行**，前置（`deploy/.env.production`）：
  - `SOURCE_DB_*` + `SOURCE_DB_PORT`：开发库连接（**必填**，脚本强制显式指定，防止误用线上库当数据源）
  - `SOURCE_AI_ENCRYPTION_KEY`：开发库 AI 加密密钥（解密源密文）
  - `AI_ENCRYPTION_KEY`：线上加密密钥（重加密输出）
- **执行**：

```bash
bash deploy/scripts/02-generate-ai-sql.sh
```

- **预期输出**：`✅ SQL 已生成：../deploy/generated/ai-publish-<时间戳>.sql`
- **上线执行**（二选一）：
  ```bash
  # 命令行（在能连线上库的机器）
  mysql -h <线上主机> -u <用户> -p <数据库名> < deploy/generated/ai-publish-xxx.sql
  ```
  或用 Navicat/DBeaver 等工具打开 SQL 文件核对后执行
- **重复执行安全**：SQL 为 INSERT IGNORE，重跑只跳过已存在行
- **失败排查**：提示缺 `SOURCE_DB_*`/`TARGET_AI_ENCRYPTION_KEY` → 补全 `deploy/.env.production`；"解密失败"告警 → `SOURCE_AI_ENCRYPTION_KEY` 与开发库实际密钥不一致

### 步骤 3：冒烟验证（`03-smoke-test.sh`）

- **作用**：验证后端进程存活、登录接口正常（证明 应用+DB 链路通）、（可选）前端页面可达
- **执行**：

```bash
bash deploy/scripts/03-smoke-test.sh
```

- **预期输出**：三项检查全部 PASS

### 步骤 4：同步「股市圆桌」智能体（`04-sync-stock-agents.sh`）——本次新增

- **作用**：幂等 upsert 六位圆桌智能体（`stock-trend / stock-momentum / stock-flow / stock-value / stock-risk / stock-moderator`，提示词与 `backend/src/modules/stock/experts.definitions.ts` 同源），并把它们绑定到指定模型行
- **两种导数据方式（二选一）**：
  - **方式 A（推荐，日常发版）**：直接执行**步骤 2** 的全量 SQL——生成脚本导出开发库**全部**模型与智能体，已自动包含 6 位圆桌智能体与 `gpt-6.1-sol` 模型行（按 `code` 判重 INSERT IGNORE + 按 `model_key+base_url` 回填绑定，密钥自动按线上 `AI_ENCRYPTION_KEY` 重加密）。执行完 SQL 即可跳过本步骤
  - **方式 B（发布面板一键，推荐）**：`deploy-panel` 新增「同步圆桌智能体」按钮（git pull + 在 mysql 容器内执行 `deploy/scripts/stock-agents.sql`，幂等）。SQL 由开发机 `cd backend && npm run sync:stock:gen` 生成并随仓库提交，线上模型不同时改 SQL 文末两个字面量
  - **方式 C（服务器直跑脚本）**：通过 `SYNC_STOCK_MODEL_ID` 指定绑定的模型行 id（模型行需已存在——可在「AI 中心 → 模型管理」手工添加，或由步骤 2 的 SQL 先行导入）：

  ```bash
  # 假设线上 gpt-6.1-sol 模型行 id 为 9
  SYNC_STOCK_MODEL_ID=9 bash deploy/scripts/04-sync-stock-agents.sh
  # 不带 SYNC_STOCK_MODEL_ID 时走环境变量流程（SYNC_MODEL_API_KEY/DEEPSEEK_API_KEY），
  # 智能体不绑定模型，运行时自动按"任意可用 chat 渠道"路由
  ```
- **幂等**：是，提示词更新后重跑即可同步；不删除线上数据
- **不依赖智能体也可用**：六位智能体未同步时，圆桌自动回落代码内置人设，功能不受影响（仅无法在界面调整提示词）
- **预期输出**：六行 `[智能体] 同步完成：股市圆桌·XX（id=…，modelId=…）` + `✅ 同步完成`

### 步骤 5：人工核对（管理后台）

1. 「AI 中心 → 智能体管理」：开发库的全部智能体均已同步（数量一致），`divination` 智能体已绑定模型；本次应新增 6 个 `股市圆桌·*` 智能体且均已绑定 `gpt-6.1-sol`
2. 「AI 中心 → 模型管理」：全部模型行已同步、测试连通通过（`gpt-6.1-sol` 点「测试」应返回成功；注意 model_key 必须是 `gpt-6.1-sol`——中转站按模型名路由，粘贴时小心特殊连字符）
3. 占卜一次：解卦为《周易》经文四段式风格、文末带提示语
4. 「AI 中心 → 股市圆桌」：菜单可见（admin 已自动绑定 `stock:roundtable:use`）；发起一场"快速"会议：五位专家并行发言 → 主席纪要生成，纪要头部显示"生成模型：GPT-6.1 Sol"（若显示橙色"规则引擎补位"警示，检查模型渠道连通性）；「会议记录 → 回放」可查看讨论过程与纪要

## 注意事项

1. **环境变量优先级**：shell 已导出的变量 > `deploy/.env.production` > `backend/.env`（dotenv 不覆盖已存在变量）。仓库虽跟踪 `backend/.env`，但生产以 `deploy/.env.production` 为准
2. **docker-compose.yml** 已从宿主机环境透传 `AI_ENCRYPTION_KEY` / `DEEPSEEK_API_KEY` 等变量，确保容器内加解密与脚本一致
3. `DB_SYNC=true` 首启建表后如担心误改表结构，可在后续启动改为 `false`（改表需另行评估）
4. 回滚：镜像回退旧版本即可；同步脚本不删数据，重复执行无副作用
5. **本次更新（股市圆桌）涉及**：后端新增 `stock` 模块与两张表（首启自动建）；前端新增 `/stock` 页面并引入 `echarts` 依赖——**前后端镜像都需重建**（`docker compose up -d --build backend frontend`）
6. **搜索执行器（可选）**：`BOCHA_API_KEY` / `TAVILY_API_KEY` 未配置时，消息面调研自动降级为模型知识注入（会议照常），配置后无需重启以外的操作
7. **坏渠道处理**：若线上存在不可用的模型行（如失效的中转/过期 Key），建议在「模型管理」停用，避免圆桌路由到坏渠道产生 404/401 重试
