# Dockerfile - builds frontend (dist/) then runs server
FROM node:20-alpine AS build

# Install tools needed for some node-gyp dependencies and yt-dlp build steps
RUN apk add --no-cache python3 make g++ git wget ca-certificates

WORKDIR /usr/src/app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm ci --production=false --ignore-scripts

# Copy source
COPY . .

# Install backend dependencies
RUN if [ -f backend/package.json ]; then \
      echo "Installing backend dependencies" && npm --prefix backend ci --ignore-scripts; \
    else \
      echo "No backend/package.json found - skipping backend install"; \
    fi

# Run frontend build - IMPORTANT:
# Ensure your package.json has a "build" script that builds into ./dist
# e.g. "build": "vite build" or "react-scripts build"
RUN if [ -f package.json ]; then \
      if npm run | grep -q build; then \
        echo "Running npm run build" && npm run build || echo "npm run build failed (continue)"; \
      else \
        echo "No build script - skipping frontend build"; \
      fi \
    fi

# ---- runtime image ----
FROM node:20-alpine AS runtime

# Install runtime deps (ffmpeg for merging, wget to fetch yt-dlp, curl for alternative download, python3 for yt-dlp execution)
RUN apk add --no-cache ffmpeg wget ca-certificates curl python3

WORKDIR /usr/src/app

# Copy node modules from build stage (if any)
COPY --from=build /usr/src/app/node_modules ./node_modules
# Copy app code and built dist (if built)
COPY --from=build /usr/src/app ./

# Ensure backend/dist exists for servers that only serve backend/dist
RUN if [ -d dist ]; then mkdir -p backend/dist && cp -r dist/* backend/dist/; fi || true

# Create downloads directory and bin directory, and chown to node user (best-effort)
RUN mkdir -p /usr/src/app/downloads /usr/src/app/backend/downloads /usr/src/app/backend/bin \
    && chown -R node:node /usr/src/app/downloads /usr/src/app/backend/downloads /usr/src/app/backend/bin || true

# Pre-install yt-dlp using curl to avoid runtime download issues
RUN curl -L -o /usr/src/app/backend/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod +x /usr/src/app/backend/bin/yt-dlp \
    && chown node:node /usr/src/app/backend/bin/yt-dlp || true

# Copy cookies.txt and make it writable by node user
COPY backend/cookies.txt backend/cookies.txt
RUN chown node:node /usr/src/app/backend/cookies.txt || true

# Use non-root user
USER node

# Expose port (Render uses $PORT environment variable)
ENV PORT=10000
EXPOSE 10000

# Default command
CMD ["node", "backend/server.js"]
