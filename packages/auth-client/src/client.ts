// Client of the gatekeeper gateway (api.example.com) for the web apps. The browser never holds a
// token: the gateway sets an HttpOnly session cookie, so every call is made with
// `credentials: "include"`. Unsafe methods also carry the CSRF token that /auth/me returns.

/** The signed in user, as /auth/me returns it. */
export interface Me {
  sub: string;
  /** Display name and e-mail from the ID token (absent when identity did not send them). */
  name?: string;
  email?: string;
  roles: string[];
  scopes: string[];
  perms: string[];
  amr: string[];
  csrf_token: string;
  expires_at: string;
}

/** An error answer of the gateway: `{"error": {"code": "...", "message": "..."}}`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface ClientOptions {
  /** Address of the gateway, for example https://api.example.com. */
  apiBase: string;
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Moves the browser to a URL (login, logout). Defaults to `location.assign`. */
  navigate?: (url: string) => void;
  /** Current URL, the default `return_to` of the login. */
  href?: () => string;
  /** Origin of this web app, the target of the logout. */
  origin?: () => string;
  /** Remembers the last login attempt to stop redirect loops. Defaults to sessionStorage. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  /** Clock, for tests. */
  now?: () => number;
}

export interface AuthClient {
  readonly apiBase: string;
  /** The current user, or null when nobody is signed in. Cached; `refresh` asks the gateway again. */
  me(opts?: { refresh?: boolean }): Promise<Me | null>;
  /** Gateway URL that starts the login and comes back to `returnTo`. */
  loginUrl(returnTo?: string): string;
  /** Moves the browser to the login. */
  login(returnTo?: string): void;
  /** True when a login started a moment ago and there is still no session (cookies blocked?). */
  loginLooped(): boolean;
  /** Ends the session and moves the browser to the end-session URL of identity. */
  logout(): Promise<void>;
  /** JSON call to a route of the gateway. A 401 starts the login. */
  api<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

const ATTEMPT_KEY = "auth:login-attempt";
const LOOP_WINDOW_MS = 15_000;

function bodyError(status: number, text: string): ApiError {
  try {
    const e = (JSON.parse(text) as { error?: { code?: string; message?: string } }).error;
    if (e) return new ApiError(status, e.code ?? "error", e.message ?? `HTTP ${status}`);
  } catch {
    // not JSON: a proxy or a gateway outage
  }
  return new ApiError(status, status >= 500 ? "unavailable" : "error", `HTTP ${status}`);
}

export function createClient(opts: ClientOptions): AuthClient {
  const apiBase = opts.apiBase.replace(/\/+$/, "");
  if (!apiBase) throw new Error("auth-client: apiBase is required");
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let lastLogin: number | undefined;
  const navigate = opts.navigate ?? ((url: string) => window.location.assign(url));
  const href = opts.href ?? (() => window.location.href);
  const origin = opts.origin ?? (() => window.location.origin);
  const now = opts.now ?? Date.now;
  const storage = opts.storage ?? (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

  let current: Promise<Me | null> | undefined;

  async function fetchMe(): Promise<Me | null> {
    const r = await doFetch(`${apiBase}/auth/me`, { credentials: "include", headers: { Accept: "application/json" } });
    if (r.status === 401) return null;
    if (!r.ok) throw bodyError(r.status, await r.text());
    const me = (await r.json()) as Me;
    storage?.removeItem(ATTEMPT_KEY);
    return me;
  }

  const client: AuthClient = {
    apiBase,

    me(o) {
      if (!current || o?.refresh) {
        const p = fetchMe();
        current = p;
        p.catch(() => {
          if (current === p) current = undefined; // a failure is not cached
        });
      }
      return current;
    },

    loginUrl(returnTo) {
      return `${apiBase}/auth/login?return_to=${encodeURIComponent(returnTo ?? href())}`;
    },

    login(returnTo) {
      // One sign-in at a time: React StrictMode runs effects twice in dev, and two
      // /auth/login calls would overwrite the single state cookie (invalid_state).
      const t = now();
      if (lastLogin !== undefined && t - lastLogin < 3000) return;
      lastLogin = t;
      storage?.setItem(ATTEMPT_KEY, String(t));
      navigate(client.loginUrl(returnTo));
    },

    loginLooped() {
      const at = Number(storage?.getItem(ATTEMPT_KEY) ?? 0);
      return at > 0 && now() - at < LOOP_WINDOW_MS;
    },

    async logout() {
      const me = await client.me();
      let target = `${origin()}/`;
      if (me) {
        const r = await doFetch(`${apiBase}/auth/logout?return_to=${encodeURIComponent(target)}`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Csrf-Token": me.csrf_token },
        });
        if (!r.ok) throw bodyError(r.status, await r.text());
        target = ((await r.json()) as { logout_url?: string }).logout_url ?? target;
      }
      current = Promise.resolve(null);
      storage?.removeItem(ATTEMPT_KEY);
      navigate(target);
    },

    async api<T>(method: string, path: string, body?: unknown): Promise<T> {
      const m = method.toUpperCase();
      const unsafe = m !== "GET" && m !== "HEAD";

      const send = async (csrf?: string): Promise<Response> => {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (csrf) headers["Csrf-Token"] = csrf;
        let payload: string | undefined;
        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
          payload = JSON.stringify(body);
        }
        return doFetch(`${apiBase}${path.startsWith("/") ? path : `/${path}`}`, {
          method: m,
          credentials: "include",
          headers,
          body: payload,
        });
      };

      const unauthenticated = (): never => {
        current = Promise.resolve(null);
        client.login();
        throw new ApiError(401, "unauthenticated", "sign in first");
      };

      let csrf: string | undefined;
      if (unsafe) {
        const me = await client.me();
        if (!me) return unauthenticated();
        csrf = me.csrf_token;
      }
      let r = await send(csrf);
      if (r.status === 403 && unsafe) {
        // the CSRF token belongs to a session that was replaced: ask for the new one once
        const err = bodyError(r.status, await r.clone().text());
        if (err.code === "bad_csrf") {
          const me = await client.me({ refresh: true });
          if (!me) return unauthenticated();
          r = await send(me.csrf_token);
        }
      }
      if (r.status === 401) return unauthenticated();
      const text = await r.text();
      if (!r.ok) throw bodyError(r.status, text);
      return (text ? JSON.parse(text) : undefined) as T;
    },
  };
  return client;
}
