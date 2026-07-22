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

- `PUBLISH_SECRET`：发布密钥，必填；缺失时服务拒绝启动
- `PORT`：发布面板端口，默认 `9090`
- `PROJECT_PATH`：部署脚本执行目录，默认 `deploy-panel` 上级目录

## 运行机制

1. 浏览器访问发布页面后输入发布密钥。
2. 页面通过 `X-Publish-Token` 请求服务端接口。
3. 服务端校验密钥，通过 `task.lock` 防止重复发布。
4. 服务端按发布目标调用对应 shell 脚本。
5. 脚本输出追加到 `logs/deploy-logs.txt`。
6. 页面轮询 `/logs` 与 `/status` 展示实时日志和运行状态。

## Docker 部署

根目录 `docker-compose.yml` 包含 `deploy-panel` 服务：

- 镜像构建上下文为 `./deploy-panel`
- 通过根目录 `.env` 或 shell 环境变量读取发布密钥
- 容器内项目路径为 `/workspace`
- 发布日志挂载到宿主机 `deploy-panel/logs`
- 通过 `/var/run/docker.sock` 控制宿主机 Docker
- 对外暴露端口 `9090`

启动命令：

```bash
docker compose up -d --build deploy-panel
```

注意：`deploy-panel/.env` 仅供直接执行 `node server.js` 使用；通过根目录 Compose 启动时，应在项目根目录 `.env` 中配置 `PUBLISH_SECRET`。

## 发布目标

- `backend`：拉取最新代码并重建 `backend`
- `frontend`：拉取最新代码并重建 `frontend`、`nginx`
- `all`：拉取最新代码并重建 `backend`、`frontend`、`nginx`

## 安全约束

- 禁止在页面、脚本或文档中写入真实发布密钥
- 发布入口建议仅暴露在内网或受控环境
- 发布面板容器挂载宿主机 Docker socket，具备较高权限
- 发布前需确认 `PROJECT_PATH` 指向正确项目目录
- 强制终止服务后如遗留 `task.lock`，需确认无发布任务运行后再删除
