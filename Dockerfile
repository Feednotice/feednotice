# FeedNotice application: web pages, feed reading, sending (through the MTA container).
FROM node:26-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY LICENSE ./
# The data volume (SQLite database, DKIM key, backups) belongs to the unprivileged user.
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/cli.ts", "serve"]
