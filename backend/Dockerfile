# ---------- Builder stage ----------
FROM node:18-slim AS builder

# Install build tools in builder (for native deps) + wget/git helpers
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential python3 python3-dev git wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package metadata (this Dockerfile is intended to be built with the backend folder as the build context)
COPY package.json package-lock.json* ./

# Show package files (debug)
RUN echo ">>> Files before npm install:" && ls -la /usr/src/app || true

# Install production deps (use npm ci when lockfile present; fallback to npm install)
RUN if [ -f package-lock.json ]; then \
      npm ci --only=production || (echo ">>> npm ci failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    else \
      npm install --only=production || (echo ">>> npm install failed - dumping npm logs:" && cat /root/.npm/_logs/* || true; exit 1); \
    fi

# Copy the rest of the backend source into builder
COPY . ./

# Optional: run build script if you have one (uncomment if needed)
# RUN npm run build

# Prune dev dependencies to be absolutely safe
RUN npm prune --production || true

# Debug: show the builder contents so we confirm server.js exists
RUN echo "--- /usr/src/app contents (builder) ---" && ls -la /usr/src/app || true
RUN echo "Recursive listing for debugging:" && ls -R /usr/src/app || true

# ---------- Runtime stage ----------
FROM node:18-slim AS runtime

# Install runtime dependencies: ffmpeg, wget and ca-certificates
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install yt-dlp binary (same approach as original)
RUN wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Copy node_modules and app files from builder stage; set ownership for node user
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app ./

# Debug prints (keeps the debug behavior you had originally)
RUN echo "--- /usr/src/app contents (runtime) ---" && ls -la /usr/src/app || true
RUN echo "Contents of workdir (recursive):" && ls -R /usr/src/app || true

# Environment & port
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run as non-root user (the official node image has a 'node' user)
USER node

# Default command (same as your previous Dockerfile)
CMD ["node", "server.js"]
