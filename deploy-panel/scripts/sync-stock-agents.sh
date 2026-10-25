#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# 同步「股市圆桌」六位智能体到数据库：git pull 后在 mysql 容器内执行
# deploy/scripts/stock-agents.sql（INSERT ... ON DUPLICATE KEY UPDATE，按 code 幂等，
# 模型绑定按 model_key+base_url 回填）。SQL 由 backend `npm run sync:stock:gen` 生成。
sync_stock_agents() {
  preflight
  pull_latest_code

  CURRENT_STEP="检查 SQL 文件"
  local sql_file="$HOST_PROJECT_PATH/deploy/scripts/stock-agents.sql"
  if [ ! -f "$sql_file" ]; then
    echo "SQL 文件不存在：$sql_file"
    echo "请先在开发机执行 cd backend && npm run sync:stock:gen 生成并提交"
    exit 1
  fi

  CURRENT_STEP="同步圆桌智能体（mysql 容器内执行 stock-agents.sql）"
  echo "执行 deploy/scripts/stock-agents.sql（幂等，可重复执行）"
  # 容器内凭 MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE 环境变量连接（凭据不落脚本）。
  run_compose exec -T mysql sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$sql_file"

  echo ""
  echo "✅ 圆桌智能体同步完成（上方 SELECT 核对：应返回 6 行且 model_id 非空）"
  print_elapsed_time
}

sync_stock_agents
