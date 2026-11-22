# web

Web clients of the platform: a pnpm workspace (React 18, TypeScript, Vite).

```
packages/auth-client   @huponx/auth-client  session client of the gateway: createClient, AuthProvider, useAuth,
                                            RequireAuth, Can, permission matcher
packages/ui            @huponx/ui           layout, tables, forms, notices, modal (plain CSS)
apps/dict              frame app: login, header with user and sign out, permission gated menu, sample page
apps/bill              same frame for the bill service
apps/admin             administration of identity: users, roles, clients, exchange policies, MFA per user
build/<app>/Dockerfile one image per app (nginx-unprivileged, port 8080); build/nginx has the shared config
charts/<app>           Helm chart: the `web-application` chart as dependency (alias `application`)
e2e/                   Playwright against a real identity + gatekeeper
.github/               ci.yaml (3 apps, language node) and the four workflows of huponx/actions
```

## How the apps talk to the backend

Every app calls only **the gateway** (gatekeeper, e.g. `https://api.example.com`), never a service. The
browser holds a cookie session of the gateway (`__Host-session`, same registrable domain `*.example.com`),
so the apps are cross-origin with the gateway and use CORS with credentials. `createClient` does the rest:

- `me()` reads `/auth/me`; a 401 sends the browser to `/auth/login?return_to=<this page>` (with a loop guard).
- unsafe methods carry the `Csrf-Token` of the session (one retry when the token is stale).
- `logout()` posts `/auth/logout?return_to=<origin>/`: the origin must be a UI origin of the gateway
  (`GATEKEEPER_UI_ORIGINS`) and a post logout URI of the identity client:

  ```sh
  add https://admin.example.com/ to `post_logout_uris` in the `setup:` block of mm-deploy `identity.yaml` (identity setup Job)
  ```

The menu hides what the user cannot use (`<Can perm="identity:role:read">`), but that is only a courtesy: the
gateway and the service check the permission again on every call (403). Permission syntax: colon segments,
`*` alone is everything, a middle `*` is one segment, a trailing `*` is one or more.

## Runtime configuration

The image is the same in every environment. `index.html` loads `/config.js` before the app:

```js
window.__env__ = { API_BASE: "https://api.example.com" };
```

In a cluster the chart renders it from `application.config.runtime.data` into the ConfigMap
`<release>-runtime-config` and the app's values mount it over `/usr/share/nginx/html/config.js` (subPath).
For local development `apps/*/public/config.js` points at `http://localhost:8081`. nginx derives
`connect-src` of the Content-Security-Policy from the same `API_BASE` when the container starts
(`build/nginx/40-headers.sh`), so the CSP allows the gateway origin only; `frame-ancestors 'none'`.

## Develop

```sh
make install
make dev-admin        # http://localhost:3002 (dict :3000, bill :3001)
make ci               # lint, typecheck, test, build
```

Local gateway: run identity and gatekeeper (see `gatekeeper/scripts/e2e.sh` for a complete recipe) on
`http://localhost:8081` (identity on its default 8080/9090, see LOCAL.md at the workspace root) with `GATEKEEPER_UI_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002`
and the routes of the chart (`make routes` in `gatekeeper`).

## Admin app

| Page | Needs | Does |
| --- | --- | --- |
| Users | `identity:user:read` (+ write, role, mfa) | search by email prefix, create, disable/enable, set password, send reset, assign/revoke roles, MFA of the user |
| Roles | `identity:role:read` (+ write) | list, create, replace the permissions of a role |
| Clients | `identity:client:read` (+ write) | list, create (secret shown once), rotate the secret |
| Exchange policies | `identity:exchange:read` (+ write) | list, set, delete |

Limits that come from the identity API: a client cannot be edited after creation (use
the identity setup Job (`post_logout_uris` in `SETUP_CONFIG`)), an admin cannot enroll an authenticator for a user (an admin can require MFA,
turn it off or reset it; the user enrolls on their own device), and there is no get-user route: users are found
with the search (`GET /api/users?query=`). The routes the app uses are in `gatekeeper/routes.yaml`
(in the cluster: the ConfigMap `gatekeeper-routes` rendered by the gatekeeper chart).

## Tests

- `make test`: vitest (jsdom) in every package: permission matcher, client, components, menu per permission.
- `make e2e`: builds identity and gatekeeper from the sibling checkouts, starts them with the shipped routes and
  drives Chromium: sign in, create a role, list, sign out, create a user, and a user without permissions who
  sees no menu entries and gets 403. Needs Postgres with the identity schema and Redis
  (`POSTGRES_*`, `REDIS_*`), Go, openssl and `pnpm exec playwright install chromium`.

