#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "拉取最新代码"
git pull

echo "重建全部服务"
run_compose up -d --build backend frontend nginx
