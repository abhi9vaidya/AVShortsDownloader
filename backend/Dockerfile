# Backend Dockerfile
FROM node:18-slim

# Install ffmpeg and wget (for yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Install dependencies
# Be explicit and copy backend package files from repo root so builds work whether
# Render uses the backend folder as the build context or the repo root.
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --only=production

# Copy source (explicit from repo root -> backend path)
COPY backend/ ./

# Debugging: show the contents of the workdir to verify server.js and other files were copied
RUN echo "--- /usr/src/app contents (debug) ---" && ls -la /usr/src/app || true

# debug print (temporary)
RUN echo "Contents of workdir:" && ls -la /usr/src/app || true

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
