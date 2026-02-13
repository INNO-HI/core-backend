# Dockerfile for core_backend_system (Node.js)
FROM node:18-alpine

WORKDIR /app

# Install OpenSSL (required for Prisma on Alpine)
RUN apk add --no-cache openssl

# Copy package metadata from module folder (build context is repo root)
COPY core_backend_system/package*.json ./
RUN npm ci --only=production || npm install --production

# Copy application files
COPY core_backend_system /app

# Copy top-level DB folder so require('../DB/...') works
COPY DB /DB

# Generate Prisma Client
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 4100

CMD ["node", "server.js"]
