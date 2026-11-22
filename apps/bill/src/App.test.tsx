import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

function renderApp(perms: string[]) {
  const me: Me = { sub: "ann", roles: ["user"], scopes: [], perms, amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async () => new Response(JSON.stringify(me), { status: 200 }),
    navigate: () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  render(
    <AuthProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("App", () => {
  it("shows the user and hides the menu invoices the user may not use", async () => {
    renderApp([]);
    expect(await screen.findByText("ann", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Invoices" })).toBeNull();
    expect(screen.getByRole("link", { name: "Session" })).toBeTruthy();
  });

  it("shows the menu entry with the permission", async () => {
    renderApp(["bill:*"]);
    expect(await screen.findByRole("link", { name: "Invoices" })).toBeTruthy();
  });
});
