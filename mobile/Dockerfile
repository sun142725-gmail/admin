# Mobile H5 镜像用于构建 has-doc 与 has-web 静态资源。
FROM docker.m.daocloud.io/library/node:20-alpine

WORKDIR /app

RUN sed -i 's|dl-cdn.alpinelinux.org/alpine|mirrors.aliyun.com/alpine|g' /etc/apk/repositories
RUN npm config set registry https://registry.npmmirror.com
RUN npm config set fetch-retries 5
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build:has-doc && npm run build:has-web

CMD ["sh", "-c", "rm -rf /mobile-dist/* && mkdir -p /mobile-dist/has-doc /mobile-dist/has-web && cp -r dist/has-doc/* /mobile-dist/has-doc/ && cp -r dist/has-web/* /mobile-dist/has-web/ && tail -f /dev/null"]
