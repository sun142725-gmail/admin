# RBAC 自动化发布面板

`deploy-panel` 提供一个本地 HTTP 发布入口，用于触发 Docker Compose 重新构建并启动前端、后端和 Nginx 服务。

## Docker 部署方式

项目里的 Node 环境可以全部放在 Docker 内部运行，发布面板也已接入根目录 `docker-compose.yml`。

1. 直接构建并启动发布面板：

```bash
docker compose up -d --build deploy-panel
```

如果服务器只有旧版 Compose，也可以使用：

```bash
docker-compose up -d --build deploy-panel
```

2. 浏览器访问发布面板：

```text
http://服务器IP:9090
```

首次访问后输入的发布密钥会初始化为服务端密钥，并持久化到 `deploy-panel/logs/publish-secret.txt`。后续访问需要输入同一个密钥。

也可以提前在项目根目录 `.env` 或 shell 环境变量中指定固定密钥：

```bash
PUBLISH_SECRET=replace-with-strong-secret
```

页面首次访问会提示输入发布密钥，并保存到浏览器 `localStorage`。如需更换密钥，清理浏览器本地存储后重新输入。

## 容器运行机制

`deploy-panel` 服务会把项目根目录挂载到容器内 `/workspace`，同时挂载宿主机 `/var/run/docker.sock`。发布脚本在 `/workspace` 中执行 `git pull` 和 Docker Compose 命令，因此可以从容器内控制宿主机 Docker 重建服务。

Compose 配置摘要：

```yaml
deploy-panel:
  build: ./deploy-panel
  environment:
    PUBLISH_SECRET: ${PUBLISH_SECRET:-}
    PORT: 9090
    PROJECT_PATH: /workspace
  ports:
    - "9090:9090"
  volumes:
    - ./:/workspace
    - ./deploy-panel/logs:/app/logs
    - ${HOME}/.ssh:/root/.ssh:ro
    - /var/run/docker.sock:/var/run/docker.sock
```

注意：`deploy-panel/.env` 只用于本地直接执行 `node server.js`。通过根目录 `docker-compose.yml` 启动时，Compose 默认读取根目录 `.env`，不会自动读取 `deploy-panel/.env`。

## 访问异常排查

如果容器创建成功但 `http://服务器IP:9090` 拒绝连接，优先检查容器是否已经退出：

```bash
docker ps -a | grep rbac-deploy-panel
docker logs rbac-deploy-panel
```

如果日志显示进入首次使用初始化模式，说明服务已正常启动，打开页面输入发布密钥即可。如果想提前固定密钥，在项目根目录 `.env` 中添加后重建：

```bash
docker-compose up -d --build deploy-panel
```

如果容器状态是 `Up` 但仍无法访问，检查端口监听与服务器防火墙：

```bash
docker port rbac-deploy-panel
ss -lntp | grep 9090
```

## Git SSH 拉取

如果项目远程仓库使用 SSH 地址，发布面板容器需要 SSH 客户端和密钥访问权限。镜像已内置 `openssh-client`，Compose 会把宿主机 `${HOME}/.ssh` 只读挂载到容器 `/root/.ssh`。

服务器上需要先确认宿主机本身可以执行：

```bash
git pull
```

如果宿主机首次连接 Git 服务器，先在宿主机完成 `known_hosts` 确认，再重建发布面板容器：

```bash
docker-compose up -d --build deploy-panel
```

## 本地 Node 启动方式

如需不通过 Docker 直接运行，可复制 `deploy-panel/.env.example` 为 `deploy-panel/.env` 后修改：

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

## 发布速度与缓存

- 默认保留 Docker 构建缓存，用于提升后续发布速度
- 前端静态资源在镜像构建阶段完成，容器启动时只复制 `dist` 到 `frontend_dist` 卷
- 后端和前端依赖安装使用 `npm ci`，并通过 BuildKit npm 缓存减少重复下载
- 发布脚本默认启用 `DOCKER_BUILDKIT=1` 与 `COMPOSE_DOCKER_CLI_BUILD=1`

只有在依赖异常、Dockerfile 变更后缓存疑似污染，或磁盘空间紧张时，才建议清理构建缓存：

```bash
DEPLOY_CLEAN_CACHE=1 ./deploy-panel/scripts/deploy-frontend.sh
```

发布面板容器内也支持同名环境变量。设置 `DEPLOY_CLEAN_CACHE=1` 后，本次发布会先执行 `docker builder prune -f`，然后再重建服务。

## 接口

- `POST /deploy`：触发发布任务，请求头必须包含 `X-Publish-Token`
- `GET /logs`：获取最后 300 行部署日志
- `GET /status`：查询当前是否存在运行中的发布任务

同一时间只允许一个发布任务执行，运行中重复触发会返回 `409`。

## 安全注意事项

- 可配置 `PUBLISH_SECRET` 固定发布密钥；未配置时会进入首次使用初始化模式
- 不要把真实发布密钥写入 `publish.html`、脚本或仓库文档
- 建议只在内网或受控跳板机上开放该服务
- 部署脚本会执行 `git pull` 与 `docker compose up -d --build`，请确认 `PROJECT_PATH` 指向正确仓库
- 发布面板容器挂载了宿主机 Docker socket，具备较高权限，不建议直接暴露到公网

## 日志与锁

- 日志文件：`logs/deploy-logs.txt`
- 任务锁文件：`task.lock`
- 每次发布开始前会清空上一轮发布日志，页面只展示本次发布记录

如果服务进程被强制终止，可能遗留 `task.lock`。确认没有部署任务运行后，可以手动删除该文件。