## Deploy

`.github/config/ci.yaml` declares three apps (`language: node`: the shared workflows run `pnpm lint`,
`pnpm typecheck` and `pnpm test` once, then build, scan and push each image and chart). A merge to `main` opens
the deployment PR in `huponx/mm-deploy` (`applications/<env>/{dict,bill,admin}.yaml`). Charts need the
`web-application` chart published to `oci://ghcr.io/huponx/charts`; run `helm dependency build charts/<app>`
before `helm lint`/`helm template` (use `-f charts/<app>/ci/full-values.yaml`).

Images (distroless-like, `nginx-unprivileged`, port 8080): `make docker` builds `ghcr.io/huponx/{dict,bill,admin}` from `build/<app>/Dockerfile`. The charts `charts/{dict,bill,admin}` wrap the `web-application` chart (dependency alias `application`, values under `application:`). `version`, `appVersion` and `image.tag` are written at release time by the CI; the committed values only keep `helm template` working.

## CI/CD

`.github/workflows/{pr,main,staging,production}.yml` call the reusable workflows of `huponx/actions` (`service-*.yml`):

| Flow | Trigger | Result |
|---|---|---|
| pr | pull request to `main` | lint, typecheck, test, build, Trivy scan, `helm lint`; nothing pushed |
| main | push to `main` | images and charts pushed (`1.YYYYMMDD.<run>-main-<sha7>`), deployment PR for `dev` in `mm-deploy` |
| staging | push to `release*` | pre-release `v<YYYY>.<MM>.N-release-<sha7>`, images and charts pushed, deployment PR for `staging` |
| production | release published | no build; verifies the images and charts of the release tag exist, deployment PR for `production` |

Required secret: `BOT_TOKEN` (write access to `mm-deploy`). `staging` and `production` are `enabled: false` in `ci.yaml` until their ArgoCD and `applications/<env>` exist.

## Setup (one time)

