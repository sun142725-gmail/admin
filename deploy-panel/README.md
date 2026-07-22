# RBAC 自动化发布面板

`deploy-panel` 提供一个本地 HTTP 发布入口，用于触发 Docker Compose 重新构建并启动前端、后端和 Nginx 服务。

## Docker 部署方式

项目里的 Node 环境可以全部放在 Docker 内部运行，发布面板也已接入根目录 `docker-compose.yml`。

1. 在项目根目录准备环境变量：

```bash
PUBLISH_SECRET=replace-with-strong-secret
```

2. 构建并启动发布面板：

```bash
docker compose up -d --build deploy-panel
```

如果服务器只有旧版 Compose，也可以使用：

```bash
docker-compose up -d --build deploy-panel
```

3. 浏览器访问发布面板：

```text
http://服务器IP:9090
```

页面首次访问会提示输入发布密钥，并保存到浏览器 `localStorage`。如需更换密钥，清理浏览器本地存储后重新输入。

## 容器运行机制

`deploy-panel` 服务会把项目根目录挂载到容器内 `/workspace`，同时挂载宿主机 `/var/run/docker.sock`。发布脚本在 `/workspace` 中执行 `git pull` 和 Docker Compose 命令，因此可以从容器内控制宿主机 Docker 重建服务。

Compose 配置摘要：

```yaml
deploy-panel:
  build: ./deploy-panel
  environment:
    PUBLISH_SECRET: ${PUBLISH_SECRET}
    PORT: 9090
    PROJECT_PATH: /workspace
  ports:
    - "9090:9090"
  volumes:
    - ./:/workspace
    - ./deploy-panel/logs:/app/logs
    - /var/run/docker.sock:/var/run/docker.sock
```

## 本地 Node 启动方式

如需不通过 Docker 直接运行，可复制 `.env.example` 为 `.env` 后修改：

```bash
PUBLISH_SECRET=replace-with-strong-secret
PORT=9090
PROJECT_PATH=/path/to/rbac
```

然后执行：

```bash
cd deploy-panel
node server.js
```

## 发布目标

- `backend`：执行 `scripts/deploy-backend.sh`，拉取最新代码并重建 `backend`
- `frontend`：执行 `scripts/deploy-frontend.sh`，拉取最新代码并重建 `frontend` 与 `nginx`
- `all`：执行 `scripts/deploy-all.sh`，拉取最新代码并重建 `backend`、`frontend` 与 `nginx`

## 接口

- `POST /deploy`：触发发布任务，请求头必须包含 `X-Publish-Token`
- `GET /logs`：获取最后 300 行部署日志
- `GET /status`：查询当前是否存在运行中的发布任务

同一时间只允许一个发布任务执行，运行中重复触发会返回 `409`。

## 安全注意事项

- 必须配置 `PUBLISH_SECRET`，未配置时服务会拒绝启动
- 不要把真实发布密钥写入 `publish.html`、脚本或仓库文档
- 建议只在内网或受控跳板机上开放该服务
- 部署脚本会执行 `git pull` 与 `docker compose up -d --build`，请确认 `PROJECT_PATH` 指向正确仓库
- 发布面板容器挂载了宿主机 Docker socket，具备较高权限，不建议直接暴露到公网

## 日志与锁

- 日志文件：`logs/deploy-logs.txt`
- 任务锁文件：`task.lock`

如果服务进程被强制终止，可能遗留 `task.lock`。确认没有部署任务运行后，可以手动删除该文件。
