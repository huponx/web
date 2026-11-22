import { render, screen, waitFor } from "@testing-library/react";
import { createClient } from "./client";
import type { Me } from "./client";
import { AuthProvider, Can, RequireAuth } from "./react";

const base: Me = { sub: "u1", roles: [], scopes: [], perms: ["identity:role:read"], amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };

function make(status: number, me?: Me, storedAttempt = false) {
  const navigated: string[] = [];
  const store = new Map<string, string>(storedAttempt ? [["auth:login-attempt", String(Date.now())]] : []);
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async () => new Response(me ? JSON.stringify(me) : null, { status }),
    navigate: (u) => navigated.push(u),
    href: () => "https://dict.example.com/",
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
  });
  return { client, navigated };
}

describe("RequireAuth", () => {
  it("renders the children for a signed in user", async () => {
    const { client } = make(200, base);
    render(
      <AuthProvider client={client}>
        <RequireAuth loading="loading">secret</RequireAuth>
      </AuthProvider>,
    );
    expect(await screen.findByText("secret")).toBeTruthy();
  });

  it("starts the login when nobody is signed in", async () => {
    const { client, navigated } = make(401);
    render(
      <AuthProvider client={client}>
        <RequireAuth loading="loading">secret</RequireAuth>
      </AuthProvider>,
    );
    await waitFor(() => expect(navigated).toHaveLength(1));
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("does not loop: a recent attempt with no session shows the error", async () => {
    const { client, navigated } = make(401, undefined, true);
    render(
      <AuthProvider client={client}>
        <RequireAuth error={({ message }) => <p>{message}</p>}>secret</RequireAuth>
      </AuthProvider>,
    );
    expect(await screen.findByText(/cookie was not kept/)).toBeTruthy();
    expect(navigated).toHaveLength(0);
  });

  it("shows the error when the gateway is down", async () => {
    const { client } = make(503);
    render(
      <AuthProvider client={client}>
        <RequireAuth error={({ message }) => <p>{message}</p>}>secret</RequireAuth>
      </AuthProvider>,
    );
    expect(await screen.findByText("HTTP 503")).toBeTruthy();
  });
});

describe("Can", () => {
  it("shows or hides by permission", async () => {
    const { client } = make(200, base);
    render(
      <AuthProvider client={client}>
        <RequireAuth>
          <Can perm="identity:role:read">
            <span>read</span>
          </Can>
          <Can perm="identity:role:write" fallback={<span>no write</span>}>
            <span>write</span>
          </Can>
          <Can any={["identity:client:read", "identity:role:read"]}>
            <span>any</span>
          </Can>
          <Can all={["identity:client:read", "identity:role:read"]} fallback={<span>not all</span>}>
            <span>all</span>
          </Can>
        </RequireAuth>
      </AuthProvider>,
    );
    expect(await screen.findByText("read")).toBeTruthy();
    expect(screen.getByText("no write")).toBeTruthy();
    expect(screen.getByText("any")).toBeTruthy();
    expect(screen.getByText("not all")).toBeTruthy();
    expect(screen.queryByText("write")).toBeNull();
    expect(screen.queryByText("all")).toBeNull();
  });
});
