# 后端镜像用于构建与运行 NestJS 服务。
FROM docker.m.daocloud.io/library/node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM docker.m.daocloud.io/library/node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/main.js"]
