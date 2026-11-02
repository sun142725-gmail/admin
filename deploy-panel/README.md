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

注意端口绑定方式：面板容器在 compose 中仅绑定宿主机 `127.0.0.1:9090`（面板持有 docker.sock 与 SSH 私钥，不直接暴露公网网卡）。因此 :9090 只能在服务器本机或经 SSH 隧道访问：

```bash
ssh -p <SSH端口> -N -L 9090:127.0.0.1:9090 <用户名>@<服务器IP>   # 本机执行，保持窗口开启
```

对外常规入口是 **nginx 代理端口 :9091**（`nginx/nginx.conf` 的 `deploy-panel` server 块，compose 内按服务名 `deploy-panel:9090` 转发，需在 compose/安全组放行 9091）：浏览器访问 `http://服务器IP:9091`。如需限制来源 IP，取消该 server 块中 `allow/deny` 注释并填入自己的出口 IP。

发布密钥采用 fail-closed 模式：必须先在项目根目录 `.env`（或 shell 环境变量）配置 `PUBLISH_SECRET`，Compose 以 `:?required` 语法强制注入（`docker-compose.yml`），未配置时容器直接拒绝启动；运行期若密钥为空，服务端对所有业务请求返回 `503`，不存在「首次访问初始化密钥」的行为。`deploy-panel/logs/publish-secret.txt` 仅作为兼容旧版本遗留密钥文件的回退来源，优先级低于环境变量。

页面首次访问会提示输入发布密钥，并保存到浏览器 `localStorage`。如需更换密钥，清理浏览器本地存储后重新输入。

## 发布目标

| 目标 | 脚本 | 作用 |
|---|---|---|
| backend / frontend / has-doc / has-web | `deploy-*.sh` | git pull + 重建对应服务 |
| core | `deploy-core.sh` | git pull + 仅重建 Go 服务 core（`--no-deps --build`，不启动 mysql；首次接入需先执行过 `docker compose up -d --build core`） |
| all | `deploy-all.sh` | git pull + 重建全部应用（含 core）与 nginx |
| **stock-agents** | `sync-stock-agents.sh` | git pull 后在 mysql 容器内执行 `deploy/scripts/stock-agents.sql`，幂等同步六位「股市圆桌」智能体并按 `model_key+base_url` 绑定模型（不重建应用） |

SQL 生成方式（开发机，提示词变更后）：`cd backend && npm run sync:stock:gen`，产物 `deploy/scripts/stock-agents.sql` 随仓库提交。线上模型名不同时，直接修改该 SQL 文末 UPDATE 中的两个字面量。

## 如何新增发布目标脚本

发布目标脚本统一放在 `deploy-panel/scripts/` 目录。新增一个可在面板下拉框选择的发布目标，需要同步改三处：

1. **脚本本体**：在 `deploy-panel/scripts/` 新建 `deploy-<目标名>.sh`，参照 `deploy-core.sh` 的写法（git pull + `docker compose up -d --build --no-deps <服务名>`，避免连带启动 mysql 等基础容器）；
2. **服务端注册**：在 `server.js` 顶部 `SCRIPT_MAP` 加入 `目标名: path.join(__dirname, 'scripts/deploy-<目标名>.sh')`，未注册的 target 会被服务端拒绝；
3. **前端下拉框**：在 `publish.html` 的 `<select id="target">` 加一个 `<option value="目标名">仅 XX 目标名</option>`。

最后在本文档「发布目标」表格补一行说明。脚本随 git 提交即可，线上面板容器内执行的是挂载仓库的最新文件，无需重建面板镜像。

注意与「线上脚本」（数据库 SQL 变更，白名单目录 `deploy-panel/scripts/online/`，见下文「线上脚本」章节）区分：重建应用的发布脚本放 `scripts/`，SQL 变更脚本放 `scripts/online/`，两个目录不要混用。

## 容器运行机制

`deploy-panel` 服务会把项目根目录挂载到容器内与宿主机一致的绝对路径，默认是 `/home/sun142725/admin`，同时挂载宿主机 `/var/run/docker.sock`。发布脚本在该路径中执行 `git pull` 与 Docker Compose，因此可以从容器内控制宿主机 Docker 重建服务并正确解析 bind mount。

Compose 配置摘要：

```yaml
deploy-panel:
  build: ./deploy-panel
  container_name: rbac-deploy-panel
  environment:
    # fail-closed：密钥必须注入，面板不再提供“先到先得”的初始化抢占
    PUBLISH_SECRET: ${PUBLISH_SECRET:?请在根目录 .env 配置强随机 PUBLISH_SECRET}
    PORT: 9090
    PROJECT_PATH: ${HOST_PROJECT_PATH:-/home/sun142725/admin}
    HOST_PROJECT_PATH: ${HOST_PROJECT_PATH:-/home/sun142725/admin}
    COMPOSE_PROJECT_NAME: admin
    COMPOSE_COMPATIBILITY: "1"
  ports:
    # 仅回环绑定：部署面板拥有 docker.sock 与 SSH 私钥，绝不能暴露到外网网卡
    - "127.0.0.1:9090:9090"
  volumes:
    - ./:${HOST_PROJECT_PATH:-/home/sun142725/admin}
    - ./deploy-panel/logs:/app/logs
    - ${HOME}/.ssh:/root/.ssh:ro
    - /var/run/docker.sock:/var/run/docker.sock
```

