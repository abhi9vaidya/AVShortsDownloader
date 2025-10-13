# Dockerfile (Debian-slim, robust yt-dlp install into venv)
FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime deps and python venv tooling
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg \
       wget \
       ca-certificates \
       curl \
       git \
       python3 \
       python3-venv \
       python3-distutils \
  && rm -rf /var/lib/apt/lists/*

# Create a small virtualenv for yt-dlp and install it there
RUN python3 -m venv /opt/yt-venv \
  && /opt/yt-venv/bin/pip install --upgrade pip setuptools \
  && /opt/yt-venv/bin/pip install --no-cache-dir yt-dlp \
  && ln -s /opt/yt-venv/bin/yt-dlp /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Install backend node deps (cache-friendly)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev --ignore-scripts

# Copy app source
COPY . .

# Make included binary executable if present
RUN chmod +x backend/bin/yt-dlp || true

EXPOSE 10000
CMD ["node", "backend/server.js"]
