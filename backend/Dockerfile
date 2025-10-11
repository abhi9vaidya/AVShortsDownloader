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

# Copy package metadata (expect build context = backend/ or repo root -> backend/)
COPY package.json package-lock.json* ./

# Debug: list files before install
RUN echo ">>> Files before npm install (builder):" && ls -la /usr/src/app || true

# Install production deps but ignore lifecycle scripts (skip postinstall)
RUN if [ -f package-lock.json ]; then \
      npm ci --only=production --ignore-scripts || (echo ">>> npm ci failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    else \
      npm install --only=production --ignore-scripts || (echo ">>> npm install failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    fi


# Copy the rest of the backend source into builder
COPY . ./

# Prune dev deps just in case
RUN npm prune --production || true

# Debug: confirm server.js present in builder
RUN echo "--- /usr/src/app contents (builder) ---" && ls -la /usr/src/app || true
RUN echo "Recursive listing (builder):" && ls -R /usr/src/app || true

# ---------- Runtime stage (Alpine) ----------
FROM node:18-alpine AS runtime

# Install runtime deps: ffmpeg, wget and ca-certificates
# Note: Alpine package names; ffmpeg is available in community repos for Alpine
RUN apk add --no-cache \
    ffmpeg \
    wget \
    ca-certificates

# Install yt-dlp binary (same approach)
RUN wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Copy node_modules and app files from builder stage; set ownership for node user
# Official Node Alpine images have a 'node' user; --chown works here.
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app ./

# Ensure backend dir is present at /usr/src/app/backend even if build context differed
COPY --from=builder --chown=node:node /usr/src/app/backend ./backend || true

# Debug prints to verify files are in place
RUN echo "--- /usr/src/app contents (runtime) ---" && ls -la /usr/src/app || true
RUN echo "Contents of workdir (recursive):" && ls -R /usr/src/app || true

# Environment & port
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run as non-root user
USER node

# Default command: prefer server.js at root; if build context put files under backend/, start backend/server.js
CMD ["sh", "-c", "if [ -f /usr/src/app/server.js ]; then node /usr/src/app/server.js; else node /usr/src/app/backend/server.js; fi"]
