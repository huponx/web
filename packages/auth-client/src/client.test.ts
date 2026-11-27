import { ApiError, createClient } from "./client";
import type { Me } from "./client";

const me: Me = { sub: "u1", roles: ["admin"], scopes: [], perms: ["*"], amr: ["pwd"], csrf_token: "csrf-1", expires_at: "2030-01-01T00:00:00Z" };

type Call = { url: string; init: RequestInit };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(handler: (c: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const store = new Map<string, string>();
  const navigated: string[] = [];
  let t = 1_000_000;
  const client = createClient({
    apiBase: "https://api.example.com/",
    fetch: async (url, init) => {
      const c = { url: String(url), init: init ?? {} };
      calls.push(c);
      return handler(c, calls.length);
    },
    navigate: (u) => navigated.push(u),
    href: () => "https://dict.example.com/app?x=1",
    origin: () => "https://dict.example.com",
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
    now: () => t,
  });
  return { client, calls, navigated, advance: (ms: number) => (t += ms) };
}

const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];

describe("me", () => {
  it("returns the user, sends the cookie and caches the answer", async () => {
    const { client, calls } = setup(() => json(200, me));
    expect(await client.me()).toEqual(me);
    expect(await client.me()).toEqual(me);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.com/auth/me");
    expect(calls[0]?.init.credentials).toBe("include");
  });

  it("is null on 401 and asks again on refresh", async () => {
    const { client, calls } = setup(() => json(401, { error: { code: "unauthenticated", message: "x" } }));
    expect(await client.me()).toBeNull();
    expect(await client.me({ refresh: true })).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("does not cache a failure", async () => {
    const { client, calls } = setup((_c, n) => (n === 1 ? json(503, { error: { code: "unavailable", message: "down" } }) : json(200, me)));
    await expect(client.me()).rejects.toMatchObject({ status: 503, code: "unavailable" });
    expect(await client.me()).toEqual(me);
    expect(calls).toHaveLength(2);
  });
});

describe("login", () => {
  it("goes to the gateway login and comes back to the current page", () => {
    const { client, navigated } = setup(() => json(200, me));
    client.login();
    expect(navigated).toEqual(["https://api.example.com/auth/login?return_to=" + encodeURIComponent("https://dict.example.com/app?x=1")]);
  });

  it("detects a redirect loop and forgets it once signed in", async () => {
    const { client, advance } = setup(() => json(200, me));
    expect(client.loginLooped()).toBe(false);
    client.login();
    expect(client.loginLooped()).toBe(false); // one attempt is a normal sign in
    advance(4_000);
    client.login();
    expect(client.loginLooped()).toBe(true); // back without a session and again to the login
    advance(20_000);
    expect(client.loginLooped()).toBe(false);
    client.login();
    await client.me();
    expect(client.loginLooped()).toBe(false);
  });

  it("is not a loop when the user takes a while at the login form after a sign out", () => {
    const { client, advance } = setup(() => json(200, me));
    client.login(); // the sign out sent the tab to the login page
    advance(12_000); // typing the password
    expect(client.loginLooped()).toBe(false); // back at the app without a session: log in again, not an error
  });
});

describe("api", () => {
  it("GET carries the cookie and no CSRF token", async () => {
    const { client, calls } = setup(() => json(200, { roles: [] }));
    expect(await client.api("GET", "/api/roles")).toEqual({ roles: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.com/api/roles");
    expect(header(calls[0]!, "Csrf-Token")).toBeUndefined();
    expect(calls[0]?.init.credentials).toBe("include");
  });

  it("an unsafe call sends JSON and the CSRF token of /auth/me", async () => {
    const { client, calls } = setup((c) => (c.url.endsWith("/auth/me") ? json(200, me) : json(200, { ok: true })));
    expect(await client.api("POST", "api/roles", { role: { name: "r" } })).toEqual({ ok: true });
    const post = calls[1]!;
    expect(post.url).toBe("https://api.example.com/api/roles");
    expect(post.init.method).toBe("POST");
    expect(header(post, "Csrf-Token")).toBe("csrf-1");
    expect(header(post, "Content-Type")).toBe("application/json");
    expect(post.init.body).toBe('{"role":{"name":"r"}}');
  });

  it("refreshes the CSRF token once when the session was replaced", async () => {
    let csrf = "old";
    const { client, calls } = setup((c) => {
      if (c.url.endsWith("/auth/me")) return json(200, { ...me, csrf_token: csrf });
      if (header(c, "Csrf-Token") !== "new") {
        csrf = "new";
        return json(403, { error: { code: "bad_csrf", message: "bad" } });
      }
      return json(200, { ok: 1 });
    });
    expect(await client.api("POST", "/api/x", {})).toEqual({ ok: 1 });
    expect(calls.filter((c) => c.url.endsWith("/api/x"))).toHaveLength(2);
  });

  it("a 401 starts the login and throws", async () => {
    const { client, navigated } = setup(() => json(401, { error: { code: "unauthenticated", message: "x" } }));
    await expect(client.api("GET", "/api/roles")).rejects.toMatchObject({ status: 401 });
    expect(navigated).toHaveLength(1);
    expect(navigated[0]).toContain("/auth/login?return_to=");
  });

  it("an unsafe call without a session does not hit the route", async () => {
    const { client, calls, navigated } = setup(() => json(401));
    await expect(client.api("DELETE", "/api/x")).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1); // only /auth/me
    expect(navigated).toHaveLength(1);
  });

  it("maps gateway errors and tolerates non JSON answers", async () => {
    const a = setup(() => json(403, { error: { code: "forbidden", message: "you are not allowed to do this" } }));
    await expect(a.client.api("GET", "/api/x")).rejects.toMatchObject({ status: 403, code: "forbidden", message: "you are not allowed to do this" });
    const b = setup(() => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(b.client.api("GET", "/api/x")).rejects.toMatchObject({ status: 502, code: "unavailable" });
  });

  it("an empty answer is undefined", async () => {
    const { client } = setup(() => new Response(null, { status: 204 }));
    expect(await client.api("GET", "/api/x")).toBeUndefined();
  });
});

describe("logout", () => {
  it("posts with the CSRF token, returns to this web app and goes to the end-session URL", async () => {
    const { client, calls, navigated } = setup((c) =>
      c.url.endsWith("/auth/me") ? json(200, me) : json(200, { logout_url: "https://auth.example.com/oauth2/logout?x=1" }),
    );
    await client.logout();
    const post = calls[1]!;
    expect(post.url).toBe("https://api.example.com/auth/logout?return_to=" + encodeURIComponent("https://dict.example.com/"));
    expect(header(post, "Csrf-Token")).toBe("csrf-1");
    expect(navigated).toEqual(["https://auth.example.com/oauth2/logout?x=1"]);
    expect(await client.me()).toBeNull();
  });

  it("without a session it only goes back to the web app", async () => {
    const { client, calls, navigated } = setup(() => json(401));
    await client.logout();
    expect(calls).toHaveLength(1);
    expect(navigated).toEqual(["https://dict.example.com/"]);
  });
});
