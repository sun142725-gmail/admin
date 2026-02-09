# 后端镜像用于构建与运行 NestJS 服务。
FROM docker.m.daocloud.io/library/node:20-alpine AS builder
WORKDIR /app
RUN sed -i 's|dl-cdn.alpinelinux.org/alpine|mirrors.aliyun.com/alpine|g' /etc/apk/repositories
RUN apk add --no-cache python3 make g++
RUN npm config set registry https://registry.npmmirror.com
RUN npm config set fetch-retries 5
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000
RUN npm cache clean --force
COPY package.json package-lock.json* ./
# 构建阶段仅需编译 TypeScript，跳过依赖安装脚本可避免 sqlite3/node-gyp 网络编译失败。
RUN npm install --ignore-scripts
COPY . .
RUN npm run build

FROM docker.m.daocloud.io/library/node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN sed -i 's|dl-cdn.alpinelinux.org/alpine|mirrors.aliyun.com/alpine|g' /etc/apk/repositories
RUN apk add --no-cache python3 make g++
RUN npm config set registry https://registry.npmmirror.com
RUN npm config set fetch-retries 5
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000
RUN npm cache clean --force
COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/main.js"]
