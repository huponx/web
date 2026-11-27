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

/** What a step of the sign in answers: where to go next (a path of identity), when there is a next step. */
export interface Next {
  redirect?: string;
}

export interface MfaStatus {
  enabled: boolean;
  /** Recovery codes left (enabled). */
  codesLeft?: number;
  /** MFA is required for the account, so it cannot be turned off (enabled). */
  forced?: boolean;
  /** Data URL of the QR code and the key to type (not enabled yet). */
  qr?: string;
  secret?: string;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
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

async function csrfToken(): Promise<string> {
  csrf ??= (await call<{ csrf: string }>("GET", "/auth-api/csrf")).csrf;
  return csrf;
}

/** Forgets the cached CSRF token (tests). */
export function resetCsrf() {
  csrf = undefined;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  try {
    return await call<T>("POST", path, { ...body, csrf: await csrfToken() });
  } catch (err) {
    // the cookie was lost or renewed: fetch the token again and retry once
    if (err instanceof ApiError && err.code === "csrf_expired" && csrf !== undefined) {
      csrf = undefined;
      return call<T>("POST", path, { ...body, csrf: await csrfToken() });
    }
    throw err;
  }
}

const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`;

export const authApi = {
  /** The look of the web apps (set by an administrator); readable before the sign in. */
  uiStyle: () => call<SystemStyleReply>("GET", "/auth-api/ui-style").then(systemStyleOf),
  /**
   * Self-registration is open (IDENTITY_REGISTRATION_ENABLED) and whether a new account waits for an administrator
   * (true unless the server says otherwise); readable before the sign in.
   */
  registrationOpen: () =>
    call<{ registration?: boolean; registrationApproval?: boolean }>("GET", "/auth-api/ui-style").then((r) => ({
      open: r.registration === true,
      approval: r.registrationApproval !== false,
    })),
  /** Asks for an account: the answer is the same for a known address, the link to set the password comes by e-mail. */
  register: (email: string, name: string, locale: string) => post<unknown>("/auth-api/register", { email, name, locale }),
  /** `theme` and `locale` are what the user picked on the sign in page (empty: not touched); the account keeps them. */
  login: (email: string, password: string, returnTo: string, prefs: { theme?: string; locale?: string } = {}) =>
    post<Next & { theme?: string; locale?: string }>("/auth-api/login", { email, password, return_to: returnTo, ...prefs }),
  /** Resolves when the challenge of the second factor is still valid. */
  checkMfa: (c: string) => call<unknown>("GET", `/auth-api/login/mfa${q({ c })}`),
  verifyMfa: (c: string, code: string) => post<Next>("/auth-api/login/mfa", { c, code }),
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
  logout: (f: { postLogoutRedirectUri: string; state: string; clientId: string }) =>
    post<Next>("/auth-api/logout", { post_logout_redirect_uri: f.postLogoutRedirectUri, state: f.state, client_id: f.clientId }),
};
