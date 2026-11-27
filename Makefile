# pnpm comes from corepack when it is not installed (the version is pinned by packageManager).
PNPM ?= $(shell command -v pnpm 2>/dev/null || echo corepack pnpm)
APPS := dict bill admin portal auth-ui
PROTOGEN_TS ?= $(abspath ../protogen/ts)
PROTOGEN_LINK := packages/auth-client/node_modules/@huponx/protogen

.PHONY: help install link-protogen unlink-protogen dev-dict dev-bill dev-admin dev-auth dev-portal lint typecheck test build ci e2e docker

help:
	@printf '%s\n' \
		'install     pnpm install --frozen-lockfile' \
		'link-protogen    use ../protogen/ts (not published yet) instead of the npm package; nothing committed changes' \
		'unlink-protogen  back to the published @huponx/protogen (pnpm install)' \
		'dev-<app>   Vite dev server (dict :3000, bill :3001, admin :3002, auth :3003 with /auth-api proxied to identity, portal :3004)' \
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

# While a permission is not published yet: point node_modules at the sibling checkout. package.json and the lockfile
# keep the npm version, so CI is not affected. A later `pnpm install` puts the published package back.
# Regenerate the file first: (cd ../protos && bash scripts/generate.sh ts)
link-protogen:
	@test -f $(PROTOGEN_TS)/src/permissions.ts || { echo "$(PROTOGEN_TS)/src/permissions.ts is missing: cd ../protos && bash scripts/generate.sh ts"; exit 1; }
	@mkdir -p $(dir $(PROTOGEN_LINK))
	@rm -rf $(PROTOGEN_LINK)
	@ln -s $(PROTOGEN_TS) $(PROTOGEN_LINK)
	@echo "$(PROTOGEN_LINK) -> $(PROTOGEN_TS)"

unlink-protogen:
	$(PNPM) install --frozen-lockfile

dev-dict dev-bill dev-admin dev-auth dev-portal:
	$(PNPM) $(subst -,:,$@)

lint typecheck test build ci:
	$(PNPM) $@

e2e:
	$(PNPM) e2e

docker:
	@for a in $(APPS); do docker build -f build/$$a/Dockerfile -t $$a:dev . || exit 1; done
