/** What an error of the gateway carries: `{"error": {"code", "reason", "params", "message"}}` (an `ApiError` of auth-client). */
export interface ApiErrorLike {
  code?: string;
  reason?: string;
  params?: Record<string, string>;
  message: string;
}

/** The part of an i18next instance the translation needs. */
export interface Translator {
  // loose on purpose: the overloads of i18next's own `t` are not assignable to a narrower signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (...args: any[]) => unknown;
  exists: (key: string) => boolean;
}

function isApiErrorLike(e: unknown): e is ApiErrorLike {
  return e instanceof Error && typeof (e as { code?: unknown }).code === "string";
}

/**
 * The text of an error of the gateway in the language of the app. In order: `errors.reason.<reason>` (filled with the
 * `params`), `errors.code.<code>` (the generic sentence of the code), the English message of the server, `fallback`.
 * A key the app has not translated yet is skipped, so the user sees the server message instead of a key.
 * An error that is not from the gateway (a network failure) is `undefined`: the caller decides.
 */
export function translateApiError(e: unknown, i18n: Translator, fallback: string): string | undefined {
  if (!isApiErrorLike(e)) return undefined;
  if (e.reason) {
    const key = `errors.reason.${e.reason}`;
    if (i18n.exists(key)) return String(i18n.t(key, { ...e.params }));
  }
  if (e.code) {
    const key = `errors.code.${e.code}`;
    if (i18n.exists(key)) return String(i18n.t(key));
  }
  return e.message || fallback;
}
