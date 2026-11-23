import type { AuthClient } from "@huponx/auth-client";
import { useAuth } from "@huponx/auth-client";
import { useCallback, useEffect, useMemo, useState } from "react";

// The gateway answers with protojson: camelCase names, int64 as strings, enums by name.

export interface Role {
  name: string;
  description: string;
  permissions: string[];
  /** Users and clients that hold the role (int64: a string); a role that is held cannot be deleted. */
  assignedCount?: string;
}

export type ClientType = "CLIENT_TYPE_PUBLIC" | "CLIENT_TYPE_CONFIDENTIAL";

export interface IdentityClient {
  clientId: string;
  name: string;
  type: ClientType;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  backchannelLogoutUri: string;
  allowedGrants: string[];
  allowedScopes: string[];
  resource: string;
  roles: string[];
  disabled?: boolean;
}

/** An entry of the permission catalog; role_count is an int64, so it arrives as a string. */
export interface Permission {
  name: string;
  description?: string;
  roleCount?: string;
}

export interface ExchangePolicy {
  clientId: string;
  audience: string;
  maxScope: string;
  maxChainDepth: number;
}

export type UserStatus = "USER_STATUS_PENDING" | "USER_STATUS_ACTIVE" | "USER_STATUS_DISABLED";

export interface User {
  id: string;
  email: string;
  name: string;
  locale: string;
  disabled: boolean;
  roles: string[];
  mfaEnabled: boolean;
  mfaEnforced: boolean;
  createdAt: string;
  /** Pending until the user sets a password; absent in answers of an older identity. */
  status?: UserStatus;
  /** light, dark or system; absent until the user chose one. */
  theme?: string;
  hasAvatar?: boolean;
  /** The picture as a data URI; only the call of a single user (getUser) fills it. */
  avatar?: string;
  /** Unix seconds (a string, as int64 is in JSON) of the last sign in; "0" or absent: never. */
  lastLoginAt?: string;
}

/** What the users list can be narrowed by; an empty field matches everyone. */
export interface UserFilter {
  /** Email prefix. */
  email?: string;
  /** Part of the name. */
  name?: string;
  status?: "" | "pending" | "active" | "disabled";
  role?: string;
}

/** Counts over all users (int64 fields arrive as strings). */
export interface UserStats {
  total?: string;
  active?: string;
  pending?: string;
  disabled?: string;
  mfaEnabled?: string;
  mfaEnforced?: string;
  withAvatar?: string;
  signedIn30d?: string;
  neverSignedIn?: string;
  createdThisMonth?: string;
}

/** One application of the system status (ArgoCD, through the gateway). */
export interface SystemApp {
  name: string;
  /** Synced, OutOfSync or Unknown. */
  sync: string;
  /** Healthy, Progressing, Degraded, Suspended, Missing or Unknown. */
  health: string;
  revision?: string;
  /** RFC 3339 time of the last finished sync. */
  syncedAt?: string;
}

/** The status of a user, with a fallback for answers that carry only `disabled`. */
export function statusOf(u: Pick<User, "status" | "disabled">): "pending" | "active" | "disabled" {
  if (u.status === "USER_STATUS_PENDING") return "pending";
  if (u.status === "USER_STATUS_DISABLED" || u.disabled) return "disabled";
  return "active";
}

export interface NewUser {
  email: string;
  name: string;
  locale: string;
  roles: string[];
  send_welcome: boolean;
}

/** An encoded picture ready to store: base64 of the bytes and the media type. */
export interface AvatarImage {
  image: string;
  mime_type: string;
}

export interface UserMfa {
  enabled: boolean;
  enforced: boolean;
  mode: string;
  recoveryCodesLeft: number;
}

export interface NewClient {
  client_id: string;
  name: string;
  type: ClientType;
  redirect_uris: string[];
  post_logout_redirect_uris: string[];
  backchannel_logout_uri?: string;
  allowed_grants: string[];
  allowed_scopes: string[];
  resource: string;
  roles: string[];
}

const e = encodeURIComponent;

/** One page of a list: the items and the token of the next page ("" on the last one). */
export interface Page<T> {
  items: T[];
  next: string;
}

/** Page size of the list pages of the admin. */
const PAGE_SIZE = 25;

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

/** Follows the page tokens until the list is complete (for pickers, which need every item). */
async function drain<T>(page: (token: string) => Promise<Page<T>>): Promise<T[]> {
  const out: T[] = [];
  let token = "";
  do {
    const p = await page(token);
    out.push(...p.items);
    token = p.next;
  } while (token);
  return out;
}

