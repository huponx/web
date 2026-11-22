#!/usr/bin/env bash
# End to end run of the admin app against a real identity and gatekeeper (sibling checkouts ../identity
# and ../gatekeeper): Playwright drives a browser through login, roles, users and logout.
#
# Needs Postgres with the identity schema (db-migration V1..V8) and Redis (POSTGRES_* / REDIS_*), Go,
# openssl, pnpm and a Chromium for Playwright (pnpm exec playwright install chromium).
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)
tmp=$(mktemp -d)
trap 'kill ${ipid:-0} ${gpid:-0} 2>/dev/null || true; rm -rf "$tmp"' EXIT

# Own ports (not the 8080/9090/8081/3002 of a local dev stack, see LOCAL.md), so both can run together.
ID_HTTP=${ID_HTTP:-18180}; ID_GRPC=${ID_GRPC:-19190}; GK_PORT=${GK_PORT:-18082}
UI_PORT=${UI_PORT:-13002}
ui=http://localhost:$UI_PORT     # the admin app (vite preview of the build, config.js rewritten below)
export ENV=local
openssl ecparam -name prime256v1 -genkey -noout -out "$tmp/k1.pem" 2>/dev/null
(cd ../identity && go build -o "$tmp/identity" ./cmd/identity && go build -o "$tmp/identity-setup" ./cmd/identity-setup)
(cd ../gatekeeper && go build -o "$tmp/gatekeeper" ./cmd/gatekeeper)

export IDENTITY_SIGNING_KEY_FILE=$tmp/k1.pem IDENTITY_SIGNING_KEY_ID=k1 IDENTITY_MFA_KEY="k1:$(openssl rand -base64 32)"
export IDENTITY_ISSUER=http://localhost:$ID_HTTP
export SETUP_ADMIN_PASSWORD=${E2E_ADMIN_PASSWORD:-Correct-Horse-Battery-9}

client=gk-$(openssl rand -hex 3)
secret=$(openssl rand -hex 16)
# keep_password: the e2e signs in with the given password (a real setup forces a change)
SETUP_CONFIG=$(cat <<EOF
{"admin":{"email":"${E2E_ADMIN_EMAIL:-admin@example.com}","keep_password":true},
 "clients":[
  {"id":"$client","type":"confidential","resource":"gatekeeper","secret_env":"E2E_GK_SECRET",
   "redirect_uris":["http://localhost:$GK_PORT/auth/callback"],"post_logout_uris":["$ui/"],
   "grants":["authorization_code","refresh_token","client_credentials","urn:ietf:params:oauth:grant-type:token-exchange"]}],
 "exchange_policies":[{"client":"$client","audience":"identity","max_depth":1}]}
EOF
) E2E_GK_SECRET=$secret "$tmp/identity-setup"

HTTP_PORT=$ID_HTTP PORT=$ID_GRPC "$tmp/identity" >"$tmp/identity.log" 2>&1 & ipid=$!
for _ in $(seq 1 50); do curl -fs "$IDENTITY_ISSUER/healthz" >/dev/null && break; sleep 0.2; done

# the routes the admin app uses, exactly as shipped
../gatekeeper/scripts/routes.sh "localhost:$ID_GRPC" >"$tmp/routes.yaml"

PORT=$GK_PORT GATEKEEPER_PUBLIC_URL=http://localhost:$GK_PORT GATEKEEPER_ROUTES_FILE=$tmp/routes.yaml \
GATEKEEPER_IDENTITY_ISSUER=$IDENTITY_ISSUER GATEKEEPER_CLIENT_ID=$client GATEKEEPER_CLIENT_SECRET=$secret GATEKEEPER_AUDIENCE=gatekeeper \
GATEKEEPER_SESSION_KEY="k1:$(openssl rand -base64 32)" GATEKEEPER_UI_ORIGINS=$ui \
  "$tmp/gatekeeper" >"$tmp/gatekeeper.log" 2>&1 & gpid=$!
for _ in $(seq 1 50); do curl -fs "http://localhost:$GK_PORT/healthz" >/dev/null && break; sleep 0.2; done

cd "$root"
pnpm --filter @huponx/admin build >/dev/null
# the same build, pointed at this run's gateway
printf 'window.__env__ = { API_BASE: "http://localhost:%s" };\n' "$GK_PORT" > apps/admin/dist/config.js
(cd apps/admin && pnpm exec vite preview --port "$UI_PORT" --strictPort >"$tmp/preview.log" 2>&1) & upid=$!
trap 'kill ${ipid:-0} ${gpid:-0} ${upid:-0} 2>/dev/null || true; rm -rf "$tmp"' EXIT
for _ in $(seq 1 50); do curl -fs "$ui/" >/dev/null && break; sleep 0.2; done
E2E_BASE_URL=$ui E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@example.com}" E2E_ADMIN_PASSWORD="$SETUP_ADMIN_PASSWORD" \
  pnpm exec playwright test -c e2e/playwright.config.ts "$@" \
  || { echo '--- gatekeeper log'; tail -20 "$tmp/gatekeeper.log"; echo '--- identity log'; tail -20 "$tmp/identity.log"; exit 1; }
