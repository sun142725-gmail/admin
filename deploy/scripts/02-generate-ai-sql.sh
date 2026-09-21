#!/usr/bin/env bash
# 步骤 2/3：拉取开发库 AI 配置，生成线上插入 SQL（INSERT IGNORE，线上自添数据不受影响）。
# 需在 deploy/.env.production 配置 TARGET_AI_ENCRYPTION_KEY（线上加密密钥，用于导出时重加密）。
# 生成后需人工把 SQL 到线上库执行（mysql 命令或可视化工具），详见 deploy/README.md。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

if [ -f "$ROOT_DIR/deploy/.env.production" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/deploy/.env.production"
  set +a
fi

# Node 环境引导：优先 nvm，其次常见安装路径。
if ! command -v npm >/dev/null 2>&1; then
  if [ -f "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
  fi
fi
if ! command -v npm >/dev/null 2>&1; then
  for dir in "$HOME"/.nvm/versions/node/*/bin; do
    [ -x "$dir/npm" ] && export PATH="$dir:$PATH" && break
  done
fi

echo "==> 生成 AI 配置发布 SQL（源：开发库）"
cd "$ROOT_DIR/backend"
npm run sync:ai:gen
