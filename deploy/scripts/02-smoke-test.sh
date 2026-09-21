#!/usr/bin/env bash
# 步骤 2/2：上线冒烟验证——后端存活、登录接口链路、前端页面（可选）。
# 详见 deploy/README.md。
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

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
FRONTEND_URL="${FRONTEND_URL:-}"
PASS=0
FAIL=0

check() {
  local name="$1"
  if "$@" >/dev/null 2>&1; then
    echo "PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $name"
    FAIL=$((FAIL + 1))
  fi
}

# 1) 后端进程存活：任意 HTTP 响应（含 404）都算活，连接拒绝才算挂。
http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE_URL/api" || echo 000)"
if [ "$http_code" != "000" ]; then
  echo "PASS  后端存活（$BASE_URL → HTTP $http_code）"
  PASS=$((PASS + 1))
else
  echo "FAIL  后端无响应（$BASE_URL）"
  FAIL=$((FAIL + 1))
fi

# 2) 登录接口链路：错误凭据应返回 4xx（证明 控制器+数据库 链路通）。
login_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"__smoke__","password":"__smoke__"}' || echo 000)"
if [ "$login_code" = "000" ]; then
  echo "FAIL  登录接口无响应"
  FAIL=$((FAIL + 1))
elif [ "$login_code" -ge 400 ] && [ "$login_code" -lt 500 ]; then
  echo "PASS  登录接口链路正常（HTTP $login_code）"
  PASS=$((PASS + 1))
else
  echo "FAIL  登录接口返回异常（HTTP $login_code）"
  FAIL=$((FAIL + 1))
fi

# 3) 前端页面（可选，配置了 FRONTEND_URL 才检查）。
if [ -n "$FRONTEND_URL" ]; then
  fe_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$FRONTEND_URL" || echo 000)"
  if [ "$fe_code" != "000" ] && [ "$fe_code" -lt 500 ]; then
    echo "PASS  前端可达（$FRONTEND_URL → HTTP $fe_code）"
    PASS=$((PASS + 1))
  else
    echo "FAIL  前端无响应（$FRONTEND_URL）"
    FAIL=$((FAIL + 1))
  fi
fi

echo "----"
echo "冒烟结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ]