/** Typed calls of the routes in gatekeeper/routes.yaml. */
export function identityApi(c: AuthClient) {
  const rolesPage = (q: string, token: string, size?: string): Promise<Page<Role>> =>
    c
      .api<{ roles?: Role[]; nextPageToken?: string }>("GET", `/api/roles${query({ query: q, page_size: size, page_token: token })}`)
      .then((r) => ({ items: r.roles ?? [], next: r.nextPageToken ?? "" }));
  const permissionsPage = (q: string, token: string, size?: string): Promise<Page<Permission>> =>
    c
      .api<{ permissions?: Permission[]; nextPageToken?: string }>("GET", `/api/permissions${query({ query: q, page_size: size, page_token: token })}`)
      .then((r) => ({ items: r.permissions ?? [], next: r.nextPageToken ?? "" }));
  const clientsPage = (f: { query?: string; type?: ClientType }, token: string, size?: string): Promise<Page<IdentityClient>> =>
    c
      .api<{ clients?: IdentityClient[]; nextPageToken?: string }>(
        "GET",
        `/api/clients${query({ query: f.query, type: f.type, page_size: size, page_token: token })}`,
      )
      .then((r) => ({ items: r.clients ?? [], next: r.nextPageToken ?? "" }));
  const policiesPage = (
    f: { clientId?: string; query?: string; audience?: string },
    token: string,
    size?: string,
  ): Promise<Page<ExchangePolicy>> =>
    c
      .api<{ policies?: ExchangePolicy[]; nextPageToken?: string }>(
        "GET",
        `/api/exchange-policies${query({ client_id: f.clientId, query: f.query, audience: f.audience, page_size: size, page_token: token })}`,
      )
      .then((r) => ({ items: r.policies ?? [], next: r.nextPageToken ?? "" }));

  return {
    // roles
    /** Every role (follows the pages); see listRolesPage for a single page. */
    listRoles: (q = "") => drain((t) => rolesPage(q, t)),
    listRolesPage: (q = "", token = "") => rolesPage(q, token, String(PAGE_SIZE)),
    createRole: (role: Role) => c.api<{ role: Role }>("POST", "/api/roles", { role }).then((r) => r.role),
    setRolePermissions: (role: string, permissions: string[]) =>
      c.api<{ role: Role }>("PUT", `/api/roles/${e(role)}/permissions`, { permissions }).then((r) => r.role),
    updateRole: (name: string, role: { description: string; permissions: string[] }) =>
      c.api<{ role: Role }>("PUT", `/api/roles/${e(name)}`, role).then((r) => r.role),
    deleteRole: (name: string) => c.api<unknown>("DELETE", `/api/roles/${e(name)}`),
    // permission catalog
    listPermissions: (q = "") => drain((t) => permissionsPage(q, t)),
    listPermissionsPage: (q = "", token = "") => permissionsPage(q, token, String(PAGE_SIZE)),
    createPermission: (p: { name: string; description: string }) =>
      c.api<{ permission: Permission }>("POST", "/api/permissions", { permission: p }).then((r) => r.permission),
    updatePermission: (name: string, description: string) =>
      c.api<{ permission: Permission }>("PUT", `/api/permissions/${e(name)}`, { description }).then((r) => r.permission),
    deletePermission: (name: string) => c.api<unknown>("DELETE", `/api/permissions/${e(name)}`),
    assignRole: (role: string, who: { user_id?: string; client_id?: string }) =>
      c.api<unknown>("POST", `/api/roles/${e(role)}/assignments`, who),
    revokeRole: (role: string, who: { user_id?: string; client_id?: string }) => {
      const q = new URLSearchParams(who as Record<string, string>);
      return c.api<unknown>("DELETE", `/api/roles/${e(role)}/assignments?${q}`);
    },

    // clients
    listClients: (f: { query?: string; type?: ClientType } = {}) => drain((t) => clientsPage(f, t)),
    listClientsPage: (f: { query?: string; type?: ClientType } = {}, token = "") => clientsPage(f, token, String(PAGE_SIZE)),
    createClient: (client: NewClient) =>
      c.api<{ client: IdentityClient; clientSecret: string }>("POST", "/api/clients", { client }),
    updateClient: (id: string, fields: Omit<NewClient, "client_id" | "type">) =>
      c.api<{ client: IdentityClient }>("PUT", `/api/clients/${e(id)}`, fields).then((r) => r.client),
    setClientDisabled: (id: string, disabled: boolean) =>
      c.api<{ client: IdentityClient }>("PUT", `/api/clients/${e(id)}/disabled`, { disabled }).then((r) => r.client),
    deleteClient: (id: string) => c.api<unknown>("DELETE", `/api/clients/${e(id)}`),
    rotateSecret: (id: string) =>
      c.api<{ clientSecret: string }>("POST", `/api/clients/${e(id)}/rotate-secret`).then((r) => r.clientSecret),

    // token exchange
    listPolicies: (f: { clientId?: string; query?: string; audience?: string } = {}) => drain((t) => policiesPage(f, t)),
    listPoliciesPage: (f: { clientId?: string; query?: string; audience?: string } = {}, token = "") =>
      policiesPage(f, token, String(PAGE_SIZE)),
    setPolicy: (policy: ExchangePolicy, del = false) =>
      c.api<unknown>("PUT", "/api/exchange-policies", {
        policy: { client_id: policy.clientId, audience: policy.audience, max_scope: policy.maxScope, max_chain_depth: policy.maxChainDepth },
        delete: del,
      }),

    // the signed in user: no permission needed, the user is the one of the session
    getMe: () => c.api<{ user: User }>("GET", "/api/me").then((r) => r.user),
    updateMe: (u: { name?: string; locale?: string; theme?: string }) => c.api<{ user: User }>("PUT", "/api/me", u).then((r) => r.user),
    /** Stores the picture; without one the picture is removed. */
    setMyAvatar: (a?: AvatarImage) => c.api<unknown>("PUT", "/api/me/avatar", a ?? {}),

    // users
    listUsers: (f: UserFilter | string, pageToken = "") => {
      const filter: UserFilter = typeof f === "string" ? { email: f } : f;
      const q = new URLSearchParams({ page_size: "25" });
      if (filter.email) q.set("query", filter.email);
      if (filter.name) q.set("name", filter.name);
      if (filter.status) q.set("status", `USER_STATUS_${filter.status.toUpperCase()}`);
      if (filter.role) q.set("role", filter.role);
      if (pageToken) q.set("page_token", pageToken);
      return c.api<{ users: User[]; nextPageToken: string }>("GET", `/api/users?${q}`);
    },
    getUserStats: () => c.api<UserStats>("GET", "/api/user-stats"),
    /** How many roles / catalog permissions there are (the `total` of a one item page). */
    countRoles: () => c.api<{ total?: string }>("GET", "/api/roles?page_size=1").then((r) => Number(r.total ?? 0)),
    countPermissions: () => c.api<{ total?: string }>("GET", "/api/permissions?page_size=1").then((r) => Number(r.total ?? 0)),
    /** The applications of the system (ArgoCD); fails with 404 when the gateway has no ArgoCD configured. */
    systemStatus: () => c.api<{ apps?: SystemApp[]; checkedAt?: string }>("GET", "/api/system/status"),
    getUser: (id: string) => c.api<{ user: User }>("GET", `/api/users/${e(id)}`).then((r) => r.user),
    createUser: (u: NewUser) => c.api<{ user: User }>("POST", "/api/users", u).then((r) => r.user),
    updateUser: (id: string, u: { name: string; locale: string }) =>
      c.api<{ user: User }>("PUT", `/api/users/${e(id)}`, u).then((r) => r.user),
    /** Stores the picture; without one the picture is removed. */
    setAvatar: (id: string, a?: AvatarImage) => c.api<unknown>("PUT", `/api/users/${e(id)}/avatar`, a ?? {}),
    sendWelcome: (id: string) => c.api<unknown>("POST", `/api/users/${e(id)}/welcome`),
    setDisabled: (id: string, disabled: boolean) => c.api<unknown>("PUT", `/api/users/${e(id)}/disabled`, { disabled }),
    sendReset: (id: string) => c.api<unknown>("POST", `/api/users/${e(id)}/password-reset`),

    // MFA
    getMfa: (id: string) => c.api<UserMfa>("GET", `/api/users/${e(id)}/mfa`),
    setMfa: (id: string, enabled: boolean) => c.api<unknown>("PUT", `/api/users/${e(id)}/mfa`, { enabled }),
    enforceMfa: (id: string, enforced: boolean) => c.api<unknown>("PUT", `/api/users/${e(id)}/mfa/enforced`, { enforced }),
    resetMfa: (id: string) => c.api<unknown>("POST", `/api/users/${e(id)}/mfa/reset`),
  };
}

