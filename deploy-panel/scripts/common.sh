#!/bin/bash

set -Eeuo pipefail

CURRENT_STEP="初始化"

on_error() {
  local exit_code=$?
  echo "发布失败"
  echo "失败步骤：$CURRENT_STEP"
  echo "失败命令：$BASH_COMMAND"
  echo "退出码：$exit_code"
  exit "$exit_code"
}

trap on_error ERR

run_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  docker-compose "$@"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1"
    exit 127
  fi
}

preflight() {
  CURRENT_STEP="环境检查"
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
}

pull_latest_code() {
  CURRENT_STEP="拉取最新代码"
  echo "拉取最新代码"
  git pull --ff-only
}

clean_build_cache_if_needed() {
  if [ "${DEPLOY_CLEAN_CACHE:-0}" != "1" ]; then
    return
  fi

  CURRENT_STEP="清理 Docker 构建缓存"
  echo "清理 Docker 构建缓存"
  docker builder prune -f
}

compose_up() {
  CURRENT_STEP="重建服务：$*"
  echo "重建服务：$*"
  DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}" COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-1}" run_compose up -d --build "$@"
}

deploy_services() {
  preflight
  pull_latest_code
  clean_build_cache_if_needed
  compose_up "$@"
}
