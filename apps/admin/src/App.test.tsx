import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

interface Call {
  method: string;
  url: string;
  body?: string;
}

function renderApp(perms: string[], route = "/", answer: (c: Call) => unknown = () => ({})) {
  const calls: Call[] = [];
  const me: Me = { sub: "ann", roles: ["admin"], scopes: [], perms, amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      const call = { method: init?.method ?? "GET", url: u, body: init?.body as string | undefined };
      calls.push(call);
      return new Response(JSON.stringify(answer(call)), { status: 200 });
    },
    navigate: () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  render(
    <AuthProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
  return calls;
}

describe("admin menu", () => {
  it("shows only the pages the user may use", async () => {
    renderApp(["identity:role:read", "identity:mfa:read"]);
    expect(await screen.findByRole("link", { name: "Roles" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Clients" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Exchange policies" })).toBeNull();
  });

  it("refuses a page typed in the address bar without its permission", async () => {
    const calls = renderApp([], "/clients");
    expect(await screen.findByText("You are not allowed to see this page.")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("shows everything with identity:*", async () => {
    renderApp(["identity:*"]);
    for (const n of ["Users", "Roles", "Clients", "Exchange policies"]) {
      expect(await screen.findByRole("link", { name: n })).toBeTruthy();
    }
  });
});

describe("roles page", () => {
  it("hides the create form without identity:role:write", async () => {
    renderApp(["identity:role:read"], "/roles", () => ({ roles: [{ name: "admin", description: "", permissions: ["*"] }] }));
    expect(await screen.findByText("admin", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByText("New role")).toBeNull();
  });

  it("creates a role with the permissions typed", async () => {
    const calls = renderApp(["identity:role:*"], "/roles", () => ({ roles: [] }));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Name"), "support");
    await user.type(screen.getByLabelText("Permissions"), "identity:user:read bill:*");
    await user.click(screen.getByRole("button", { name: "Create role" }));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("https://api.example.com/api/roles");
    expect(JSON.parse(post!.body!)).toEqual({ role: { name: "support", description: "", permissions: ["identity:user:read", "bill:*"] } });
  });
});
