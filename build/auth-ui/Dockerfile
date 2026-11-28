# syntax=docker/dockerfile:1
# Build context is the repository root:
#   docker build -f build/auth-ui/Dockerfile -t auth-ui:dev .
#
# The pages of sign in (login, MFA, password reset, account MFA, sign out). They are served by the identity
# service, not by this image: the identity Dockerfile copies the files out of it
#   COPY --from=ghcr.io/huponx/auth-ui:<tag> /usr/share/nginx/html /ui
# so the tag is the version of the pages that an identity release carries. The image can also run on its own
# (nginx on 8080, static files only), which is only useful to look at the pages without the API.
ARG NODE_VERSION=20
ARG NGINX_TAG=alpine-slim

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /src
RUN corepack enable
# dependencies first: only the lockfile decides this layer
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --offline --frozen-lockfile
# the app and the packages it depends on
RUN pnpm --filter @huponx/auth... build

FROM nginxinc/nginx-unprivileged:${NGINX_TAG}
# pick up the Alpine fixes published after the base image was built (openssl, musl, zlib)
USER root
RUN apk upgrade --no-cache
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="auth-ui" \
      org.opencontainers.image.source="https://github.com/huponx/web" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
COPY build/auth-ui/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/auth/dist /usr/share/nginx/html
EXPOSE 8080
USER 101
