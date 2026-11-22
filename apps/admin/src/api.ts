import type { AuthClient } from "@huponx/auth-client";
import { useAuth } from "@huponx/auth-client";
import { useCallback, useEffect, useMemo, useState } from "react";

// The gateway answers with protojson: camelCase names, int64 as strings, enums by name.

export interface Role {
  name: string;
  description: string;
  permissions: string[];
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
}

export interface ExchangePolicy {
  clientId: string;
  audience: string;
  maxScope: string;
  maxChainDepth: number;
}

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
  allowed_grants: string[];
  allowed_scopes: string[];
  resource: string;
  roles: string[];
}

const e = encodeURIComponent;

/** Typed calls of the routes in gatekeeper/routes.yaml. */
export function identityApi(c: AuthClient) {
  return {
    // roles
    listRoles: () => c.api<{ roles: Role[] }>("GET", "/api/roles").then((r) => r.roles),
    createRole: (role: Role) => c.api<{ role: Role }>("POST", "/api/roles", { role }).then((r) => r.role),
    setRolePermissions: (role: string, permissions: string[]) =>
      c.api<{ role: Role }>("PUT", `/api/roles/${e(role)}/permissions`, { permissions }).then((r) => r.role),
    assignRole: (role: string, who: { user_id?: string; client_id?: string }) =>
      c.api<unknown>("POST", `/api/roles/${e(role)}/assignments`, who),
    revokeRole: (role: string, who: { user_id?: string; client_id?: string }) => {
      const q = new URLSearchParams(who as Record<string, string>);
      return c.api<unknown>("DELETE", `/api/roles/${e(role)}/assignments?${q}`);
    },

    // clients
    listClients: () => c.api<{ clients: IdentityClient[] }>("GET", "/api/clients").then((r) => r.clients),
    createClient: (client: NewClient) =>
      c.api<{ client: IdentityClient; clientSecret: string }>("POST", "/api/clients", { client }),
    rotateSecret: (id: string) =>
      c.api<{ clientSecret: string }>("POST", `/api/clients/${e(id)}/rotate-secret`).then((r) => r.clientSecret),

    // token exchange
    listPolicies: (clientId = "") =>
      c
        .api<{ policies: ExchangePolicy[] }>("GET", `/api/exchange-policies${clientId ? `?client_id=${e(clientId)}` : ""}`)
        .then((r) => r.policies),
    setPolicy: (policy: ExchangePolicy, del = false) =>
      c.api<unknown>("PUT", "/api/exchange-policies", {
        policy: { client_id: policy.clientId, audience: policy.audience, max_scope: policy.maxScope, max_chain_depth: policy.maxChainDepth },
        delete: del,
      }),

    // users
    listUsers: (query: string, pageToken = "") => {
      const q = new URLSearchParams({ page_size: "25" });
      if (query) q.set("query", query);
      if (pageToken) q.set("page_token", pageToken);
      return c.api<{ users: User[]; nextPageToken: string }>("GET", `/api/users?${q}`);
    },
    createUser: (u: { email: string; name: string; password: string; roles: string[] }) =>
      c.api<{ user: User }>("POST", "/api/users", u).then((r) => r.user),
    setDisabled: (id: string, disabled: boolean) => c.api<unknown>("PUT", `/api/users/${e(id)}/disabled`, { disabled }),
    setPassword: (id: string, password: string) => c.api<unknown>("PUT", `/api/users/${e(id)}/password`, { password }),
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
