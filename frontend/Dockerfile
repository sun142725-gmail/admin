# 前端镜像用于构建静态资源。
FROM docker.m.daocloud.io/library/node:20-alpine
WORKDIR /app
RUN sed -i 's|dl-cdn.alpinelinux.org/alpine|mirrors.aliyun.com/alpine|g' /etc/apk/repositories
RUN npm config set registry https://registry.npmmirror.com
RUN npm config set fetch-retries 5
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000
RUN npm cache clean --force
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD ["npm", "run", "build"]
