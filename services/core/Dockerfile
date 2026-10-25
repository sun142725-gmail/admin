# 多阶段构建：静态编译产物放进极简运行镜像（基础镜像走项目统一的 daocloud 镜像源）
FROM docker.m.daocloud.io/library/golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/core ./cmd/server

FROM docker.m.daocloud.io/library/alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone
COPY --from=builder /out/core /usr/local/bin/core
EXPOSE 8081
ENTRYPOINT ["core"]
