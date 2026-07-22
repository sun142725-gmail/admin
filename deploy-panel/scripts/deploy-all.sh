#!/bin/bash
set -e

echo "拉取最新代码"
git pull

echo "重建全部服务"
docker-compose up -d --build backend frontend nginx