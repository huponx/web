# syntax=docker/dockerfile:1
# Build context is the repository root:
#   docker build -f build/dict/Dockerfile -t dict:dev .
# The image is the same for every environment: API_BASE comes from /config.js (ConfigMap of the chart).
ARG NODE_VERSION=20
ARG NGINX_VERSION=1.27

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /src
RUN corepack enable
# dependencies first: only the lockfile decides this layer
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --offline --frozen-lockfile
# the app and the packages it depends on
RUN pnpm --filter @huponx/dict... build

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="dict" \
      org.opencontainers.image.source="https://github.com/huponx/web" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
COPY build/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 build/nginx/40-headers.sh /docker-entrypoint.d/40-headers.sh
COPY --from=build /src/apps/dict/dist /usr/share/nginx/html
EXPOSE 8080
USER 101
