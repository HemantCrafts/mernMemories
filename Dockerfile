# ============================================================
#  MERN Memories — production image
#
#  Multi-stage so the final image carries no build tooling:
#    1. client-build  -> compiles the React app to static assets
#    2. deps          -> installs server deps (sharp needs build headers)
#    3. runtime       -> slim image with only what runs
#
#  Build:  docker build -t mern-memories .
#  Run:    docker run -p 5000:5000 --env-file server/.env mern-memories
#
#  NOTE: sharp ships prebuilt binaries for linux/amd64 and linux/arm64, so
#  no compiler is needed at runtime. The build stage keeps python3/make/g++
#  available anyway so sharp can fall back to compiling from source on an
#  architecture without a prebuilt binary.
# ============================================================

# ---------- 1. Build the client ----------
FROM node:22-bookworm-slim AS client-build

WORKDIR /app/client

# Copy manifests first so this layer is cached when only source changes.
COPY client/package.json client/package-lock.json* ./
RUN npm install

COPY client/ ./
RUN npm run build


# ---------- 2. Install server dependencies ----------
FROM node:22-bookworm-slim AS deps

WORKDIR /app/server

# Build headers: only needed if sharp falls back to compiling from source.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev


# ---------- 3. Runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Run as the unprivileged user that the node image already provides.
# The uploads directory must be writable by it.
COPY --from=deps --chown=node:node /app/server/node_modules ./server/node_modules
COPY --chown=node:node server/ ./server/
COPY --from=client-build --chown=node:node /app/client/dist ./client/dist

# Uploads land here. Mount a volume at this path to persist them.
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads

USER node

# Render/Railway inject PORT; 5000 matches the local default.
ENV PORT=5000
EXPOSE 5000

# Fail the build loudly if the app cannot even be imported, rather than
# discovering a syntax error only at runtime.
RUN node --check server/src/server.js

CMD ["node", "server/src/server.js"]
