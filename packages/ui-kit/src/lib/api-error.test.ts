import { translateApiError } from "./api-error";
import type { Translator } from "./api-error";

class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reason?: string,
    readonly params?: Record<string, string>,
  ) {
    super(message);
  }
}

const catalog: Record<string, string> = {
  "errors.reason.last_admin": "Đây là quản trị viên cuối cùng.",
  "errors.reason.limit": "Tối đa {{limit}}.",
  "errors.code.not_found": "Không tìm thấy.",
};
const i18n: Translator = {
  exists: (k) => k in catalog,
  t: (k, o) => (catalog[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(o?.[n])),
};

describe("translateApiError", () => {
  it("prefers the reason, filled with the params", () => {
    expect(translateApiError(new GatewayError("failed_precondition", "last", "last_admin"), i18n, "x")).toBe("Đây là quản trị viên cuối cùng.");
    expect(translateApiError(new GatewayError("invalid_argument", "m", "limit", { limit: "256 MiB" }), i18n, "x")).toBe("Tối đa 256 MiB.");
  });

  it("falls back to the sentence of the code when the reason is unknown or missing", () => {
    expect(translateApiError(new GatewayError("not_found", "no", "unlisted"), i18n, "x")).toBe("Không tìm thấy.");
    expect(translateApiError(new GatewayError("not_found", "no"), i18n, "x")).toBe("Không tìm thấy.");
  });

  it("falls back to the message of the server, then to the fallback", () => {
    expect(translateApiError(new GatewayError("conflict", "already exists"), i18n, "x")).toBe("already exists");
    expect(translateApiError(new GatewayError("conflict", ""), i18n, "x")).toBe("x");
  });

  it("leaves errors that are not from the gateway to the caller", () => {
    expect(translateApiError(new TypeError("Failed to fetch"), i18n, "x")).toBeUndefined();
    expect(translateApiError("boom", i18n, "x")).toBeUndefined();
  });
});
