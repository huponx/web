import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import i18n from "./i18n";

function renderFailing(error: Record<string, unknown>) {
  const me: Me = { sub: "root", roles: ["admin"], scopes: [], perms: ["identity:*"], amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      if (u.endsWith("/api/ui-style")) return new Response(JSON.stringify({ uiStyle: "saas", uiPalettes: {} }), { status: 200 });
      return new Response(JSON.stringify({ error }), { status: 412 });
    },
    navigate: () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  render(
    <ThemeProvider>
      <StyleProvider>
        <AuthProvider client={client}>
          <MemoryRouter initialEntries={["/users"]}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </StyleProvider>
    </ThemeProvider>,
  );
}

describe("errors of the server", () => {
  afterEach(() => i18n.changeLanguage("en"));
  const english = "this is the last admin; assign the admin role to another user first";

  it("show in the language of the user, from the reason of the server", async () => {
    await i18n.changeLanguage("vi");
    renderFailing({ code: "failed_precondition", reason: "last_admin", message: english });
    expect((await screen.findAllByText(/quản trị viên cuối cùng/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(english)).not.toBeInTheDocument();
  });

  it("fall back to the sentence of the code, then to the English message of the server", async () => {
    await i18n.changeLanguage("vi");
    renderFailing({ code: "failed_precondition", reason: "not_translated_yet", message: english });
    expect((await screen.findAllByText("Không thể thực hiện ở trạng thái hiện tại.")).length).toBeGreaterThan(0);
  });

  it("show the English message when nothing is translated", async () => {
    renderFailing({ code: "something_new", reason: "not_translated_yet", message: english });
    expect((await screen.findAllByText(english)).length).toBeGreaterThan(0);
  });
});
