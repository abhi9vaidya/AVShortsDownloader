# ---------- Builder stage ----------
FROM node:18-slim AS builder

# Install tools needed for building (git/wget and ca-certificates)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy only package metadata first (cache friendly)
COPY backend/package.json backend/package-lock.json* ./

# Use npm ci when lockfile exists, else fall back to npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --only=production; \
    else \
      npm install --only=production; \
    fi

# Copy full backend source into builder
COPY backend/ ./

# Optional build step if present in your package.json (uncomment if needed)
# RUN npm run build

# Prune to be safe
RUN npm prune --production || true

# Debugging: show the contents of the workdir to verify server.js and other files were copied
RUN echo "--- /usr/src/app contents (builder) ---" && ls -la /usr/src/app || true

# ---------- Final runtime stage ----------
FROM node:18-slim AS runtime

# Install runtime deps: ffmpeg and wget (yt-dlp uses wget to download)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (same as your original file)
RUN wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Copy node_modules and app files from builder stage
# Preserve ownership for the 'node' user
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app ./

# Debug print (retained from your old file)
RUN echo "--- /usr/src/app contents (runtime) ---" && ls -la /usr/src/app || true
RUN echo "Contents of workdir:" && ls -la /usr/src/app || true

# Environment & port (keeps same as your previous file)
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Run as non-root node user for better security (node user exists in official node images)
USER node

# Default command (same as original)
CMD ["node", "server.js"]
