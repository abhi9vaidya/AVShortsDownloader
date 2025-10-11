# ---------- Builder stage (Alpine) ----------
FROM node:18-alpine AS builder

# Install build tools needed for native modules + helpers
RUN apk add --no-cache \
    build-base \
    python3 \
    git \
    wget \
    ca-certificates

WORKDIR /usr/src/app

# Copy package metadata (intended to be built with backend as context)
COPY package.json package-lock.json* ./

# Debug: list files before install
RUN echo ">>> Files before npm install (builder):" && ls -la /usr/src/app || true

# Install production deps but ignore lifecycle scripts (avoids postinstall download failures)
RUN if [ -f package-lock.json ]; then \
      npm ci --only=production --ignore-scripts || (echo ">>> npm ci failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    else \
      npm install --only=production --ignore-scripts || (echo ">>> npm install failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    fi

# Copy the rest of the backend source into builder
COPY . ./

# ensure backend dir exists so later COPY --from=builder won't fail
RUN mkdir -p /usr/src/app/backend

# Prune dev deps just in case
RUN npm prune --production || true

# Debug: confirm server.js present in builder
RUN echo "--- /usr/src/app contents (builder) ---" && ls -la /usr/src/app || true
RUN echo "Recursive listing (builder):" && ls -R /usr/src/app || true

# ---------- Runtime stage (Alpine) ----------
FROM node:18-alpine AS runtime

# Install runtime deps: ffmpeg, wget and ca-certificates
RUN apk add --no-cache \
    ffmpeg \
    wget \
    ca-certificates

# Install yt-dlp binary (we rely on this rather than package postinstall)
RUN wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Copy node_modules and app files from builder stage; set ownership for node user
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app ./

# Ensure app dir and downloads dir are writable by node user (important)
RUN mkdir -p /usr/src/app/downloads && chown -R node:node /usr/src/app

# Debug prints to verify files are in place
RUN echo "--- /usr/src/app contents (runtime) ---" && ls -la /usr/src/app || true
RUN echo "Contents of workdir (recursive):" && ls -R /usr/src/app || true

# Environment & port
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run as non-root user
USER node

# Start command: prefer server.js at root; if not, fallback to backend/server.js
CMD ["sh", "-c", "if [ -f /usr/src/app/server.js ]; then node /usr/src/app/server.js; elif [ -f /usr/src/app/backend/server.js ]; then node /usr/src/app/backend/server.js; else echo \"ERROR: server.js not found\"; ls -R /usr/src/app; exit 1; fi"]
