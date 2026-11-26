import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import i18n from "./i18n";

function renderApp(perms: string[], locale = "en") {
  const me: Me = { sub: "ann", roles: ["user"], scopes: [], perms, amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      if (u.endsWith("/api/ui-style")) return new Response(JSON.stringify({ uiStyle: "saas", uiPalettes: { saas: "aurora", glass: "ocean", mono: "aurora" } }), { status: 200 });
      if (u.endsWith("/api/me")) return new Response(JSON.stringify({ user: { name: "Ann", locale, theme: "light" } }), { status: 200 });
      return new Response("{}", { status: 200 });
    },
    navigate: () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  render(
    <ThemeProvider>
      <StyleProvider>
        <AuthProvider client={client}>
          <MemoryRouter>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </StyleProvider>
    </ThemeProvider>,
  );
}

afterEach(async () => {
  delete window.__env__;
  await i18n.changeLanguage("en");
});

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

  it("speaks the language of the account", async () => {
    renderApp(["bill:*"], "vi");
    expect(await screen.findByRole("link", { name: "Hóa đơn" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Phiên đăng nhập" })).toBeTruthy();
  });
});

describe("user menu", () => {
  it("links back to the portal when PORTAL_URL is configured", async () => {
    window.__env__ = { API_BASE: "https://api.example.com", PORTAL_URL: "https://example.com" };
    renderApp([]);
    await userEvent.setup().click(await screen.findByRole("button", { name: "User menu" }));
    expect(await screen.findByRole("menuitem", { name: "Back to the portal" })).toHaveAttribute("href", "https://example.com/");
  });

  it("has no such item without PORTAL_URL", async () => {
    renderApp([]);
    await userEvent.setup().click(await screen.findByRole("button", { name: "User menu" }));
    await screen.findByRole("menuitem", { name: "Sign out" });
    expect(screen.queryByRole("menuitem", { name: "Back to the portal" })).toBeNull();
  });
});
