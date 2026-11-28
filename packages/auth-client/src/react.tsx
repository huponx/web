import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthClient, Me } from "./client";

export type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: Me }
  | { status: "unauthenticated" }
  | { status: "error"; error: Error };

export interface Auth {
  client: AuthClient;
  status: AuthState["status"];
  /** The signed in user (only when `status` is "authenticated"). */
  user: Me | undefined;
  /** Why the session could not be read (only when `status` is "error"). */
  error: Error | undefined;
  /**
   * Whether the user may call the route ("GET /api/users", a key of the gateway's routes.yaml) or holds the capability
   * ("bill.invoices"). The gateway computed the answer from the rules of the RPCs and enforces them again on every
   * call. An unknown key is false, so a typo hides the UI.
   */
  can: (route: string) => boolean;
  logout: () => Promise<void>;
  /** Asks the gateway again (after an error, or when roles changed). */
  reload: () => void;
}

const ROUTE_KEY = /^((GET|POST|PUT|PATCH|DELETE) \/\S*|[a-z][a-z0-9-]*(\.[a-z0-9-]+)+)$/;
const warned = new Set<string>();

/** In a dev build, says once about a key that is neither a route ("GET /api/users") nor a capability ("bill.invoices"). */
function warnIfMalformed(key: string) {
  if (!(import.meta as { env?: { DEV?: boolean } }).env?.DEV || ROUTE_KEY.test(key) || warned.has(key)) return;
  warned.add(key);
  console.warn(`can(${JSON.stringify(key)}): not a route key ("GET /api/users") nor a capability name ("bill.invoices")`);
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    client
      .me({ refresh: tick > 0 })
      .then((me) => {
        if (!cancelled) setState(me ? { status: "authenticated", user: me } : { status: "unauthenticated" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", error: e instanceof Error ? e : new Error(String(e)) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, tick]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setTick((t) => t + 1);
  }, []);

  const value = useMemo<Auth>(() => {
    const user = state.status === "authenticated" ? state.user : undefined;
    const set = new Set(user?.allowed ?? []);
    return {
      client,
      status: state.status,
      user,
      error: state.status === "error" ? state.error : undefined,
      can: (route) => {
        warnIfMalformed(route);
        return set.has(route);
      },
      logout: () => client.logout(),
      reload,
    };
  }, [client, state, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth must be used inside <AuthProvider>");
  return a;
}

export interface RequireAuthProps {
  children: ReactNode;
  /** Shown while the session is read or the browser moves to the login. */
  loading?: ReactNode;
  /** Shown instead of `loading` on the page the sign out returns to, while the browser moves to the login. */
  signingOut?: ReactNode;
  /** Shown when the session cannot be read (gateway down) or the login loops (cookies blocked). */
  error?: (e: { message: string; retry: () => void }) => ReactNode;
}

/** Renders the children for a signed in user; otherwise starts the login. */
export function RequireAuth({ children, loading = null, signingOut, error }: RequireAuthProps) {
  const auth = useAuth();
  const { client, status } = auth;
  const looped = status === "unauthenticated" && client.loginLooped();

  useEffect(() => {
    if (status === "unauthenticated" && !looped) client.login();
  }, [client, status, looped]);

  if (status === "authenticated") return <>{children}</>;
  if (status === "error" || looped) {
    const message = looped
      ? "The session cookie was not kept after sign in. Check that the browser accepts cookies from the API address."
      : (auth.error?.message ?? "The service is unavailable.");
    return <>{error ? error({ message, retry: auth.reload }) : message}</>;
  }
  return <>{signingOut !== undefined && client.signedOut() ? signingOut : loading}</>;
}

export interface CanProps {
  /** One route or capability (`ROUTES.listUsers`). */
  route?: string;
  /** Every one of these. */
  all?: string[];
  /** At least one of these. */
  any?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders the children only when the user may call the route(s). */
export function Can({ route, all, any, children, fallback = null }: CanProps) {
  const { can } = useAuth();
  let ok = false;
  if (route !== undefined) ok = can(route);
  else if (all) ok = all.every(can);
  else if (any) ok = any.some(can);
  return <>{ok ? children : fallback}</>;
}