注意：`deploy-panel/.env` 只用于本地直接执行 `node server.js`。通过根目录 `docker-compose.yml` 启动时，Compose 默认读取根目录 `.env`，不会自动读取 `deploy-panel/.env`。

`HOST_PROJECT_PATH` 默认是 `/home/sun142725/admin`。如果服务器项目不在这个路径，需要在根目录 `.env` 中覆盖：

```bash
HOST_PROJECT_PATH=/你的/服务器/项目目录
```

## 访问异常排查

如果容器创建成功但 `http://服务器IP:9090` 拒绝连接，优先检查容器是否已经退出：

```bash
docker ps -a | grep rbac-deploy-panel
docker logs rbac-deploy-panel
```

如果日志显示未配置 `PUBLISH_SECRET` 的告警，说明服务已启动但处于 fail-closed 状态：所有业务请求会返回 `503`。需在项目根目录 `.env` 中配置密钥后重建：

```bash
docker-compose up -d --build deploy-panel
```

如果容器状态是 `Up` 但仍无法访问，检查端口监听与服务器防火墙：

```bash
docker port rbac-deploy-panel
ss -lntp | grep 9090
```

如果发布时报 Nginx 配置挂载错误，检查宿主机真实路径：

```bash
ls -l /home/sun142725/admin/nginx/nginx.conf
docker compose exec deploy-panel env | grep HOST_PROJECT_PATH
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

- `backend`：执行 `scripts/deploy-backend.sh`，拉取最新代码并只重建 `backend`，不启动 `mysql`、`redis`
- `frontend`：执行 `scripts/deploy-frontend.sh`，拉取最新代码并只重建 `frontend`；`nginx` 使用共享卷读取静态资源，无需重启
- `has-doc`：执行 `scripts/deploy-has-doc.sh`，拉取最新代码并只构建 `has-doc`；`nginx` 使用共享卷读取静态资源，无需重启
- `has-web`：执行 `scripts/deploy-has-web.sh`，拉取最新代码并只构建 `has-web`；`nginx` 使用共享卷读取静态资源，无需重启
- `core`：执行 `scripts/deploy-core.sh`，拉取最新代码并以 `--no-deps --build` 只重建 Go 服务 `core`（不启动 mysql；首次接入需先执行过 `docker compose up -d --build core`）
- `all`：执行 `scripts/deploy-all.sh`，拉取最新代码并重建 `core`、`backend`、`frontend`、`has-doc`、`has-web` 与 `nginx`
- `stock-agents`：执行 `scripts/sync-stock-agents.sh`，拉取最新代码后在 mysql 容器内幂等同步「股市圆桌」智能体（不重建应用）

移动端访问路径：

- `/has-doc/`：HAS 组件文档应用
- `/has-web/`：HAS C 端业务应用

## 首次接入与日常发布

首次新增应用、Compose 服务、volume 挂载或 Nginx 路由时，需要重建相关基础服务一次。例如本次首次接入 `has-doc` / `has-web` 时，需要执行：

```bash
docker compose up -d --build mobile-has-doc mobile-has-web nginx
```

首次接入 Go 服务 `core` 时同理（`deploy-core.sh` 使用 `--no-deps`，不会连带创建 mysql 等基础容器）：

```bash
docker compose up -d --build core
```

也可以执行全量重建：

```bash
docker compose up -d --build
```

完成首次接入后，日常代码发布不需要重启 Nginx：

- 只改 `has-doc`：发布面板选择 `仅移动端 has-doc`
- 只改 `has-web`：发布面板选择 `仅移动端 has-web`
- 只改管理后台：发布面板选择 `仅前端 frontend`
- 只改后端：发布面板选择 `仅后端 backend`

简单判断：新增服务、挂载或 Nginx 路由时重建 Nginx 一次；普通代码更新只发布对应应用。

发布面板容器固定设置 `COMPOSE_PROJECT_NAME=admin`，避免容器内 `/workspace` 路径或宿主机环境变量导致 Compose 创建 `workspace-*` 新容器。
同时启用 `COMPOSE_COMPATIBILITY=1`，尽量沿用旧版 Compose 的 `admin_nginx_1` 这类下划线容器命名。

## 发布速度与缓存

- 默认保留 Docker 构建缓存，用于提升后续发布速度
- 前端静态资源在镜像构建阶段完成，容器启动时只复制 `dist` 到 `frontend_dist` 卷
- 后端、前端和移动端依赖安装使用 `npm ci`，移动端 `has-doc` / `has-web` 分服务构建，依赖层会随 `package-lock.json` 缓存
- 发布脚本默认启用 `DOCKER_BUILDKIT=1` 与 `COMPOSE_DOCKER_CLI_BUILD=1`
- 发布完成后会输出本次发布总耗时
- Docker Compose 可能把正常构建进度写到 stderr，发布面板按退出码判断成功或失败

只有在依赖异常、Dockerfile 变更后缓存疑似污染，或磁盘空间紧张时，才建议清理构建缓存：

```bash
DEPLOY_CLEAN_CACHE=1 ./deploy-panel/scripts/deploy-frontend.sh
```

发布面板容器内也支持同名环境变量。设置 `DEPLOY_CLEAN_CACHE=1` 后，本次发布会先执行 `docker builder prune -f`，然后再重建服务。

## 接口

- `POST /deploy`：触发发布任务，请求头必须包含 `X-Publish-Token`
- `GET /logs`：获取最后 300 行部署日志
- `GET /status`：查询当前是否存在运行中的发布任务（免鉴权，仅返回运行状态）
- `GET /online-scripts`：列出线上脚本白名单目录内可执行脚本（name/size/mtime），需鉴权
- `POST /online-scripts/run`：执行白名单内线上脚本，body `{name, confirm}`，需鉴权；`400`（脚本名非法/不存在/确认不符）、`409`（锁占用）、`413`（body 超 64KB）、`200` 已启动
- `GET /online-scripts/logs`：获取线上脚本执行审计记录末 50 条（JSONL），需鉴权

同一时间只允许一个任务执行（发布与线上脚本共用同一把锁），运行中重复触发会返回 `409`。

## 线上脚本

发布面板支持在白名单目录内执行线上脚本（当前仅 SQL），用于替代手工登录服务器执行数据库变更。执行入口在页面「线上脚本」分区。

### 如何新增脚本

1. 开发机编写 SQL，**必须幂等**：`INSERT ... ON DUPLICATE KEY UPDATE` 或先判断再变更（结构变更用 information_schema + PREPARE 模板），参照 `deploy-panel/scripts/online/20261030_0001_example_probe.sql` 中的模板与 `deploy/scripts/stock-agents.sql` 的写法；
2. 命名为字母数字开头的纯文件名、`.sql` 结尾（如 `20261030_0001_fix_xxx.sql`）；
3. git 提交到 `deploy-panel/scripts/online/`；
4. 服务器发布面板执行时自动 `git pull --ff-only` 拉取最新脚本，无需登录服务器同步。

### 如何执行

1. 打开发布面板「线上脚本」分区，选择脚本（列表来自服务端白名单目录扫描）；
2. 点击「执行脚本」，二次确认时**输入脚本名全文**（前端 prompt 与服务端 `confirm` 双重校验）；
3. 执行日志复用下方日志区；每次执行写入审计（时间、脚本名、来源 IP、密钥指纹、退出码、耗时、是否超时、输出末 2KB 摘要），点「查看审计记录」即可查看。

### 安全约束

- 脚本只能来自服务端固定目录 `deploy-panel/scripts/online/`，请求仅传文件名；服务端做 basename + 扩展名白名单 + 目录存在性多重校验，执行器 shell 内再校验一次（正则 + 禁符号链接），防路径穿越；
- 鉴权复用 `PUBLISH_SECRET`（sha256 + timingSafeEqual），所有端点位于 fail-closed 鉴权闸之后；
- 执行使用 spawn 数组参数（无 shell 拼接），用户输入永不进入 shell 字符串；
- SQL 凭据取 mysql 容器内环境变量（`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE`），不落脚本不落盘；绝不提供「请求体即 SQL」的接口，SQL 必须先随仓库提交；
- 单次执行超时 `ONLINE_SCRIPT_TIMEOUT_MS`（默认 10 分钟），超时 SIGKILL 强杀并释放锁；
- 与发布共用全局互斥锁 `task.lock`，同一时间只能运行一个任务；
- 新端点请求体限长 64KB，超限返回 `413`；既有 `POST /deploy` 保持无 body 限长与无超时强杀的既有行为（历史约束，未改动）。

## 安全注意事项

- `PUBLISH_SECRET` 必须预先在根目录 `.env` 配置（Compose `:?required` 强制注入）；未配置时服务端 fail-closed，业务接口一律返回 `503`，不存在首次访问初始化密钥的行为
- 不要把真实发布密钥写入 `publish.html`、脚本或仓库文档
- 建议只在内网或受控跳板机上开放该服务
- 部署脚本会执行 `git pull` 与 `docker compose up -d --build`，请确认 `PROJECT_PATH` 指向正确仓库
- 发布面板容器挂载了宿主机 Docker socket，具备较高权限，不建议直接暴露到公网

## 日志与锁

- 日志文件：`logs/deploy-logs.txt`
- 任务锁文件：`task.lock`（发布与线上脚本共用）
- 线上脚本审计文件：`logs/online-script-audit.jsonl`（追加式 JSONL，每次执行一条）
- 每次任务开始前会清空上一轮日志，页面只展示本次任务记录

如果服务进程被强制终止，可能遗留 `task.lock`。确认没有部署任务运行后，可以手动删除该文件。
