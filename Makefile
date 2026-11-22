# pnpm comes from corepack when it is not installed (the version is pinned by packageManager).
PNPM ?= $(shell command -v pnpm 2>/dev/null || echo corepack pnpm)
APPS := dict bill admin

.PHONY: help install dev-dict dev-bill dev-admin lint typecheck test build ci e2e docker

help:
	@printf '%s\n' \
		'install     pnpm install --frozen-lockfile' \
		'dev-<app>   Vite dev server (dict :3000, bill :3001, admin :3002)' \
		'lint        eslint' \
		'typecheck   tsc in every package and in e2e' \
		'test        vitest in every package' \
		'build       production build of every app' \
		'ci          lint, typecheck, test, build' \
		'e2e         Playwright against a real identity + gatekeeper (needs Postgres, Redis, Go)' \
		'docker      docker build of every app image (build/<app>/Dockerfile)'

export PATH := $(CURDIR)/node_modules/.bin:$(PATH)

install:
	$(PNPM) install --frozen-lockfile

dev-dict dev-bill dev-admin:
	$(PNPM) $(subst -,:,$@)

lint typecheck test build ci:
	$(PNPM) $@

e2e:
	$(PNPM) e2e

docker:
	@for a in $(APPS); do docker build -f build/$$a/Dockerfile -t $$a:dev . || exit 1; done