export type IdentityApi = ReturnType<typeof identityApi>;

/** The calls bound to the signed in client; stable between renders so it can be a dependency. */
export function useIdentity(): IdentityApi {
  const { client } = useAuth();
  return useMemo(() => identityApi(client), [client]);
}

/** Splits a text of words separated by spaces, commas or new lines. */
export function words(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Loads data on mount and whenever `reload` is called. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(load, deps);
  useEffect(() => {
    let live = true;
    setError(undefined);
    fn().then(
      (d) => live && setData(d),
      (err) => live && setError(err),
    );
    return () => {
      live = false;
    };
  }, [fn, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: data === undefined && error === undefined, reload };
}

/**
 * A list read page by page with page tokens: the first page reloads with `deps` (the search), loadMore appends the
 * next one. `next` is empty when everything is loaded.
 */
export function usePaged<T>(load: (token: string) => Promise<Page<T>>, deps: readonly unknown[]) {
  const first = useLoad(() => load(""), deps);
  const [more, setMore] = useState<T[]>([]);
  // the token of the page after the last loaded one; undefined while only the first page is loaded
  const [token, setToken] = useState<string>();
  const action = useAction();
  useEffect(() => {
    setMore([]);
    setToken(undefined);
  }, [first.data]);
  const next = token ?? first.data?.next ?? "";
  const items = first.data ? [...first.data.items, ...more] : undefined;
  async function loadMore() {
    const r = await action.run(() => load(next));
    if (r) {
      setMore((m) => [...m, ...r.items]);
      setToken(r.next);
    }
  }
  return { items, loading: first.loading, error: first.error, reload: first.reload, next, loadMore, moreBusy: action.busy, moreError: action.error };
}

/** Runs an action and tracks busy, error and a success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState<string>();
  const run = useCallback(async <T,>(fn: () => Promise<T>, message?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    try {
      const r = await fn();
      if (message) setDone(message);
      return r;
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, done, run, clear: () => (setError(undefined), setDone(undefined)) };
}
