# syntax=docker/dockerfile:1
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js config.js about.md ./
COPY lib ./lib
COPY static ./static

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 7777
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:7777/documents/about >/dev/null || exit 1

CMD ["node", "server.js"]
