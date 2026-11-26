import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import i18n from "./i18n";

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}
type Answer = { status?: number; json?: unknown } | undefined;

const APPS = JSON.stringify([
  { name: "Dict", url: "https://dict.example.com", perm: "dictionary:word:read", widget: "dict-review" },
  { name: "Bill", url: "https://bill.example.com", perm: "bill:invoice:read" },
]);

const account = { id: "u1", email: "ann@example.com", name: "Ann", locale: "en", roles: ["member"], theme: "light" };

function renderApp(perms: string[], route = "/", answer: (c: Call) => Answer = () => undefined, profile: Partial<Me> = {}) {
  const calls: Call[] = [];
  const me: Me = { sub: "u1", name: "Ann", email: "ann@example.com", roles: ["member"], scopes: [], perms, amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z", ...profile };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url, init) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      if (u.endsWith("/api/ui-style")) return new Response(JSON.stringify({ uiStyle: "saas", uiPalettes: { saas: "aurora", glass: "ocean", mono: "aurora" } }), { status: 200 });
      const call: Call = { method, url: u.replace("https://api.example.com", ""), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined };
      calls.push(call);
      const a = answer(call);
      if (a) return new Response(JSON.stringify(a.json ?? {}), { status: a.status ?? 200 });
      if (call.url === "/api/me" && method === "GET") return new Response(JSON.stringify({ user: account }), { status: 200 });
      if (call.url === "/api/me" && method === "PUT") return new Response(JSON.stringify({ user: { ...account, ...call.body } }), { status: 200 });
      return new Response("{}", { status: 200 });
    },
    navigate: () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  render(
    <ThemeProvider>
      <StyleProvider>
        <AuthProvider client={client}>
          <MemoryRouter initialEntries={[route]}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </StyleProvider>
    </ThemeProvider>,
  );
  return calls;
}

beforeEach(() => {
  window.__env__ = { API_BASE: "https://api.example.com", APPS };
  localStorage.clear();
});
afterEach(async () => {
  delete window.__env__;
  await i18n.changeLanguage("en");
});

