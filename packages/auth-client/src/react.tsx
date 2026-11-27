import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthClient, Me } from "./client";
import { allowed, allowedAll, allowedAny } from "./permissions";
import type { Permission } from "@huponx/protogen";

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
   * Whether the user holds the permission (the gateway enforces it again). The names are the generated `P.*` constants
   * of `@huponx/protogen`, so a name that no longer exists fails `tsc`.
   */
  can: (perm: Permission) => boolean;
  logout: () => Promise<void>;
  /** Asks the gateway again (after an error, or when roles changed). */
  reload: () => void;
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
    return {
      client,
      status: state.status,
      user,
      error: state.status === "error" ? state.error : undefined,
      can: (perm) => allowed(user?.perms, perm),
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
  /** One permission (`P.identity.userRead`). */
  perm?: Permission;
  /** Every one of these. */
  all?: Permission[];
  /** At least one of these. */
  any?: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders the children only when the user holds the permission(s). */
export function Can({ perm, all, any, children, fallback = null }: CanProps) {
  const { user } = useAuth();
  const perms = user?.perms;
  let ok = false;
  if (perm !== undefined) ok = allowed(perms, perm);
  else if (all) ok = allowedAll(perms, ...all);
  else if (any) ok = allowedAny(perms, ...any);
  return <>{ok ? children : fallback}</>;
}
