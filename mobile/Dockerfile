# Mobile H5 镜像用于构建单个 H5 应用静态资源。
FROM docker.m.daocloud.io/library/node:20-alpine

ARG MOBILE_APP=has-doc
ENV MOBILE_APP=${MOBILE_APP}

WORKDIR /app

RUN sed -i 's|dl-cdn.alpinelinux.org/alpine|mirrors.aliyun.com/alpine|g' /etc/apk/repositories
RUN npm config set registry https://registry.npmmirror.com
RUN npm config set fetch-retries 5
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build:${MOBILE_APP}

CMD ["sh", "-c", "rm -rf /mobile-dist/${MOBILE_APP} && mkdir -p /mobile-dist/${MOBILE_APP} && cp -r dist/${MOBILE_APP}/* /mobile-dist/${MOBILE_APP}/ && tail -f /dev/null"]