describe("home", () => {
  it("greets the user and shows the apps the roles allow", async () => {
    renderApp(["dictionary:word:read"]);
    expect(await screen.findByRole("heading", { name: "Hello, Ann" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Dict" })).toHaveAttribute("href", "https://dict.example.com/");
    expect(screen.queryByText("dict.example.com")).toBeNull(); // the card shows the name, not the address
    expect(screen.queryByRole("link", { name: "Open Bill" })).toBeNull();
    expect(screen.queryByText(/Admin/)).toBeNull();
  });

  it("shows the Bill card to a user with the billing permission", async () => {
    renderApp(["dictionary:word:read", "bill:invoice:read"]);
    expect(await screen.findByRole("link", { name: "Open Bill" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Dict" })).toBeInTheDocument();
  });

  it("says so when there is no app for the account", async () => {
    renderApp([]);
    expect(await screen.findByTestId("no-apps")).toHaveTextContent("There are no applications for this account yet.");
  });

  it("shows no app, without failing, when APPS is broken", async () => {
    window.__env__ = { API_BASE: "https://api.example.com", APPS: "not json" };
    renderApp(["*"]);
    expect(await screen.findByTestId("no-apps")).toBeInTheDocument();
  });

  it("falls back to the e-mail when the account has no name", async () => {
    renderApp([], "/", () => undefined, { name: undefined });
    expect(await screen.findByRole("heading", { name: "Hello, ann@example.com" })).toBeInTheDocument();
  });
});

describe("home Dict panel", () => {
  const REVIEW = "/api/dictionary/review?limit=1";
  const queue = (q: Record<string, unknown>) => (c: Call): Answer => (c.url === REVIEW ? { json: q } : undefined);

  it("shows the three counts, the saved words and a start link to /review", async () => {
    const calls = renderApp(["dictionary:word:read"], "/", queue({ newCount: 3, learningCount: "2", dueCount: 12, totalCount: "40", cards: [{ word: "x" }] }));
    expect(await screen.findByTestId("dict-new")).toHaveTextContent("3");
    expect(screen.getByTestId("dict-learning")).toHaveTextContent("2");
    expect(screen.getByTestId("dict-toReview")).toHaveTextContent("12");
    expect(screen.getByText("40 saved words")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start reviewing" })).toHaveAttribute("href", "https://dict.example.com/review");
    expect(screen.getByRole("link", { name: "Open Dict" })).toHaveAttribute("href", "https://dict.example.com/");
    expect(calls.filter((c) => c.url === REVIEW)).toHaveLength(1);
  });

  it("shows 10000+ for a capped count and the held cards", async () => {
    renderApp(["dictionary:word:read"], "/", queue({ newCount: 10000, totalCount: 12000, countsCapped: true, newHeld: 5, dueHeld: 2 }));
    expect(await screen.findByTestId("dict-new")).toHaveTextContent("10000+");
    expect(screen.getByText("5 new words and 2 review cards are waiting behind today's limits.")).toBeInTheDocument();
  });

  it("says the user is caught up and when to come back", async () => {
    renderApp(["dictionary:word:read"], "/", queue({ totalCount: 8, nextDueAt: new Date(Date.now() + 5 * 3600_000 + 60_000).toISOString() }));
    expect(await screen.findByText("You are all caught up.")).toBeInTheDocument();
    expect(screen.getByText("Come back in 5 h.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start reviewing" })).toBeNull();
  });

  it("offers Dict when there is no saved word", async () => {
    renderApp(["dictionary:word:read"], "/", queue({}));
    expect(await screen.findByText("No saved words yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Look up a word" })).toHaveAttribute("href", "https://dict.example.com/");
  });

  it("keeps the link to the app when the counts fail", async () => {
    renderApp(["dictionary:word:read"], "/", (c) => (c.url === REVIEW ? { status: 403, json: { message: "no" } } : undefined));
    expect(await screen.findByTestId("dict-unavailable")).toHaveTextContent("The numbers could not be loaded.");
    expect(screen.getByRole("link", { name: "Open Dict" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hello, Ann" })).toBeInTheDocument();
  });

  it("is not shown, nor called, without the permission", async () => {
    const calls = renderApp(["bill:invoice:read"]);
    await screen.findByRole("link", { name: "Open Bill" });
    expect(screen.queryByTestId("dict-panel")).toBeNull();
    expect(calls.some((c) => c.url.startsWith("/api/dictionary"))).toBe(false);
  });

  it("keeps a card without widget plain, and reads the counts again when the tab is shown", async () => {
    window.__env__ = { API_BASE: "https://api.example.com", APPS: JSON.stringify([{ name: "Dict", url: "https://dict.example.com" }]) };
    const plain = renderApp([]);
    await screen.findByRole("link", { name: "Open Dict" });
    expect(plain.some((c) => c.url.startsWith("/api/dictionary"))).toBe(false);
  });

  it("reads the counts again when the tab becomes visible", async () => {
    let n = 1;
    const calls = renderApp(["dictionary:word:read"], "/", (c) => (c.url === REVIEW ? { json: { newCount: n++, totalCount: 5 } } : undefined));
    expect(await screen.findByTestId("dict-new")).toHaveTextContent("1");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(screen.getByTestId("dict-new")).toHaveTextContent("2"));
    expect(calls.filter((c) => c.url === REVIEW)).toHaveLength(2);
  });

  it("speaks Vietnamese", async () => {
    renderApp(["dictionary:word:read"], "/", (c) => (c.url === "/api/me" ? { json: { user: { ...account, locale: "vi" } } } : queue({ newCount: 1, totalCount: 1 })(c)));
    expect(await screen.findByText("Cần ôn tập")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu ôn" })).toBeInTheDocument();
  });
});

describe("profile", () => {
  it("shows the e-mail and the roles read only, and saves the name through PUT /api/me", async () => {
    const calls = renderApp([], "/profile");
    const name = await screen.findByLabelText("Name");
    expect(screen.getByLabelText("E-mail")).toBeDisabled();
    expect(screen.getByText("member")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.clear(name);
    await user.type(name, "Ann Lee");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({ url: "/api/me", body: { name: "Ann Lee", locale: "en", theme: "light" } });
  });

  it("changes the language of the interface once saved", async () => {
    renderApp([], "/profile", (c) => (c.method === "PUT" ? { json: { user: { ...account, locale: "vi" } } } : undefined));
    await screen.findByLabelText("Name");
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Language" }));
    await user.click(await screen.findByRole("option", { name: "Tiếng Việt" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("vi"));
    expect(await screen.findByRole("button", { name: "Lưu" })).toBeInTheDocument();
  });

  it("removes the picture through PUT /api/me/avatar", async () => {
    const calls = renderApp([], "/profile", (c) => (c.method === "GET" && c.url === "/api/me" ? { json: { user: { ...account, avatar: "data:image/png;base64,AAAA" } } } : undefined));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Remove picture" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Profile saved.");
    expect(calls.find((c) => c.url === "/api/me/avatar")).toMatchObject({ method: "PUT", body: {} });
  });
});

describe("security", () => {
  async function fill(current: string, next: string, again: string) {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Current password"), current);
    await user.type(screen.getByLabelText("New password (at least 12 characters)"), next);
    await user.type(screen.getByLabelText("Repeat the new password"), again);
    await user.click(screen.getByRole("button", { name: "Change password" }));
  }

  it("does not call the server when the two new passwords differ", async () => {
    const calls = renderApp([], "/security");
    await fill("old-password-1", "new-password-12", "new-password-13");
    expect(await screen.findByText("The two passwords are not the same.")).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/api/me/password")).toHaveLength(0);
  });

  it("changes the password and offers to sign in again", async () => {
    const calls = renderApp([], "/security");
    await fill("old-password-1", "new-password-12", "new-password-12");
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/me/password")).toMatchObject({ method: "POST", body: { current_password: "old-password-1", new_password: "new-password-12" } });
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });

  it("shows the wrong current password in the language of the interface", async () => {
    const wrong = (c: Call): Answer =>
      c.url === "/api/me/password" ? { status: 400, json: { error: { code: "invalid_argument", reason: "wrong_current_password", message: "the current password is wrong" } } } : undefined;
    renderApp([], "/security", wrong);
    await fill("bad", "new-password-12", "new-password-12");
    expect(await screen.findByText("The current password is wrong.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeInTheDocument(); // the form stays
  });

  it("translates the error to Vietnamese", async () => {
    await i18n.changeLanguage("vi");
    // the language of the account wins once the profile is read, so the account speaks Vietnamese too
    const wrong = (c: Call): Answer =>
      c.url === "/api/me/password"
        ? { status: 400, json: { error: { code: "invalid_argument", reason: "wrong_current_password", message: "the current password is wrong" } } }
        : c.url === "/api/me" && c.method === "GET"
          ? { json: { user: { ...account, locale: "vi" } } }
          : undefined;
    renderApp([], "/security", wrong);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Mật khẩu hiện tại"), "bad");
    await user.type(screen.getByLabelText("Mật khẩu mới (ít nhất 12 ký tự)"), "new-password-12");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "new-password-12");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    expect(await screen.findByText("Mật khẩu hiện tại không đúng.")).toBeInTheDocument();
  });

  it("shows the enrollment (QR code and key) when MFA is off, and turns it on with the first code", async () => {
    const calls = renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa" && c.method === "GET"
        ? { json: {} }
        : c.url === "/api/me/mfa/setup"
          ? { json: { qr: "data:image/png;base64,AAAA", secret: "JBSWY3DP" } }
          : c.url === "/api/me/mfa" && c.method === "POST"
          ? { json: { recoveryCodes: ["aaaa-bbbb-cccc", "dddd-eeee-ffff"] } }
          : undefined,
    );
    const user = userEvent.setup();
    // nothing starts until the user asks: no QR code and no setup call yet
    const setUp = await screen.findByRole("button", { name: "Set up" });
    expect(screen.queryByAltText("QR code")).toBeNull();
    expect(calls.filter((c) => c.url === "/api/me/mfa/setup")).toHaveLength(0);
    await user.click(setUp);
    expect(await screen.findByAltText("QR code")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(screen.getByText("JBSWY3DP")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("aaaa-bbbb-cccc")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/me/mfa")?.body).toEqual({ code: "123456" });
  });

  it("cancels a pending setup and goes back to Set up", async () => {
    renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa" && c.method === "GET" ? { json: {} } : c.url === "/api/me/mfa/setup" ? { json: { qr: "data:image/png;base64,AAAA", secret: "JBSWY3DP" } } : undefined,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    await user.type(await screen.findByLabelText("Code"), "12");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByAltText("QR code")).toBeNull();
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
  });

  it("shows the translated error of a wrong first code", async () => {
    renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa" && c.method === "GET"
        ? { json: {} }
        : c.url === "/api/me/mfa/setup"
          ? { json: { qr: "data:image/png;base64,AAAA", secret: "JBSWY3DP" } }
          : c.url === "/api/me/mfa" && c.method === "POST"
          ? { status: 400, json: { error: { code: "invalid_argument", reason: "invalid_mfa_code", message: "the code is wrong" } } }
          : undefined,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    await user.type(await screen.findByLabelText("Code"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("Wrong code. Check the clock of your device and try again.")).toBeInTheDocument();
  });

  it("turns MFA off with the password and a code", async () => {
    const calls = renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa" && c.method === "GET" ? { json: { enabled: true, recoveryCodesLeft: 7 } } : undefined,
    );
    expect(await screen.findByText("Multi-factor authentication is on. Recovery codes left: 7.")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password"), "my-password-123");
    await user.type(screen.getByLabelText("Code or recovery code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/me/mfa/disable")).toMatchObject({ method: "POST", body: { password: "my-password-123", code: "123456" } }));
  });

  it("only says it when MFA is required for the account", async () => {
    renderApp([], "/security", (c) => (c.url === "/api/me/mfa" && c.method === "GET" ? { json: { enabled: true, forced: true } } : undefined));
    expect(await screen.findByText("It is required for your account and cannot be turned off.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  it("hides the card when MFA is turned off on the server", async () => {
    renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa" ? { status: 400, json: { error: { code: "failed_precondition", reason: "mfa_disabled_on_server", message: "off" } } } : undefined,
    );
    await screen.findByLabelText("Current password");
    await waitFor(() => expect(screen.queryByText("Multi-factor authentication")).toBeNull());
  });
});
