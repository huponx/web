// Runtime configuration. The chart `web-application` renders a ConfigMap whose `config.js` sets
// `window.__env__`; index.html loads it before the bundle, so one image serves every environment.

export interface RuntimeEnv {
  /** Address of the gateway, for example https://api.example.com. */
  API_BASE: string;
  [key: string]: string;
}

declare global {
  interface Window {
    __env__?: Partial<RuntimeEnv>;
  }
}

/** Reads `window.__env__` and fails loudly when a required key is missing. */
export function readEnv(required: readonly string[] = ["API_BASE"]): RuntimeEnv {
  const env = (typeof window === "undefined" ? undefined : window.__env__) ?? {};
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`window.__env__ is missing ${missing.join(", ")} (config.js not loaded?)`);
  }
  return env as RuntimeEnv;
}
