FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Create writable directories and set ownership for non-root user
RUN mkdir -p modules/logger/logs modules/ssl/certs && \
    chown -R node:node modules/logger/logs modules/ssl/certs

# Run as non-root user
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/ping || exit 1

EXPOSE 3000 3001

CMD ["node", "index.js"]
