/**
 * Passkeys (WebAuthn) in the browser: the options of the server in, the credential as JSON out. The server speaks
 * the JSON form of the web API (base64url for every byte string), which the browsers that have
 * `PublicKeyCredential.parseCreationOptionsFromJSON` / `parseRequestOptionsFromJSON` and `toJSON()` read and write
 * directly; for the others the same conversion is done here by hand.
 */

/** The options as the server sends them: `{ publicKey: {...} }` (go-webauthn) or the inner object itself. */
type OptionsJSON = { publicKey?: Record<string, unknown> } & Record<string, unknown>;
type Descriptor = { id: string; type: string; transports?: string[] };

/** Why a ceremony ended: the user dismissed the prompt, or the browser or authenticator refused. */
export type PasskeyFailure = "cancelled" | "unsupported" | "failed";

export function toBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function toBase64Url(buf: ArrayBuffer | null | undefined): string {
  if (!buf) return "";
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The browser can run a passkey ceremony at all. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && !!navigator.credentials;
}

/** The browser can offer the passkeys in the autofill list of a field (conditional mediation). */
export async function conditionalLoginSupported(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & { isConditionalMediationAvailable?: () => Promise<boolean> };
  try {
    return (await pkc.isConditionalMediationAvailable?.()) === true;
  } catch {
    return false;
  }
}

const inner = (o: OptionsJSON): Record<string, unknown> => (o.publicKey ?? o) as Record<string, unknown>;

function descriptors(list: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return (list as Descriptor[]).map((d) => ({ type: "public-key", id: toBuffer(d.id), transports: d.transports as AuthenticatorTransport[] | undefined }));
}

type Parser = { parseCreationOptionsFromJSON?: (o: unknown) => PublicKeyCredentialCreationOptions; parseRequestOptionsFromJSON?: (o: unknown) => PublicKeyCredentialRequestOptions };

export function parseCreationOptions(options: OptionsJSON): PublicKeyCredentialCreationOptions {
  const o = inner(options);
  const native = (window.PublicKeyCredential as unknown as Parser | undefined)?.parseCreationOptionsFromJSON;
  if (native) return native.call(window.PublicKeyCredential, o);
  const user = o.user as { id: string; name: string; displayName: string };
  return {
    ...(o as unknown as PublicKeyCredentialCreationOptions),
    challenge: toBuffer(o.challenge as string),
    user: { ...user, id: toBuffer(user.id) },
    excludeCredentials: descriptors(o.excludeCredentials),
  };
}

export function parseRequestOptions(options: OptionsJSON): PublicKeyCredentialRequestOptions {
  const o = inner(options);
  const native = (window.PublicKeyCredential as unknown as Parser | undefined)?.parseRequestOptionsFromJSON;
  if (native) return native.call(window.PublicKeyCredential, o);
  return { ...(o as unknown as PublicKeyCredentialRequestOptions), challenge: toBuffer(o.challenge as string), allowCredentials: descriptors(o.allowCredentials) };
}

/** The credential in the JSON form the server reads (`toJSON()`, or the same built by hand). */
export function credentialToJSON(cred: PublicKeyCredential): Record<string, unknown> {
  // the DOM types of this TypeScript do not have toJSON() yet
  const native = (cred as unknown as { toJSON?: () => Record<string, unknown> }).toJSON;
  if (typeof native === "function") return native.call(cred);
  const r = cred.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const response: Record<string, unknown> = { clientDataJSON: toBase64Url(r.clientDataJSON) };
  if ("attestationObject" in r && r.attestationObject) {
    response.attestationObject = toBase64Url(r.attestationObject);
    response.transports = r.getTransports?.() ?? [];
  } else {
    response.authenticatorData = toBase64Url(r.authenticatorData);
    response.signature = toBase64Url(r.signature);
    if (r.userHandle) response.userHandle = toBase64Url(r.userHandle);
  }
  return {
    id: cred.id,
    rawId: toBase64Url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    response,
  };
}

/** Creates a passkey from the options of the server; resolves with the credential JSON to send back. */
export async function createPasskey(options: OptionsJSON, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const cred = (await navigator.credentials.create({ publicKey: parseCreationOptions(options), signal })) as PublicKeyCredential | null;
  if (!cred) throw new DOMException("no credential", "NotAllowedError");
  return credentialToJSON(cred);
}

/**
 * Signs in with a passkey from the options of the server. With `conditional` the passkeys are offered in the autofill
 * list of a field marked `autocomplete="... webauthn"`, and the call stays pending until the user picks one (or
 * `signal` aborts it).
 */
export async function getPasskey(options: OptionsJSON, opts: { conditional?: boolean; signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
  const cred = (await navigator.credentials.get({
    publicKey: parseRequestOptions(options),
    mediation: opts.conditional ? ("conditional" as CredentialMediationRequirement) : undefined,
    signal: opts.signal,
  })) as PublicKeyCredential | null;
  if (!cred) throw new DOMException("no credential", "NotAllowedError");
  return credentialToJSON(cred);
}

/** Tells a dismissed prompt (not an error to show) from a refusal. */
export function passkeyFailure(err: unknown): PasskeyFailure {
  if (!passkeysSupported()) return "unsupported";
  const name = err instanceof DOMException ? err.name : (err as { name?: string } | undefined)?.name;
  return name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "failed";
}

const HINT = "huponx.passkey";

/** Remembers (per browser) that this user signs in with a passkey: the login page puts it first. */
export function rememberPasskey(): void {
  try {
    localStorage.setItem(HINT, "1");
  } catch {
    // no storage (private window): the hint is only a convenience
  }
}

/** The user used a passkey in this browser before. */
export function hasPasskeyHint(): boolean {
  try {
    return localStorage.getItem(HINT) === "1";
  } catch {
    return false;
  }
}

export function forgetPasskeyHint(): void {
  try {
    localStorage.removeItem(HINT);
  } catch {
    // see rememberPasskey
  }
}
