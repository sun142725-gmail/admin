# 上线准备（Deploy Checklist）

本目录集中管理上线准备事项与脚本。**脚本按编号顺序执行**，全部幂等（可重复执行）。

## 目录结构

```
deploy/
├── README.md              # 本文档：准备事项 + 执行顺序
├── env.production.example # 生产环境变量模板（复制为 .env.production 后填真实值）
├── .env.production        # 真实生产环境变量（不入库，已 gitignore）
└── scripts/
    ├── 01-sync-ai.sh      # 步骤 1：同步「六爻解卦」智能体（幂等）
    └── 02-smoke-test.sh   # 步骤 2：上线冒烟验证
```

## 上线准备事项（Checklist）

- [ ] 服务器具备 Node.js 20（宿主机执行脚本用）+ Docker Compose
- [ ] 复制 `env.production.example` 为 `deploy/.env.production`，填入真实值
- [ ] **`AI_ENCRYPTION_KEY` 已设置**（加密 AI API Key 用，上线后不可更换，否则已存密钥全部失效）
- [ ] 生产数据库已创建（表结构由应用首启自动建立，无需手工迁移）
- [ ] JWT 两把密钥已换成生产专用随机值
- [ ] `docker compose up -d` 后 `docker compose logs backend` 无报错（首启自动建表 + seed 权限菜单）

## 脚本执行顺序

### 步骤 1：同步 AI 智能体（`01-sync-ai.sh`）

- **作用**：按 `code=divination` upsert「六爻解卦」智能体（提示词/采样参数以脚本内置为准）；若配置了模型 API Key，同时确保 `deepseek-chat` 模型行存在并自动绑定
- **幂等**：是，可重复执行
- **执行**：

```bash
bash deploy/scripts/01-sync-ai.sh
```

- **预期输出**：末尾出现 `✅ 同步完成`，且智能体行显示 `code=divination，modelId=<数字>`
- **失败排查**：缺 `DB_*` / `AI_ENCRYPTION_KEY` 环境变量 → 检查 `deploy/.env.production`；表不存在 → 说明后端首启没跑成，先看 backend 日志

### 步骤 2：冒烟验证（`02-smoke-test.sh`）

- **作用**：验证后端进程存活、登录接口正常（证明 应用+DB 链路通）、（可选）前端页面可达
- **执行**：

```bash
bash deploy/scripts/02-smoke-test.sh
```

- **预期输出**：三项检查全部 PASS

### 步骤 3：人工核对（管理后台）

1. 「AI 中心 → 智能体管理」：存在编码为 `divination` 的启用智能体，且已绑定模型
2. 「AI 中心 → 模型管理」：模型行启用、测试连通通过
3. 占卜一次：解卦为《周易》经文四段式风格、文末带提示语

## 注意事项

1. **环境变量优先级**：shell 已导出的变量 > `deploy/.env.production` > `backend/.env`（dotenv 不覆盖已存在变量）。仓库虽跟踪 `backend/.env`，但生产以 `deploy/.env.production` 为准
2. **docker-compose.yml** 已从宿主机环境透传 `AI_ENCRYPTION_KEY` / `DEEPSEEK_API_KEY` 等变量，确保容器内加解密与脚本一致
3. `DB_SYNC=true` 首启建表后如担心误改表结构，可在后续启动改为 `false`（改表需另行评估）
4. 回滚：镜像回退旧版本即可；同步脚本不删数据，重复执行无副作用
