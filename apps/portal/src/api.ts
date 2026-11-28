import { useAuth } from "@huponx/auth-client";
import type { AuthClient } from "@huponx/auth-client";
import type { SessionItem } from "@huponx/ui-kit";
import { useMemo } from "react";
import { mergeReviewSummaries, parseReviewSummary } from "./lib/review";
import type { ReviewSummary } from "./lib/review";

/** The account of the signed in user, as GetMe answers it. */
export interface Account {
  id: string;
  email: string;
  name: string;
  locale: string;
  roles: string[];
  /** light, dark or system; absent until the user chose one. */
  theme?: string;
  /** The picture as a data URI. */
  avatar?: string;
}

/** GetMyMFA: protobuf JSON leaves a false or zero field out. */
export interface MyMfa {
  enabled?: boolean;
  /** MFA is required for the account, so it cannot be turned off. */
  forced?: boolean;
  recoveryCodesLeft?: number;
}

/** A passkey as ListMyPasskeys answers it (protobuf JSON: int64 as a string of Unix seconds, false and 0 left out). */
export interface MyPasskey {
  id: string;
  name: string;
  createdAt?: string;
  lastUsedAt?: string;
  synced?: boolean;
}

/** An SSO session as ListMySessions answers it. */
export type MySession = SessionItem;

/** An encoded picture ready to store: base64 of the bytes and the media type. */
export interface AvatarImage {
  image: string;
  mime_type: string;
}

/** The calls of the portal. All of them are "me" routes of the gateway: a signed in user, no permission. */
export function identityApi(c: AuthClient) {
  return {
    getMe: () => c.api<{ user: Account }>("GET", "/api/me").then((r) => r.user),
    updateMe: (u: { name?: string; locale?: string; theme?: string }) => c.api<{ user: Account }>("PUT", "/api/me", u).then((r) => r.user),
    /** Stores the picture; without one the picture is removed. */
    setMyAvatar: (a?: AvatarImage) => c.api<unknown>("PUT", "/api/me/avatar", a ?? {}),
    /** The own multi-factor authentication: the status, or the QR code and key of the pending enrollment. */
    getMyMfa: () => c.api<MyMfa>("GET", "/api/me/mfa"),
    /** Starts the setup: the QR code and the key of the pending enrollment. */
    beginMyMfa: () => c.api<{ qr?: string; secret?: string }>("POST", "/api/me/mfa/setup", {}),
    confirmMyMfa: (code: string) => c.api<{ recoveryCodes?: string[] }>("POST", "/api/me/mfa", { code }),
    /** Replaces the recovery codes (the old ones stop working) after the password and a code of the authenticator app. */
    regenerateMyRecoveryCodes: (password: string, code: string) => c.api<{ recoveryCodes?: string[] }>("POST", "/api/me/mfa/recovery-codes", { password, code }),
    disableMyMfa: (password: string, code: string) => c.api<unknown>("POST", "/api/me/mfa/disable", { password, code }),
    /** The own passkeys; a 404 with the reason passkeys_off when the server has them turned off. */
    listMyPasskeys: () => c.api<{ passkeys?: MyPasskey[]; max?: number }>("GET", "/api/me/passkeys"),
    /** Checks the password; the options (a JSON string) are for navigator.credentials.create. */
    beginMyPasskey: (password: string) => c.api<{ ceremonyId?: string; optionsJson?: string }>("POST", "/api/me/passkeys/begin", { password }),
    finishMyPasskey: (ceremonyId: string, credential: unknown, name: string) =>
      c.api<{ passkey?: MyPasskey }>("POST", "/api/me/passkeys", { ceremony_id: ceremonyId, credential_json: JSON.stringify(credential), name }),
    renameMyPasskey: (id: string, name: string) => c.api<unknown>("PUT", `/api/me/passkeys/${encodeURIComponent(id)}`, { name }),
    deleteMyPasskey: (id: string, password: string) => c.api<unknown>("DELETE", `/api/me/passkeys/${encodeURIComponent(id)}`, { password }),
    /** The own sessions (browsers and devices), newest first; the one of this token has `current`. */
    listMySessions: () => c.api<{ sessions?: MySession[] }>("GET", "/api/me/sessions"),
    /** Ends one session; ending the current one is a sign out. A 404 session_not_found for an unknown id or one of another user. */
    revokeMySession: (id: string) => c.api<unknown>("DELETE", `/api/me/sessions/${encodeURIComponent(id)}`),
    /** Ends every session but the current one. */
    revokeMyOtherSessions: () => c.api<{ revoked?: number }>("POST", "/api/me/sessions/revoke-others", {}),
    /** Ends every session of the user when it works: the user signs in again. */
    changePassword: (currentPassword: string, newPassword: string) =>
      c.api<unknown>("POST", "/api/me/password", { current_password: currentPassword, new_password: newPassword }),
  };
}

export type IdentityApi = ReturnType<typeof identityApi>;

/** The calls bound to the signed in client; stable between renders so it can be a dependency. */
export function useIdentity(): IdentityApi {
  const { client } = useAuth();
  return useMemo(() => identityApi(client), [client]);
}

/** The calls of the portal to Dict; the gateway checks `dictionary:word:read`. */
export function dictionaryApi(c: AuthClient) {
  return {
    /**
     * The counts of the review queues of every group of the registry added up; `limit=1` keeps each answer small (it
     * still carries one card, which is dropped).
     */
    review: async (): Promise<ReviewSummary> => {
      const { groups } = await c.api<{ groups?: { id: string }[] }>("GET", "/api/dictionary/dictionaries");
      const parts = await Promise.all(
        (groups ?? []).map((g) =>
          c.api<Record<string, unknown>>("GET", `/api/dictionary/review?group=${encodeURIComponent(g.id)}&limit=1`).then(parseReviewSummary),
        ),
      );
      return mergeReviewSummaries(parts);
    },
  };
}

export type DictionaryApi = ReturnType<typeof dictionaryApi>;

export function useDictionary(): DictionaryApi {
  const { client } = useAuth();
  return useMemo(() => dictionaryApi(client), [client]);
}
