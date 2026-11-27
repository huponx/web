import { systemStyleOf } from "@huponx/ui-kit";
import type { SystemStyleReply } from "@huponx/ui-kit";

/** An error answer of /auth-api: the HTTP status, a stable `code` (the text comes from i18n) and the server message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A passkey ceremony that the browser or the authenticator refused (not a dismissed prompt); the code has its text. */
export class PasskeyError extends ApiError {
  constructor() {
    super(0, "passkey_failed", "The passkey could not be used.");
  }
}

/** What a step of the sign in answers: where to go next (a path of identity), when there is a next step. */
export interface Next {
  redirect?: string;
}

export interface MfaStatus {
  enabled: boolean;
  /** Recovery codes left (enabled). */
  codesLeft?: number;
  /** MFA is required for the account: it cannot be turned off (enabled), and enrolling cannot be skipped (not enabled yet). */
  forced?: boolean;
  /** Data URL of the QR code and the key to type (not enabled yet). */
  qr?: string;
  secret?: string;
}

async function call<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const e = data as { code?: string; message?: string };
    throw new ApiError(res.status, e.code ?? "internal", e.message ?? res.statusText);
  }
  return data as T;
}

// the token of the csrf cookie of this browser; the cookie is created by the first call
let csrf: string | undefined;

/** A passkey of the signed in user. */
export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  /** Never used when absent. */
  lastUsedAt?: string;
  /** Synced between the devices of its owner, not bound to one. */
  synced: boolean;
}

/** The options of a ceremony (the JSON of the web API) and the id the server wants back. */
export interface Ceremony {
  c: string;
  options: Record<string, unknown>;
}

/** What the second factor page offers: a code from an authenticator app, a passkey, or both. */
export interface MfaMethods {
  totp: boolean;
  passkey: boolean;
}

async function csrfToken(): Promise<string> {
  csrf ??= (await call<{ csrf: string }>("GET", "/auth-api/csrf")).csrf;
  return csrf;
}

/** Forgets the cached CSRF token (tests). */
export function resetCsrf() {
  csrf = undefined;
}

async function send<T>(method: "POST" | "PATCH" | "DELETE", path: string, body: Record<string, unknown>): Promise<T> {
  try {
    return await call<T>(method, path, { ...body, csrf: await csrfToken() });
  } catch (err) {
    // the cookie was lost or renewed: fetch the token again and retry once
    if (err instanceof ApiError && err.code === "csrf_expired" && csrf !== undefined) {
      csrf = undefined;
      return call<T>(method, path, { ...body, csrf: await csrfToken() });
    }
    throw err;
  }
}

const post = <T>(path: string, body: Record<string, unknown>) => send<T>("POST", path, body);

