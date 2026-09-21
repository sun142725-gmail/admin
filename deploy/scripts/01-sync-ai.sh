#!/usr/bin/env bash
# 步骤 1/2：同步「六爻解卦」智能体到数据库（幂等，可重复执行）。
# 详见 deploy/README.md。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# 加载生产环境变量（不覆盖 shell 已导出的变量）。
if [ -f "$ROOT_DIR/deploy/.env.production" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/deploy/.env.production"
  set +a
else
  echo "⚠ 未找到 deploy/.env.production，将使用当前 shell 环境变量（模板见 deploy/env.production.example）"
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

echo "==> 执行 AI 智能体同步（code=divination）"
cd "$ROOT_DIR/backend"
npm run sync:ai
