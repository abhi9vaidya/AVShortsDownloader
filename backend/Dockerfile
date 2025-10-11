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
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy source
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
