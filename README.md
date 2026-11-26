# web

Web clients of the platform: a pnpm workspace (React 18, TypeScript, Vite).

```
packages/auth-client   @huponx/auth-client  session client of the gateway: createClient, AuthProvider, useAuth,
                                            RequireAuth, Can, permission matcher
packages/ui-kit        @huponx/ui-kit       shadcn/ui + Tailwind + Radix: components, light/dark/system theme, app shell
                                            (collapsible sidebar, header with breadcrumb and avatar menu); admin, auth, bill and dict
apps/dict              dictionary: look words up (English, English-Vietnamese), save words, export an Anki deck,
                                            copy input or result as an Anki card (routes `/api/dictionary/...`, permissions
                                            `dictionary:word:read` and `:write`)
apps/bill              same frame for the bill service (i18n en/vi, account menu with the way back to the portal; no business pages yet)
apps/portal            the root domain (example.com): the apps the user may use (cards from `APPS`, filtered by permission),
                       profile (name, language, theme, picture), security (change password, link to MFA); see "Portal" below
apps/admin             administration of identity: users, roles, clients, exchange policies, MFA per user
apps/auth              the pages of sign in (login, MFA, forced password change, forgot/reset password, account MFA,
                       sign out confirmation) with the same ui-kit; served by identity, see "Auth pages" below
build/<app>/Dockerfile one image per app (nginx-unprivileged, port 8080); build/nginx has the shared config
charts/<app>           Helm chart: the `web-application` chart as dependency (alias `application`)
e2e/                   Playwright against a real identity + gatekeeper
.github/               ci.yaml (5 apps, language node) and the four workflows of huponx/actions
```

## Auth pages (`apps/auth`)

The pages people see while signing in are not a service of their own: the identity service serves them from the
same origin (so the `sid` and `csrf` cookies, the CSRF check and the redirects of the OAuth flow keep working with
no CORS) and answers their JSON calls under `/auth-api/*`.

- The paths are the ones identity always had (`/login`, `/login/mfa`, `/login/password`, `/password/forgot`,
  `/password/reset`, `/account/mfa`, `/register` when `IDENTITY_REGISTRATION_ENABLED`) plus `/logout` (confirmation) and `/error?e=<code>`.
- The CI builds the image `ghcr.io/huponx/auth-ui:<tag>`; the identity Dockerfile copies its
  `/usr/share/nginx/html` into `/ui` (`ARG AUTH_UI_IMAGE`). A new version of the pages reaches users with the next
  identity release: bump the tag in `identity/build/identity/Dockerfile` (`identity/scripts/check-auth-ui.sh` fails the
  identity PR when the tag does not exist). Release order: web (publishes `auth-ui`), then the tag bump, then identity.
  `auth-ui` is never deployed on its own: all its environments are disabled in `.github/config/ci.yaml`
  (`create-deployment-pr`), so there is no deployment PR and no file in mm-deploy. The package must be readable by the
  identity repository's workflows (public, or "Manage Actions access" on the package).
