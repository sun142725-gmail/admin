# 常用命令：make run / make build / make test（help 目标列出全部）
.PHONY: help run build test vet tidy docker-build clean

help: ## 列出可用目标
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

run: ## 本地开发运行（默认 :8081）
	go run ./cmd/server

build: ## 编译静态二进制到 bin/core
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/core ./cmd/server

test: ## 运行测试
	go test ./...

vet: ## 静态检查
	go vet ./...

tidy: ## 整理依赖（改动 go.mod 后执行）
	go mod tidy

docker-build: ## 构建镜像（与 compose 使用的 Dockerfile 一致）
	docker build -t rbac-core .

clean: ## 清理构建产物
	rm -rf bin
