# Dockerfile for core_backend_system (Node.js)
FROM node:18-alpine

WORKDIR /app

# Install OpenSSL (required for Prisma on Alpine)
# ffmpeg: 앱이 보낸 녹음을 STT 서버가 받는 형식(16kHz 모노 WAV)으로 바꾼다.
# 웹 브라우저는 WAV 를 직접 뽑지 못하고 webm/opus 로만 녹음되는데,
# STT 서버는 확장자가 .wav 가 아니면 400 으로 되돌린다.
RUN apk add --no-cache openssl ffmpeg

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
