FROM node:20-alpine

RUN apk add --no-cache bash git docker-cli docker-cli-compose

WORKDIR /app

COPY . .

EXPOSE 9090

CMD ["node", "server.js"]
