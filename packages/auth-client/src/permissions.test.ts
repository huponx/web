import { allowed, allowedAll, allowedAny, match } from "./permissions";

describe("match", () => {
  const cases: [string, string, boolean][] = [
    ["*", "identity:user:read", true],
    ["identity:user:read", "identity:user:read", true],
    ["identity:user:read", "identity:user:write", false],
    ["identity:*:read", "identity:user:read", true],
    ["identity:*:read", "identity:read", false],
    ["identity:*:read", "identity:user:role:read", false],
    ["identity:*", "identity:read", true],
    ["identity:*", "identity:user:write", true],
    ["identity:*", "identity", false],
    ["identity:user", "identity:user:read", false],
    ["identity:user:read", "identity:user", false],
    ["billing:*", "identity:user:read", false],
  ];
  it.each(cases)("%s covers %s: %s", (granted, required, want) => {
    expect(match(granted, required)).toBe(want);
  });

  it("never matches an empty or wildcard requirement", () => {
    expect(match("*", "")).toBe(false);
    expect(match("*", "identity:*")).toBe(false);
  });
});

describe("allowed", () => {
  it("is false without permissions or without a requirement", () => {
    expect(allowed(undefined, "a:b")).toBe(false);
    expect(allowed([], "a:b")).toBe(false);
    expect(allowed(["*"], "")).toBe(false);
  });
  it("any / all", () => {
    const perms = ["identity:role:read", "identity:user:*"];
    expect(allowed(perms, "identity:user:write")).toBe(true);
    expect(allowedAll(perms, "identity:role:read", "identity:user:read")).toBe(true);
    expect(allowedAll(perms, "identity:role:read", "identity:client:read")).toBe(false);
    expect(allowedAll(perms)).toBe(false);
    expect(allowedAny(perms, "identity:client:read", "identity:role:read")).toBe(true);
    expect(allowedAny(perms)).toBe(false);
  });
});
