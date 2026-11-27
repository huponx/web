import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPasskey,
  credentialToJSON,
  forgetPasskeyHint,
  getPasskey,
  hasPasskeyHint,
  parseCreationOptions,
  parseRequestOptions,
  passkeyFailure,
  passkeysSupported,
  rememberPasskey,
  toBase64Url,
  toBuffer,
} from "./webauthn";

const bytes = (b: ArrayBuffer) => Array.from(new Uint8Array(b));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("base64url", () => {
  it("round trips the bytes, with the URL alphabet and no padding", () => {
    const src = new Uint8Array([251, 255, 190, 0, 1, 2, 3]);
    const text = toBase64Url(src.buffer);
    expect(text).toBe("-_--AAECAw");
    expect(bytes(toBuffer(text))).toEqual(Array.from(src));
    expect(toBase64Url(null)).toBe("");
  });
});

describe("options without the parsers of the browser", () => {
  const PKC = function () {} as unknown as typeof PublicKeyCredential;

  it("decodes the creation options, as {publicKey} or bare", () => {
    vi.stubGlobal("PublicKeyCredential", PKC);
    const pk = { challenge: "AQID", rp: { name: "x", id: "example.com" }, user: { id: "BAUG", name: "a@b.c", displayName: "A" }, excludeCredentials: [{ type: "public-key", id: "BwgJ" }] };
    for (const input of [{ publicKey: pk }, pk]) {
      const o = parseCreationOptions(input);
      expect(bytes(o.challenge as ArrayBuffer)).toEqual([1, 2, 3]);
      expect(bytes(o.user.id as ArrayBuffer)).toEqual([4, 5, 6]);
      expect(bytes(o.excludeCredentials![0]!.id as ArrayBuffer)).toEqual([7, 8, 9]);
      expect(o.rp.id).toBe("example.com");
    }
  });

  it("decodes the request options; no allow list stays none", () => {
    vi.stubGlobal("PublicKeyCredential", PKC);
    const o = parseRequestOptions({ publicKey: { challenge: "AQID", rpId: "example.com", userVerification: "required" } });
    expect(bytes(o.challenge as ArrayBuffer)).toEqual([1, 2, 3]);
    expect(o.allowCredentials).toBeUndefined();
    expect(o.userVerification).toBe("required");
  });

  it("uses the parsers of the browser when it has them", () => {
    const parse = vi.fn(() => ({ challenge: new ArrayBuffer(1) }));
    vi.stubGlobal("PublicKeyCredential", Object.assign(function () {}, { parseRequestOptionsFromJSON: parse }));
    parseRequestOptions({ publicKey: { challenge: "AQID" } });
    expect(parse).toHaveBeenCalledWith({ challenge: "AQID" });
  });
});

describe("credentialToJSON", () => {
  const buf = (...n: number[]) => new Uint8Array(n).buffer;

  it("uses toJSON() when the credential has it", () => {
    const cred = { toJSON: () => ({ id: "x" }) } as unknown as PublicKeyCredential;
    expect(credentialToJSON(cred)).toEqual({ id: "x" });
  });

  it("builds the registration answer by hand", () => {
    const cred = {
      id: "abc",
      rawId: buf(1, 2, 3),
      type: "public-key",
      response: { clientDataJSON: buf(1), attestationObject: buf(2), getTransports: () => ["internal"] },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential;
    expect(credentialToJSON(cred)).toMatchObject({
      id: "abc",
      rawId: "AQID",
      response: { clientDataJSON: "AQ", attestationObject: "Ag", transports: ["internal"] },
    });
  });

  it("builds the assertion by hand, with the user handle when there is one", () => {
    const base = { id: "abc", rawId: buf(1), type: "public-key", getClientExtensionResults: () => ({}) };
    const withHandle = { ...base, response: { clientDataJSON: buf(1), authenticatorData: buf(2), signature: buf(3), userHandle: buf(4) } } as unknown as PublicKeyCredential;
    const without = { ...base, response: { clientDataJSON: buf(1), authenticatorData: buf(2), signature: buf(3), userHandle: null } } as unknown as PublicKeyCredential;
    expect(credentialToJSON(withHandle).response).toMatchObject({ authenticatorData: "Ag", signature: "Aw", userHandle: "BA" });
    expect(credentialToJSON(without).response).not.toHaveProperty("userHandle");
  });
});

describe("ceremonies", () => {
  function browser(get: unknown, create: unknown = vi.fn()) {
    vi.stubGlobal("PublicKeyCredential", function () {});
    Object.defineProperty(navigator, "credentials", { value: { get, create }, configurable: true });
  }
  const cred = { id: "i", rawId: new ArrayBuffer(1), type: "public-key", toJSON: () => ({ id: "i" }) };

  it("signs in, with conditional mediation for the autofill list", async () => {
    const get = vi.fn().mockResolvedValue(cred);
    browser(get);
    const ctl = new AbortController();
    await expect(getPasskey({ publicKey: { challenge: "AQID" } }, { conditional: true, signal: ctl.signal })).resolves.toEqual({ id: "i" });
    expect(get.mock.calls[0]![0]).toMatchObject({ mediation: "conditional", signal: ctl.signal });
  });

  it("creates a passkey", async () => {
    const create = vi.fn().mockResolvedValue(cred);
    browser(vi.fn(), create);
    await expect(createPasskey({ publicKey: { challenge: "AQID", rp: { name: "x" }, user: { id: "BAUG", name: "n", displayName: "d" } } })).resolves.toEqual({ id: "i" });
  });

  it("a prompt with no answer is a cancellation", async () => {
    browser(vi.fn().mockResolvedValue(null));
    await expect(getPasskey({ publicKey: { challenge: "AQID" } })).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("tells a dismissed prompt from a failure and from no support", () => {
    browser(vi.fn());
    expect(passkeysSupported()).toBe(true);
    expect(passkeyFailure(new DOMException("x", "NotAllowedError"))).toBe("cancelled");
    expect(passkeyFailure(new DOMException("x", "AbortError"))).toBe("cancelled");
    expect(passkeyFailure(new DOMException("x", "SecurityError"))).toBe("failed");
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(passkeysSupported()).toBe(false);
    expect(passkeyFailure(new Error("x"))).toBe("unsupported");
  });
});

describe("the hint", () => {
  it("is remembered and forgotten", () => {
    expect(hasPasskeyHint()).toBe(false);
    rememberPasskey();
    expect(hasPasskeyHint()).toBe(true);
    forgetPasskeyHint();
    expect(hasPasskeyHint()).toBe(false);
  });

  it("does not break without storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(hasPasskeyHint()).toBe(false);
    vi.restoreAllMocks();
  });
});
