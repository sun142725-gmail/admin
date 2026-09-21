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
    ├── 01-sync-ai.sh          # 步骤 1：引导同步「六爻解卦」智能体（幂等，首次部署用）
    ├── 02-generate-ai-sql.sh  # 步骤 2：拉取开发库 AI 配置，生成线上 INSERT SQL（日常更新用）
    └── 03-smoke-test.sh       # 步骤 3：上线冒烟验证
```

## 上线准备事项（Checklist）

- [ ] 服务器具备 Node.js 20（宿主机执行脚本用）+ Docker Compose
- [ ] 复制 `env.production.example` 为 `deploy/.env.production`，填入真实值（含 `SOURCE_DB_*` 开发库连接，供步骤 2 生成 SQL 用）
- [ ] **`AI_ENCRYPTION_KEY` 已设置**（加密 AI API Key 用，上线后不可更换，否则已存密钥全部失效）
- [ ] 生产数据库已创建（表结构由应用首启自动建立，无需手工迁移）
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

- **作用**：拉取**开发库**的全部模型与智能体，生成线上可执行的 `INSERT IGNORE` SQL（输出到 `deploy/generated/`）。线上已存在的行自动跳过（模型按 `model_key+base_url` 判重、智能体按 `code` 判重），**线上自行添加的数据不受影响**；API Key 已用线上密钥重加密；智能体绑定的模型通过 `model_key+base_url` 关联回填，不依赖自增 id
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
bash deploy/scripts/02-smoke-test.sh
```

- **预期输出**：三项检查全部 PASS

### 步骤 3：人工核对（管理后台）

1. 「AI 中心 → 智能体管理」：开发库的全部智能体均已同步（数量一致），`divination` 智能体已绑定模型
2. 「AI 中心 → 模型管理」：全部模型行已同步、测试连通通过
3. 占卜一次：解卦为《周易》经文四段式风格、文末带提示语

## 注意事项

1. **环境变量优先级**：shell 已导出的变量 > `deploy/.env.production` > `backend/.env`（dotenv 不覆盖已存在变量）。仓库虽跟踪 `backend/.env`，但生产以 `deploy/.env.production` 为准
2. **docker-compose.yml** 已从宿主机环境透传 `AI_ENCRYPTION_KEY` / `DEEPSEEK_API_KEY` 等变量，确保容器内加解密与脚本一致
3. `DB_SYNC=true` 首启建表后如担心误改表结构，可在后续启动改为 `false`（改表需另行评估）
4. 回滚：镜像回退旧版本即可；同步脚本不删数据，重复执行无副作用
