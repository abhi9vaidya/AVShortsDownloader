# ---------- Builder stage ----------
FROM node:18-slim AS builder

# Install build tools (for native modules) + helpers
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential python3 python3-dev git wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package metadata (intended to be built with backend as context OR repo root -> backend/)
COPY package.json package-lock.json* ./

# Debug: list files before install
RUN echo ">>> Files before npm install (builder):" && ls -la /usr/src/app || true

# Install production deps (npm ci if lockfile present)
RUN if [ -f package-lock.json ]; then \
      npm ci --only=production || (echo ">>> npm ci failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    else \
      npm install --only=production || (echo ">>> npm install failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    fi

# Copy the rest of the backend source into builder
COPY . ./

# Prune dev deps just in case
RUN npm prune --production || true

# Debug: confirm server.js present in builder
RUN echo "--- /usr/src/app contents (builder) ---" && ls -la /usr/src/app || true
RUN echo "Recursive listing (builder):" && ls -R /usr/src/app || true

# ---------- Runtime stage ----------
FROM node:18-slim AS runtime

# Install runtime deps: ffmpeg, wget and ca-certificates
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install yt-dlp binary
RUN wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Copy node_modules and app files from builder stage; set ownership for node user
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app ./

# Ensure backend dir is present at /usr/src/app/backend even if build context differed
# (If builder already had backend/ inside /usr/src/app, this is harmless.)
COPY --from=builder --chown=node:node /usr/src/app/backend ./backend || true

# Debug prints to verify files are in place (keeps behavior you had)
RUN echo "--- /usr/src/app contents (runtime) ---" && ls -la /usr/src/app || true
RUN echo "Contents of workdir (recursive):" && ls -R /usr/src/app || true

# Environment & port
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run as non-root user
USER node

# Default command: prefer server.js at root; if build context put files under backend/, start backend/server.js
# This CMD will run node /usr/src/app/server.js when present; if you prefer always to run backend/server.js change as needed.
CMD ["sh", "-c", "if [ -f /usr/src/app/server.js ]; then node /usr/src/app/server.js; else node /usr/src/app/backend/server.js; fi"]
