FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Writable logs dir for non-root user (TLS терминируется внешним nginx — certs внутри образа не нужны)
RUN mkdir -p modules/logger/logs && chown -R node:node modules/logger/logs

# Run as non-root user
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost:3000/api/ping || exit 1

# 3000 — API, 3001 — sockets / health
EXPOSE 3000 3001

CMD ["node", "index.js"]
