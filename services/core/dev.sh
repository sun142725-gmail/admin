#!/bin/bash
# 本地一键启动 Go core 服务（backend 的 .env 复用）
cd "$(dirname "$0")"
export $(grep -E '^(DB_PASSWORD)=' ../../backend/.env | xargs)
export DB_HOST=localhost DB_PORT=3307 DB_USERNAME=rbac DB_NAME=rbac
export INTERNAL_API_TOKEN=${INTERNAL_API_TOKEN:-dev_internal_token}
exec go run ./cmd/server