- No runtime config and no gateway: the app talks to `/auth-api` on its own origin. `make dev-auth` starts Vite on
  :3003 and proxies `/auth-api` to a local identity (`IDENTITY_URL`, default http://localhost:8080) with that
  identity's Origin; or build (`pnpm --filter @huponx/auth build`) and start identity with
  `IDENTITY_UI_DIR=<web>/apps/auth/dist`.
- The e2e run (`make e2e`) builds the app and starts identity with `IDENTITY_UI_DIR` pointing at the build.

**Theme per account.** The theme (light/dark/system) lives in `identity_users.theme` (migration V12), so every app shows the same one although each origin has its own `localStorage`. The sign in pages take it from the answer of `/auth-api/login` and `/auth-api/apps`; the admin app applies it when the profile is first read (`GetMe`) and saves a change of the switch with `UpdateMe`. A change reaches another app at its next load. Before sign in the pages use what this origin saved last. A new app with a theme switch does the same as `useMyProfile` in `apps/admin/src/AccountMenu.tsx`.

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

Other keys, all optional:

| Key | App | Meaning |
| --- | --- | --- |
| `PORTAL_URL` | admin, dict, bill | address of the portal (`https://example.com`; `http` only on localhost). The user menu then has "Back to the portal". Without it, or with an address that is malformed or not https, there is no item. Local default: `http://localhost:3004`. `AccountMenu` of the kit takes it as `portal` (`portalHref` checks the address), so a new app adds the item the same way |
| `APPS` | portal | the cards of the home page, see "Portal" |

## Develop

```sh
make install
make dev-admin        # http://localhost:3002 (dict :3000, bill :3001, portal :3004)
make ci               # lint, typecheck, test, build
```

Local gateway: run identity and gatekeeper (see `gatekeeper/scripts/e2e.sh` for a complete recipe) on
`http://localhost:8081` (identity on its default 8080/9090, see LOCAL.md at the workspace root) with `GATEKEEPER_UI_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3004`
and the routes of the chart (`make routes` in `gatekeeper`).

## Portal (`apps/portal`)

The app of the root domain (`example.com`): after the sign in the user sees the applications they may use, and keeps
their own account. Local: `make dev-portal` (http://localhost:3004).

- **Home** (`/`): a card per application. The list is the runtime configuration `APPS` of `config.js`, a JSON string
  `[{"name","url","icon?","perm?","widget?"}]` (`src/lib/apps.ts` parses it safely: a broken value is an empty list, an address
  must be https, http only on localhost). A card with a `perm` shows only for a user who holds it (`can(perm)`), so the
  roles decide what appears (`member`: Dict, `billing`: Bill); the gateway still checks the permission on every call.
  `icon` is the name of a picture of the portal (`book-open`, `receipt`, `layout-grid`), never an address: the CSP loads
  no picture from another origin. Admin is not listed on purpose: whoever needs it types the URL.
  `widget` (only `dict-review` so far; an unknown value is ignored) replaces the plain card by a panel. The Dict panel
  (`src/components/DictPanel.tsx`) reads `GET /api/dictionary/review?limit=1` (permission `dictionary:word:read`, so it is
  not called without it) and shows New / Learning / To review, the saved words, and either "Start reviewing" (a link to
  `<dict>/review`) or "all caught up" with the time to come back. A failure shows a muted note and keeps the link to the
  app. The counts are read again when the tab becomes visible. Bill keeps the plain card.
- **Profile** (`/profile`): name, language, theme (`PUT /api/me`) and picture (`PUT /api/me/avatar`); the e-mail and the
  roles are read only. The saved language and theme apply at once.
  The picture control (`AvatarUpload` in ui-kit, shared with admin) lets the user drag and zoom the square to keep before
  it is resized to 256x256; the crop math is in `packages/ui-kit/src/lib/crop.ts`.
- **Security** (`/security`): change the password (`POST /api/me/password`: current password, new password with the
  policy of identity; the answer ends every session, so the page offers "Sign in again") and multi-factor
  authentication on the page itself (`GET`/`POST /api/me/mfa`, `POST /api/me/mfa/disable`: QR code, first code,
  recovery codes, turn off with password and code; hidden when MFA is off on the server).
- All of them are public routes of the gateway (a signed in user, no permission). Registration is not here: a visitor has
  no session, so it lives in the sign in pages (`/register`, `POST /auth-api/register`, off unless
  `IDENTITY_REGISTRATION_ENABLED`).
- Texts: `src/i18n/{en,vi}.json`; every server error is translated by `translateApiError` (`errors.reason.*`).

## Admin app

**Home.** Greets the user by name and shows four numbers (users with `+N this month`, active users with their share of all users, roles with the number of catalog permissions, pending users), quick actions (add user, create role, add client, add exchange policy) and the system status (ArgoCD applications, health and sync, through `GET /api/system/status` of gatekeeper). Each card, action and the status card appear only for a user who holds the permission to read or write what they stand for (`identity:user:read`, `identity:role:read`, `identity:permission:read`, `identity:*:write`, `system:status:read`); without that permission nothing is called. The status card stays hidden when gatekeeper has no ArgoCD configured (404). The cards of users link to `/users`, `/users?status=active`, `/users?status=pending` and `/roles`.

| Page | Needs | Does |
| --- | --- | --- |
| Users | `identity:user:read` (+ write, role, mfa) | list with search by email prefix; **Add** (`/users/new`) and **Edit** (`/users/:id`) are pages of their own (breadcrumb Home > Users > Add/Edit): profile with a picture, language, roles as cards with a checkbox, disable/enable, resend welcome email, send password reset, MFA of the user |
| Settings | none (any signed-in user) | **Profile**: own name and picture (`GET/PUT /api/me`, `PUT /api/me/avatar`; identity takes the user from the token), theme, language, session. The header reads the picture and name from `/api/me`. Changing the language also writes `identity_users.locale`; at the first load the language of the account is used unless this browser already has a choice (`lang-chosen` in localStorage) |
| Roles & Permissions | `identity:role:read` (+ write); `identity:permission:read` (+ write) | two tabs. **Roles**: list with how many users/clients hold each role, **Add role** (`/roles/new`) and **Manage** (`/roles/:name`, breadcrumb Home > Roles & Permissions > Add/Edit) are pages of their own: description and permissions as checkboxes of the **permission catalog** (`identity_permissions`, grouped by prefix, wildcards such as `*` or `identity:*:read` included; without `identity:permission:read` the permissions are typed as text); a role can be deleted (list or its page) only while no user and no client holds it. **Permissions** (needs `identity:permission:read`): the add form on top, then the catalog; with `identity:permission:write` add, describe and delete entries (a permission held by a role cannot be deleted, a role cannot get a permission that is not in the catalog) |
| Clients | `identity:client:read` (+ write) | list; **Add client** (`/clients/new`, secret shown once) and **Manage** (`/clients/:id`) are pages of their own: name, redirect and logout URIs, grants, scopes, resource and roles (cards, like the user page) can be changed, the id and the type cannot; rotate the secret; **Disable/Enable** and **Delete** (only a disabled client, typing its id; roles and exchange policies of the client go with it; never the client of your own session) |
| Exchange policies | `identity:exchange:read` (+ write) | list with a search (client, audience or scope) and an Audience filter, both answered by the backend; **Add policy** (`/exchange/new`) and **Manage** (`/exchange/edit?client=&audience=`) are pages of their own: max scope and chain depth can be changed, the client and the audience (the key) cannot; delete from the list or from the page |

Limits that come from the identity API: the id and the type of a client cannot be changed (create a new client), an admin cannot enroll an authenticator for a user (an admin can require MFA,
turn it off or reset it; the user enrolls on their own device), and an admin never sets or sees a password: a new user
gets a welcome email with a link (valid 7 days) to choose their own, and stays **Pending** until they do (then **Active**; the
Edit page can resend the mail). The profile picture is cropped to a square and resized to 256x256 (WebP, JPEG as fallback, about 40 KB at
most) in the browser before it is saved; identity validates it again (png/jpeg/webp, at most 64 KiB, 512x512) and stores it in the
database. Lists show the first letter of the name; the Edit page loads the picture of one user (`GET /api/users/{user_id}`).
Users are found with the search (`GET /api/users?query=`). The routes the app uses are in `gatekeeper/routes.yaml`
(in the cluster: the ConfigMap `gatekeeper-routes` rendered by the gatekeeper chart).

### UI of the admin

shadcn/ui components (new-york style, copied as source into `packages/ui-kit/src/components/ui`) on Tailwind v4
(`@tailwindcss/vite`) and Radix, icons from lucide-react. Colors, radius and the sidebar tokens are CSS variables
in `packages/ui-kit/src/styles.css` (`:root` and `.dark`).

- **Shell** (`AppShell`): the sidebar has the logo on top, the menu items (icon, then text) and Settings pinned at
  the bottom; a round button on its right edge collapses it to icons (state in `localStorage` key
  `sidebar-collapsed`; a drawer below `md`). The header has the breadcrumb on the left and, on the right, the theme
  button, then the name of the user with the avatar; a click on them opens a menu with Settings, Language and
  Sign out.
- **Theme**: light, dark or system; one icon button, each click moves on (system, light, dark) (`localStorage` key `theme`, class `dark` on `<html>`). `public/theme-init.js`
  sets it before the first paint.
- **i18n**: i18next, English and Vietnamese (`apps/admin/src/i18n/{en,vi}.json`). The language comes from the
  user's choice (`localStorage` key `lang`), then from the browser, then English; `<html lang>` follows. Messages
  that the server returns are shown as they are.
- **CSP**: the apps send `script-src 'self'; style-src 'self'` (no inline script or style, no external font), so
  the kit has its own `ThemeProvider` (no next-themes), no toast library, a system font stack, and an alias of
  `react-remove-scroll-bar` (it injects a `<style>`; see `packages/ui-kit/src/csp`). Do not add a library that
  injects styles or scripts at runtime without checking it against the CSP in a browser.
- **Add a page**: one entry in `apps/admin/src/routes.tsx` (`path`, `labelKey`, `icon`, `perm`, `element`); the
  sidebar, the breadcrumb and the permission guard all read that table. Add the `nav.<name>` text to both
  language files.
- **Add a language**: `apps/admin/src/i18n/<code>.json` (same keys as `en.json`; a test compares them) and an entry
  in `languages` of `apps/admin/src/i18n/index.ts`.
- **Add a shadcn component**: `components.json` of `packages/ui-kit` is set up for the shadcn CLI (Vite, no RSC),
  but the kit imports with relative paths, not the `@/` alias (the alias belongs to the admin app). After adding a
  component with the CLI, change its `@/` imports to relative ones and export it from `src/index.ts`.

## Tests

- `make test`: vitest (jsdom) in every package: permission matcher, client, components, menu per permission, shell
  (collapse, breadcrumb, avatar menu), theme and language switch, same keys in both language files.
- `make e2e`: builds identity and gatekeeper from the sibling checkouts, starts them with the shipped routes and
  drives Chromium: sign in, create a role, list, sign out (from the avatar menu), create a user, theme and
  language switch, sidebar collapse, and a user without permissions who sees no menu entries and gets 403. Needs Postgres with the identity schema and Redis
  (`POSTGRES_*`, `REDIS_*`), Go, openssl and `pnpm exec playwright install chromium`.

## Deploy

`.github/config/ci.yaml` declares three apps (`language: node`: the shared workflows run `pnpm lint`,
`pnpm typecheck` and `pnpm test` once, then build, scan and push each image and chart). A merge to `main` opens
the deployment PR in `huponx/mm-deploy` (`applications/<env>/{dict,bill,admin}.yaml`). Charts need the
`web-application` chart published to `oci://ghcr.io/huponx/charts`; run `helm dependency build charts/<app>`
before `helm lint`/`helm template` (use `-f charts/<app>/ci/full-values.yaml`).

Images (`nginxinc/nginx-unprivileged:alpine-slim` plus `apk upgrade` at build time, uid 101, port 8080; no known CVE at the last scan, rebuild regularly to keep it so): `make docker` builds `ghcr.io/huponx/{dict,bill,admin}` from `build/<app>/Dockerfile`. The charts `charts/{dict,bill,admin}` wrap the `web-application` chart (dependency alias `application`, values under `application:`). `version`, `appVersion` and `image.tag` are written at release time by the CI; the committed values only keep `helm template` working.

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
   - after the first publish set `targetRevision` in `applications/<env>/{dict,bill,admin,portal}.yaml` to the published version; later versions come from the deployment PRs.

7. **Per environment** (the apps only work together with the gateway):
   - hosts of the apps and `API_BASE` (the gateway URL) in `applications/<env>/{dict,bill,admin,portal}.yaml` (the portal sits on the root domain, and also has `APPS`; admin, dict and bill also have `PORTAL_URL`, the root domain of the environment);
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
