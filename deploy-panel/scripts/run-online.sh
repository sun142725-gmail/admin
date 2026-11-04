#!/bin/bash

# 线上脚本执行器：在 mysql 容器内执行白名单目录（deploy-panel/scripts/online/）中指定的 SQL 文件。
# 安全约束：
# 1. 脚本名由发布面板服务端校验后以数组参数传入（$1，纯文件名），此处再做 basename + 正则 +
#    realpath 双重校验，防路径穿越（纵深防御）；
# 2. SQL 凭据取 mysql 容器内环境变量（不落脚本不落盘），stdin 喂入 SQL（照抄 sync-stock-agents.sh 模式）；
# 3. 不调 common.sh 的 preflight（其强制 nginx.conf 存在，会误伤纯 SQL 任务），自做精简检查；
# 4. 脚本列表刷新负责 git pull；执行阶段不再拉取，确保执行用户已确认的脚本版本。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

CURRENT_STEP="环境检查"
DEPLOY_START_TIME="$(date +%s)"
require_command git
require_command docker

if ! docker info >/dev/null 2>&1; then
  echo "Docker 不可用，请检查 /var/run/docker.sock 挂载或 Docker 服务状态"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "缺少 Docker Compose：需要 docker compose 或 docker-compose"
  exit 127
fi

if [ ! -f "$COMPOSE_FILE_PATH" ]; then
  echo "Compose 文件不存在：$COMPOSE_FILE_PATH"
  exit 1
fi

CURRENT_STEP="校验脚本名与文件"
sql_name="$1"
if [ -z "$sql_name" ]; then
  echo "缺少脚本名参数"
  exit 1
fi

# 双重校验①：必须是纯文件名（服务端已校验，此处兜底）
sql_base="$(basename "$sql_name")"
if [ "$sql_base" != "$sql_name" ]; then
  echo "非法脚本名（不允许包含路径）：$sql_name"
  exit 1
fi

# 双重校验②：字母数字开头、.sql 结尾
# 注意：此处正则与 server.js 的 ONLINE_SCRIPT_EXTS 默认白名单 ['.sql'] 对齐；若放宽服务端
# ONLINE_SCRIPT_EXTS（如加 .sh），必须同步放宽本正则与下方 mysql 执行方式，否则服务端放行、执行器必拒
if ! [[ "$sql_base" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.sql$ ]]; then
  echo "非法脚本名（仅允许字母数字开头、.sql 结尾的文件名）：$sql_base"
  exit 1
fi

online_dir="$HOST_PROJECT_PATH/deploy-panel/scripts/online"
sql_file="$online_dir/$sql_base"
if [ ! -f "$sql_file" ]; then
  echo "SQL 文件不存在：$sql_file"
  echo "请先在开发机编写并 git 提交到 deploy-panel/scripts/online/"
  exit 1
fi

# 双重校验③：白名单目录先解析真实路径（pwd -P），SQL 文件本身不得是符号链接——
# sql_base 已被正则限定为无路径分隔符的纯文件名，目录解析 + 禁符号链接即可封死逃逸路径
real_online="$(cd "$online_dir" && pwd -P)"
if [ -L "$sql_file" ]; then
  echo "SQL 文件不允许是符号链接：$sql_file"
  exit 1
fi
if [ ! -f "$real_online/$sql_base" ]; then
  echo "SQL 文件在真实路径下不可访问：$real_online/$sql_base"
  exit 1
fi

CURRENT_STEP="执行线上脚本（mysql 容器内）"
echo "执行 deploy-panel/scripts/online/$sql_base（请确保 SQL 幂等，可重复执行）"
# 容器内凭 MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE 环境变量连接（凭据不落脚本不落盘）。
run_compose exec -T mysql sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$sql_file"

echo ""
echo "✅ 线上脚本执行完成：$sql_base"
print_elapsed_time
