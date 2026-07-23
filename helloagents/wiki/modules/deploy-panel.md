# deploy-panel 模块

## 模块定位

`deploy-panel` 是 RBAC 项目的轻量自动化发布面板，提供浏览器页面触发 Docker Compose 部署脚本的能力，适用于受控内网或跳板机环境。

## 目录结构

- `deploy-panel/server.js`：Node HTTP 服务，负责鉴权、任务锁、日志读取与脚本调度
- `deploy-panel/Dockerfile`：发布面板容器镜像定义
- `deploy-panel/.env.example`：环境变量示例
- `deploy-panel/publish.html`：发布操作页面，支持选择发布目标、刷新日志与查看执行状态
- `deploy-panel/scripts/deploy-backend.sh`：后端发布脚本
- `deploy-panel/scripts/deploy-frontend.sh`：前端与 Nginx 发布脚本
- `deploy-panel/scripts/deploy-all.sh`：全量发布脚本
- `deploy-panel/scripts/common.sh`：Docker Compose 命令兼容封装
- `deploy-panel/logs/deploy-logs.txt`：发布日志文件
- `deploy-panel/task.lock`：发布任务锁文件

## 环境变量

- `PUBLISH_SECRET`：发布密钥；缺失时进入首次使用初始化模式
- `PORT`：发布面板端口，默认 `9090`
- `PROJECT_PATH`：部署脚本执行目录，默认 `deploy-panel` 上级目录

## 运行机制

1. 浏览器访问发布页面后输入发布密钥。
2. 页面通过 `X-Publish-Token` 请求服务端接口。
3. 服务端校验密钥，通过 `task.lock` 防止重复发布。
4. 服务端按发布目标调用对应 shell 脚本。
5. 服务端清空上一轮发布日志，脚本输出追加到 `logs/deploy-logs.txt`。
6. 页面轮询 `/logs` 与 `/status` 展示实时日志和运行状态。

## Docker 部署

根目录 `docker-compose.yml` 包含 `deploy-panel` 服务：

- 镜像构建上下文为 `./deploy-panel`
- 可通过根目录 `.env` 或 shell 环境变量预设发布密钥；缺失时页面首次输入的密钥会持久化为服务端密钥
- 容器内项目路径为 `/workspace`
- 发布日志挂载到宿主机 `deploy-panel/logs`
- 宿主机 `${HOME}/.ssh` 只读挂载到容器 `/root/.ssh`，支持 SSH 方式 `git pull`
- 通过 `/var/run/docker.sock` 控制宿主机 Docker
- 对外暴露端口 `9090`

启动命令：

```bash
docker compose up -d --build deploy-panel
```

注意：`deploy-panel/.env` 仅供直接执行 `node server.js` 使用；通过根目录 Compose 启动时，可在项目根目录 `.env` 中配置 `PUBLISH_SECRET`，也可首次打开页面完成初始化。

## 发布目标

- `backend`：拉取最新代码并重建 `backend`
- `frontend`：拉取最新代码并重建 `frontend`、`nginx`
- `all`：拉取最新代码并重建 `backend`、`frontend`、`nginx`

## 构建优化

- 默认保留 Docker 构建缓存，减少依赖重复下载
- 后端与前端 Dockerfile 使用 BuildKit npm 缓存挂载
- 前端改为镜像构建阶段执行 `npm ci` 与 `npm run build`，容器启动阶段仅复制 `dist` 到共享卷
- 发布脚本统一启用 `DOCKER_BUILDKIT=1` 与 `COMPOSE_DOCKER_CLI_BUILD=1`
- `DEPLOY_CLEAN_CACHE=1` 时执行 `docker builder prune -f`，用于缓存污染或磁盘紧张时的手动清理

## 错误处理

- 发布脚本执行环境预检查 `git`、`docker` 与 Docker Compose
- `git pull` 使用 `--ff-only`，避免发布过程中产生合并提交
- 脚本失败时输出失败步骤、失败命令与退出码
- 服务端通过 `task.lock` 防止重复发布，并在进程关闭后释放锁

## 安全约束

- 禁止在页面、脚本或文档中写入真实发布密钥
- 发布入口建议仅暴露在内网或受控环境
- 发布面板容器挂载宿主机 Docker socket，具备较高权限
- 首次使用初始化模式下，必须确保服务只暴露在可信网络内，避免他人抢先设置发布密钥
- 发布前需确认 `PROJECT_PATH` 指向正确项目目录
- 强制终止服务后如遗留 `task.lock`，需确认无发布任务运行后再删除
