# backend/Dockerfile (multi-stage)
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Install build dependencies (if you need to build frontend inside Docker, you'd use this stage)
RUN apk add --no-cache build-base python3 git wget ca-certificates

# Copy package & install production deps
COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts

# Copy the rest of the repo (so frontend build or prebuilt dist is available)
COPY . .

# ---------- Runtime image ----------
FROM node:18-alpine AS runtime
WORKDIR /usr/src/app

# FFmpeg + download yt-dlp binary
RUN apk add --no-cache ffmpeg wget ca-certificates
RUN wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

# Copy node_modules & app files from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/server.js ./server.js
COPY --from=builder /usr/src/app/package*.json ./

# Copy the frontend build into public/
# Adjust this path if your frontend's output is in a different directory.
# If you committed frontend/dist into the repo, the builder stage already has it.
RUN mkdir -p public
COPY --from=builder /usr/src/app/frontend/dist/ ./public/ || true
# If you committed the built index directly to repo's public, also copy that:
COPY --from=builder /usr/src/app/public/ ./public/ || true

# Ensure downloads dir exists and is writable
RUN mkdir -p /usr/src/app/downloads && chown -R node:node /usr/src/app

USER node

EXPOSE 10000
ENV PORT=10000
CMD ["node", "server.js"]
