# Dockerfile (recommended: Debian-slim)
FROM node:20-slim

# Install runtime deps and yt-dlp
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg \
       wget \
       ca-certificates \
       curl \
       python3 \
       python3-pip \
       git \
  && pip3 install --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files and install deps
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# make sure any included binary is executable (no-op if not present)
RUN chmod +x backend/bin/yt-dlp || true

EXPOSE 10000
CMD ["node", "backend/server.js"]
