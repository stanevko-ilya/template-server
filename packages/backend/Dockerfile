# Multi-stage сборка для монорепо. Контекст сборки — КОРЕНЬ репозитория:
#   docker build -f packages/backend/Dockerfile -t template-server .

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Манифесты (кэш слоёв install)
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN yarn install --frozen-lockfile

# Конфиги сборки + исходники
COPY tsconfig.base.json nx.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Сборка shared → backend (backend build также копирует статику в dist)
RUN yarn workspace @template-server/shared build \
 && yarn workspace @template-server/backend build

# ---- runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Только production-зависимости + workspace-симлинки
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Скомпилированный код shared + backend
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/backend/dist ./packages/backend/dist

# Папка логов с правами для non-root пользователя
RUN mkdir -p packages/backend/dist/modules/logger/logs \
 && chown -R node:node packages/backend/dist/modules/logger/logs

USER node
WORKDIR /app/packages/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost:3000/api/ping || exit 1

# 3000 — API, 3001 — sockets / health
EXPOSE 3000 3001

CMD ["node", "dist/index.js"]
