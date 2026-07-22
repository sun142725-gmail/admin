FROM node:20-alpine

# 新增：替换国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache bash git docker-cli docker-cli-compose

WORKDIR /app

COPY . .

EXPOSE 9090

CMD ["node", "server.js"]
