# 前端镜像用于构建静态资源。
FROM docker.m.daocloud.io/library/node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD ["npm", "run", "build"]
