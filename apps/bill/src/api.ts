import { useAuth } from "@huponx/auth-client";
import type { AuthClient } from "@huponx/auth-client";
import { useMemo } from "react";

/** The account of the signed in user, as GetMe answers it. */
export interface Account {
  name: string;
  locale: string;
  /** light, dark or system; absent until the user chose one. */
  theme?: string;
  /** The picture as a data URI. */
  avatar?: string;
}

/** The calls of the app to its own account ("me" routes of the gateway: a signed in user, no permission). */
export function identityApi(c: AuthClient) {
  return {
    getMe: () => c.api<{ user: Account }>("GET", "/api/me").then((r) => r.user),
    updateMe: (u: { name?: string; locale?: string; theme?: string }) => c.api<{ user: Account }>("PUT", "/api/me", u).then((r) => r.user),
  };
}

export type IdentityApi = ReturnType<typeof identityApi>;

/** The calls bound to the signed in client; stable between renders so it can be a dependency. */
export function useIdentity(): IdentityApi {
  const { client } = useAuth();
  return useMemo(() => identityApi(client), [client]);
}
