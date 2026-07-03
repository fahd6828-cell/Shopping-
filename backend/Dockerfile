# syntax=docker/dockerfile:1
# ============================================================================
#  Souqly backend image — two targets from one build:
#
#    docker build --target api    -t souqly-api    backend/
#    docker build --target worker -t souqly-worker backend/
#
#  api    — Express server only, slim Alpine image.
#  worker — same code + system Chromium for Playwright scraping
#           (CHROMIUM_PATH is preset; SCRAPER_ENABLED still gates usage).
# ============================================================================

# ---------- build: compile TypeScript with dev dependencies ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- prod-deps: production node_modules only ----------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- runtime base shared by api and worker ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY db ./db
USER node

# ---------- api ----------
FROM runtime AS api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]

# ---------- worker (adds Chromium for the Playwright scrapers) ----------
FROM runtime AS worker
USER root
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
USER node
CMD ["node", "dist/worker.js"]