Commands use the [GitHub CLI](https://cli.github.com) (`gh auth login` first, with admin rights on the repositories). Package visibility and access are set in the GitHub UI (package settings).

1. **Publish `huponx/actions`**: a release exists and the floating `v1` tag points to it. A private repo must share it with the other repositories of the owner:

   ```bash
   gh release list -R huponx/actions --limit 3
   gh api repos/huponx/actions/git/ref/tags/v1 --jq .object.sha
   gh api -X PUT repos/huponx/actions/actions/permissions/access -f access_level=user   # private repo only
   ```

2. **Token for `mm-deploy`** (`GITHUB_TOKEN` cannot open PRs in another repository). A fine-grained PAT (repository `huponx/mm-deploy`: Contents and Pull requests write), or a GitHub App installed on `mm-deploy` (the App wins when `DEPLOY_APP_ID` is set):

   ```bash
   gh secret set BOT_TOKEN -R huponx/web                           # paste the token
   # or
   gh variable set DEPLOY_APP_ID -R huponx/web --body "<app id>"
   gh secret set DEPLOY_APP_PRIVATE_KEY -R huponx/web < app-private-key.pem
   ```

   Optional: `gh secret set SLACK_WEBHOOK_URL -R huponx/web` (and `slack-channel` in `ci.yaml`) for deployment PR notifications.

3. **Workflow permissions** (packages and the staging pre-release need write):

   ```bash
   gh api -X PUT repos/huponx/web/actions/permissions/workflow \
     -f default_workflow_permissions=write -F can_approve_pull_request_reviews=false
   ```

4. **GHCR packages**: after the first `main` run the packages `dict`, `bill`, `admin`, `charts/dict`, `charts/bill` and `charts/admin` exist. Link each to the repository (package settings, "Manage Actions access", role Write) and give the ArgoCD clusters pull access (public, or an image pull secret and an OCI repository credential in each ArgoCD). `web-application` must be readable from `oci://ghcr.io/huponx/charts`.

   ```bash
   gh api "/user/packages?package_type=container" --jq '.[].name'   # list the packages (use /orgs/<org>/packages for an org)
   ```

5. **Branch ruleset** for `main` (PR required, squash only, required checks of the `pr` flow, no force push or deletion). Merge the workflows to `main` first, while it is unprotected: status checks only show in the ruleset picker after they have run once. Save as `main-ruleset.json` (input only, do not commit):

   ```json
   {
     "name": "protect main",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
     "rules": [
       { "type": "deletion" },
       { "type": "non_fast_forward" },
       { "type": "pull_request", "parameters": {
           "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
           "require_code_owner_review": false, "require_last_push_approval": false,
           "required_review_thread_resolution": false,
           "allowed_merge_methods": ["squash"] } },
       { "type": "required_status_checks", "parameters": {
           "strict_required_status_checks_policy": true,
           "required_status_checks": [
             { "context": "pr / contract" },
             { "context": "pr / lint-test" },
             { "context": "pr / build / build (dict)" },
             { "context": "pr / build / build (bill)" },
             { "context": "pr / build / build (admin)" } ] } }
     ],
     "bypass_actors": []
   }
   ```

   ```bash
   REPO=huponx/web
   gh api repos/$REPO/rulesets --method POST --input main-ruleset.json
   gh api repos/$REPO/rulesets --jq '.[] | {id, name, enforcement}'   # verify
   ```

   Confirm the check names with `gh pr checks <pr>` after the first PR run. To change it later: `gh api repos/$REPO/rulesets/<id> --method PUT --input main-ruleset.json`. Rulesets on a private repo need a paid GitHub plan.

   Second ruleset for `release*`: a merge into it creates a staging pre-release, so it needs a PR with the same checks as `main` (the `pr` flow also runs on PRs into `release*`), and no force push or deletion. Save as `release-ruleset.json` and apply the same way:

   ```json
   {
     "name": "protect release branches",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["refs/heads/release*"], "exclude": [] } },
     "rules": [
       { "type": "deletion" },
       { "type": "non_fast_forward" },
       { "type": "pull_request", "parameters": {
           "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
           "require_code_owner_review": false, "require_last_push_approval": false,
           "required_review_thread_resolution": false,
           "allowed_merge_methods": ["merge", "squash"] } },
       { "type": "required_status_checks", "parameters": {
           "strict_required_status_checks_policy": false,
           "required_status_checks": [
             { "context": "pr / contract" },
             { "context": "pr / lint-test" },
             { "context": "pr / build / build (dict)" },
             { "context": "pr / build / build (bill)" },
             { "context": "pr / build / build (admin)" } ] } }
     ],
     "bypass_actors": []
   }
   ```

   ```bash
   gh api repos/$REPO/rulesets --method POST --input release-ruleset.json
   gh api repos/$REPO/rulesets --jq '.[] | {id, name}'   # id for a later PUT
   ```

   The ruleset applies to every `release*` branch, so create the first one (for example `release`) from `main` before applying it, or push it while the ruleset is not yet active.

6. **`mm-deploy`**: auto merge and the label (once for all services):

   ```bash
   gh repo edit huponx/mm-deploy --enable-auto-merge --delete-branch-on-merge
   gh label create automerge -R huponx/mm-deploy --color 0E8A16 --description "Merge automatically when checks pass" || true
   ```

   - required checks on `main`: `ci`, `diff`, `cve`, `pr-title`;
   - each ArgoCD (one per environment) has a root app with `path: applications/<env>`;
   - after the first publish set `targetRevision` in `applications/<env>/{dict,bill,admin}.yaml` to the published version; later versions come from the deployment PRs.

7. **Per environment** (the apps only work together with the gateway):
   - hosts of the apps and `API_BASE` (the gateway URL) in `applications/<env>/{dict,bill,admin}.yaml`;
   - each app origin in `GATEKEEPER_UI_ORIGINS` (`applications/<env>/gatekeeper.yaml`, one per line) and as a post logout URI of the `gatekeeper` client (`post_logout_uris` in the identity setup Job config, see the identity README);
   - the apps must share the registrable domain with the gateway, otherwise browsers block the session cookie;
   - the first admin comes from the identity setup Job (password from the Secret `identity-admin`, changed at the first login); the roles and permissions of other users are managed in the admin app.

8. **Environments**: staging and production are `enabled: false` in `.github/config/ci.yaml`; remove that line once their ArgoCD and `applications/<env>` exist. For production add `reviewers` and keep `automerge` off.

9. **Verify**:

   ```bash
   gh secret list -R huponx/web && gh variable list -R huponx/web
   gh run list -R huponx/web --workflow main.yml --limit 1     # after a merge into main
   gh run watch -R huponx/web
   gh pr list -R huponx/mm-deploy --label automerge            # the dev deployment PRs
   ```