const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`;

export const authApi = {
  /** The look of the web apps (set by an administrator); readable before the sign in. */
  uiStyle: () => call<SystemStyleReply>("GET", "/auth-api/ui-style").then(systemStyleOf),
  /**
   * Self-registration is open (IDENTITY_REGISTRATION_ENABLED) and whether a new account waits for an administrator
   * (true unless the server says otherwise); readable before the sign in.
   */
  registrationOpen: () =>
    call<{ registration?: boolean; registrationApproval?: boolean; passkeys?: boolean }>("GET", "/auth-api/ui-style").then((r) => ({
      open: r.registration === true,
      approval: r.registrationApproval !== false,
      /** The server has passkeys turned on. */
      passkeys: r.passkeys === true,
    })),
  /** Asks for an account: the answer is the same for a known address, the link to set the password comes by e-mail. */
  register: (email: string, name: string, locale: string) => post<unknown>("/auth-api/register", { email, name, locale }),
  /** `theme` and `locale` are what the user picked on the sign in page (empty: not touched); the account keeps them. */
  login: (email: string, password: string, returnTo: string, prefs: { theme?: string; locale?: string } = {}) =>
    post<Next & { theme?: string; locale?: string }>("/auth-api/login", { email, password, return_to: returnTo, ...prefs }),
  /** Resolves with the second factors of the user when the challenge is still valid. */
  checkMfa: (c: string) => call<Partial<MfaMethods>>("GET", `/auth-api/login/mfa${q({ c })}`).then((r) => ({ totp: r.totp !== false, passkey: r.passkey === true })),
  verifyMfa: (c: string, code: string) => post<Next>("/auth-api/login/mfa", { c, code }),
  /** The passkey as the second factor: options first, then the credential the browser made from them. */
  mfaPasskeyBegin: (c: string) => post<{ options: Record<string, unknown> }>("/auth-api/login/mfa/passkey/begin", { c }),
  mfaPasskeyFinish: (c: string, credential: unknown) => post<Next>("/auth-api/login/mfa/passkey/finish", { c, credential }),
  /** Sign in with a passkey, no e-mail and no password. `theme` and `locale` as in `login`. */
  passkeyLoginBegin: () => post<Ceremony>("/auth-api/passkey/login/begin", {}),
  passkeyLoginFinish: (c: string, credential: unknown, returnTo: string, prefs: { theme?: string; locale?: string } = {}) =>
    post<Next & { theme?: string; locale?: string }>("/auth-api/passkey/login/finish", { c, credential, return_to: returnTo, ...prefs }),
  checkPasswordChange: (c: string) => call<unknown>("GET", `/auth-api/login/password${q({ c })}`),
  changePassword: (c: string, password: string, password2: string) => post<Next>("/auth-api/login/password", { c, password, password2 }),
  forgot: (email: string) => post<unknown>("/auth-api/password/forgot", { email }),
  checkReset: (token: string) => call<unknown>("GET", `/auth-api/password/reset${q({ token })}`),
  reset: (token: string, password: string) => post<unknown>("/auth-api/password/reset", { token, password }),
  /** The theme and the language of the account of the signed in user. */
  preferences: () => call<{ theme?: string; locale?: string }>("GET", "/auth-api/preferences"),
  /** Saves the theme and/or the language the user picked while signed in. */
  setPreferences: (p: { theme?: string; locale?: string }) => post<unknown>("/auth-api/preferences", p),
  /** 401 without a session, else where a signed in user goes (the portal). */
  session: () => call<{ redirect: string }>("GET", "/auth-api/session"),
  mfaStatus: () => call<MfaStatus>("GET", "/auth-api/account/mfa"),
  /** `redirect` is where the recovery codes page continues (the return_to of the sign in, checked by the server). */
  confirmMfa: (code: string, returnTo: string) => post<{ recoveryCodes: string[]; redirect: string }>("/auth-api/account/mfa", { code, return_to: returnTo }),
  disableMfa: (password: string, code: string) => post<unknown>("/auth-api/account/mfa/disable", { password, code }),
  /** The passkeys of the signed in user; 404 (not_found) when the server has them turned off. */
  passkeys: () =>
    call<{ passkeys?: Passkey[]; max?: number }>("GET", "/auth-api/account/passkeys").then((r) => ({ passkeys: r.passkeys ?? [], max: r.max ?? 20 })),
  /** Checks the password and returns the options of the creation ceremony. */
  beginPasskey: (password: string) => post<Ceremony>("/auth-api/account/passkeys/begin", { password }),
  /** `redirect` is where to go on (the checked return_to); a page that was an enrollment follows it. */
  finishPasskey: (c: string, credential: unknown, name: string, returnTo = "") =>
    post<Passkey & Next>("/auth-api/account/passkeys/finish", { c, credential, name, return_to: returnTo }),
  renamePasskey: (id: string, name: string) => send<unknown>("PATCH", `/auth-api/account/passkeys/${encodeURIComponent(id)}`, { name }),
  deletePasskey: (id: string, password: string) => send<unknown>("DELETE", `/auth-api/account/passkeys/${encodeURIComponent(id)}`, { password }),
  logout: (f: { postLogoutRedirectUri: string; state: string; clientId: string }) =>
    post<Next>("/auth-api/logout", { post_logout_redirect_uri: f.postLogoutRedirectUri, state: f.state, client_id: f.clientId }),
};
