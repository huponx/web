import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import i18n from "./i18n";
import { allowedOf } from "./test-rules";

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}
type Answer = { status?: number; json?: unknown } | undefined;

const APPS = JSON.stringify([
  { name: "Dict", url: "https://dict.example.com", can: "GET /api/dictionary/saved", widget: "dict-review" },
  { name: "Bill", url: "https://bill.example.com", can: "bill.invoices" },
]);

const account = { id: "u1", email: "ann@example.com", name: "Ann", locale: "en", roles: ["member"], theme: "light" };

function renderApp(perms: string[], route = "/", answer: (c: Call) => Answer = () => undefined, profile: Partial<Me> = {}) {
  const calls: Call[] = [];
  const me: Me = { sub: "u1", name: "Ann", email: "ann@example.com", roles: ["member"], scopes: [], perms, allowed: allowedOf(perms), amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z", ...profile };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url, init) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      // the registry is read before the review counts; it is not a call the tests count
      if (u.endsWith("/api/dictionary/dictionaries")) return new Response(JSON.stringify({ groups: [{ id: "en", dictionaries: [] }] }), { status: 200 });
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
  const REVIEW = "/api/dictionary/review?group=en&limit=1";
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

  const mfaSetup = (verify: Answer = { json: { recoveryCodes: ["aaaa-bbbb-cccc", "dddd-eeee-ffff"] } }) => (c: Call): Answer =>
    c.url === "/api/me/mfa" && c.method === "GET"
      ? { json: {} }
      : c.url === "/api/me/mfa/setup"
        ? { json: { qr: "data:image/png;base64,AAAA", secret: "JBSWY3DP" } }
        : c.url === "/api/me/mfa" && c.method === "POST"
          ? verify
          : undefined;

  it("sets MFA up in three steps: connect the authenticator, verify it, save the recovery codes", async () => {
    const calls = renderApp([], "/security", mfaSetup());
    const user = userEvent.setup();
    // nothing starts until the user asks: no QR code and no setup call yet
    const setUp = await screen.findByRole("button", { name: "Set up" });
    expect(screen.queryByAltText("QR code")).toBeNull();
    expect(calls.filter((c) => c.url === "/api/me/mfa/setup")).toHaveLength(0);
    await user.click(setUp);

    // 1. connect
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Connect authenticator" })).toBeInTheDocument();
    expect(dialog.getByText("Scan the QR code using your authenticator app.")).toBeInTheDocument();
    expect(dialog.getByAltText("QR code")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    // the key to type stays hidden until the user cannot scan
    expect(dialog.queryByText("JBSWY3DP")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Can't scan the QR code? Show setup key" }));
    expect(dialog.getByText("JBSWY3DP")).toBeInTheDocument();
    expect(dialog.getByRole("listitem", { current: "step" })).toHaveTextContent("Connect");
    expect(dialog.queryByLabelText("Code")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Next" }));

    // 2. verify
    expect(dialog.getByRole("heading", { name: "Verify your authenticator" })).toBeInTheDocument();
    expect(dialog.getByRole("listitem", { current: "step" })).toHaveTextContent("Verify");
    await user.type(dialog.getByLabelText("Code"), "123456");
    await user.click(dialog.getByRole("button", { name: "Turn on" }));
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/me/mfa")?.body).toEqual({ code: "123456" });

    // 3. save the codes: Done waits for the confirmation, and the step cannot be closed by accident
    expect(await dialog.findByText("aaaa-bbbb-cccc")).toBeInTheDocument();
    expect(dialog.getByRole("heading", { name: "Save recovery codes" })).toBeInTheDocument();
    expect(dialog.getByRole("listitem", { current: "step" })).toHaveTextContent("Save codes");
    expect(dialog.queryByRole("button", { name: "Close" })).toBeNull();
    expect(dialog.getByRole("button", { name: "Done" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(dialog.getByRole("checkbox"));
    await user.click(dialog.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("goes back from the verification to the QR code", async () => {
    renderApp([], "/security", mfaSetup());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Next" }));
    await user.click(dialog.getByRole("button", { name: "Back" }));
    expect(dialog.getByAltText("QR code")).toBeInTheDocument();
  });

  it("cancels a pending setup and goes back to Set up", async () => {
    renderApp([], "/security", mfaSetup());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Next" }));
    await user.type(dialog.getByLabelText("Code"), "12");
    await user.click(dialog.getByRole("button", { name: "Back" }));
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByAltText("QR code")).toBeNull();
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
  });

  it("shows the translated error of a wrong first code and stays on the verification", async () => {
    renderApp([], "/security", mfaSetup({ status: 400, json: { error: { code: "invalid_argument", reason: "invalid_mfa_code", message: "the code is wrong" } } }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Next" }));
    await user.type(dialog.getByLabelText("Code"), "000000");
    await user.click(dialog.getByRole("button", { name: "Turn on" }));
    expect(await dialog.findByText("Wrong code. Check the clock of your device and try again.")).toBeInTheDocument();
    expect(dialog.getByRole("heading", { name: "Verify your authenticator" })).toBeInTheDocument();
  });

  const mfaOn = (c: Call): Answer =>
    c.url === "/api/me/mfa" && c.method === "GET"
      ? { json: { enabled: true, recoveryCodesLeft: 7 } }
      : c.url === "/api/me/mfa/setup"
        ? { json: { qr: "data:image/png;base64,AAAA", secret: "JBSWY3DP" } }
        : undefined;

  /** Opens the menu of the MFA row and picks an item. */
  async function pickMfa(user: ReturnType<typeof userEvent.setup>, item: string) {
    await user.click(await screen.findByRole("button", { name: "Authenticator actions" }));
    await user.click(await screen.findByRole("menuitem", { name: item }));
    return within(await screen.findByRole("dialog"));
  }

  it("shows MFA as a row with a menu, and no form", async () => {
    renderApp([], "/security", mfaOn);
    const row = await screen.findByTestId("mfa-row");
    expect(within(row).getByText("Authenticator app")).toBeInTheDocument();
    expect(within(row).getByText("Recovery codes left: 7")).toBeInTheDocument();
    expect(screen.queryByLabelText("Code or recovery code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  it("disables MFA: the dialog confirms first, the password and a code are asked only after that", async () => {
    const calls = renderApp([], "/security", mfaOn);
    const user = userEvent.setup();
    const dialog = await pickMfa(user, "Disable MFA");
    expect(dialog.getByText(/Turn off multi-factor authentication\?/)).toBeInTheDocument();
    expect(dialog.queryByLabelText("Password")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    expect(calls.some((c) => c.url === "/api/me/mfa/disable")).toBe(false);
    await user.type(dialog.getByLabelText("Password"), "my-password-123");
    await user.type(dialog.getByLabelText("Code or recovery code"), "123456");
    await user.click(dialog.getByRole("button", { name: "Disable MFA" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/me/mfa/disable")).toMatchObject({ method: "POST", body: { password: "my-password-123", code: "123456" } }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog and shows the error when the re-authentication is refused", async () => {
    renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa/disable" ? { status: 400, json: { error: { code: "invalid_argument", reason: "wrong_current_password", message: "x" } } } : mfaOn(c),
    );
    const user = userEvent.setup();
    const dialog = await pickMfa(user, "Disable MFA");
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Password"), "bad");
    await user.type(dialog.getByLabelText("Code or recovery code"), "123456");
    await user.click(dialog.getByRole("button", { name: "Disable MFA" }));
    expect(await dialog.findByText("The current password is wrong.")).toBeInTheDocument();
  });

  it("changes the authenticator: re-authenticates, turns the old one off and goes on to the setup wizard", async () => {
    const calls = renderApp([], "/security", mfaOn);
    const user = userEvent.setup();
    const dialog = await pickMfa(user, "Change authenticator");
    expect(dialog.getByText(/stops working now/)).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Password"), "pw");
    await user.type(dialog.getByLabelText("Code or recovery code"), "123456");
    await user.click(dialog.getByRole("button", { name: "Change authenticator" }));
    // the wizard of the new authenticator opens with its QR code
    expect(await screen.findByAltText("QR code")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(screen.getByRole("heading", { name: "Connect authenticator" })).toBeInTheDocument();
    expect(calls.map((c) => c.url).filter((u) => u.startsWith("/api/me/mfa/"))).toEqual(["/api/me/mfa/disable", "/api/me/mfa/setup"]);
  });

  it("generates new recovery codes: confirm, password and an app code, then the codes are shown once", async () => {
    let status = 7;
    const calls = renderApp([], "/security", (c) => {
      if (c.url === "/api/me/mfa/recovery-codes") {
        status = 10;
        return { json: { recoveryCodes: ["new1-aaaa-bbbb", "new2-cccc-dddd"] } };
      }
      return c.url === "/api/me/mfa" && c.method === "GET" ? { json: { enabled: true, recoveryCodesLeft: status } } : mfaOn(c);
    });
    const user = userEvent.setup();
    const dialog = await pickMfa(user, "Generate new recovery codes");
    expect(dialog.getByText(/The current ones stop working at once/)).toBeInTheDocument();
    expect(dialog.queryByLabelText("Password")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    expect(calls.some((c) => c.url === "/api/me/mfa/recovery-codes")).toBe(false);
    await user.type(dialog.getByLabelText("Password"), "my-password-123");
    expect(dialog.queryByLabelText("Code or recovery code")).toBeNull();
    await user.type(dialog.getByLabelText("Code from your authenticator app"), "123456");
    await user.click(dialog.getByRole("button", { name: "Generate new codes" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/me/mfa/recovery-codes")).toMatchObject({ method: "POST", body: { password: "my-password-123", code: "123456" } }));

    // the codes are shown once, without the setup steps; Done waits for the confirmation
    const wizard = within(await screen.findByRole("dialog"));
    expect(await wizard.findByText("new1-aaaa-bbbb")).toBeInTheDocument();
    expect(wizard.getByRole("heading", { name: "Save recovery codes" })).toBeInTheDocument();
    expect(wizard.queryByRole("listitem", { current: "step" })).toBeNull();
    expect(wizard.getByRole("button", { name: "Done" })).toBeDisabled();
    const before = calls.filter((c) => c.url === "/api/me/mfa" && c.method === "GET").length;
    await user.click(wizard.getByRole("checkbox"));
    await user.click(wizard.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/me/mfa" && c.method === "GET").length).toBeGreaterThan(before));
    expect(await screen.findByText("Recovery codes left: 10")).toBeInTheDocument();
  });

  it("keeps the dialog and shows the error when the app code is wrong while generating codes", async () => {
    renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa/recovery-codes" ? { status: 400, json: { error: { code: "invalid_argument", reason: "invalid_mfa_code", message: "x" } } } : mfaOn(c),
    );
    const user = userEvent.setup();
    const dialog = await pickMfa(user, "Generate new recovery codes");
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Password"), "pw");
    await user.type(dialog.getByLabelText("Code from your authenticator app"), "000000");
    await user.click(dialog.getByRole("button", { name: "Generate new codes" }));
    expect(await dialog.findByText("Wrong code. Check the clock of your device and try again.")).toBeInTheDocument();
    expect(screen.queryByText("Save recovery codes")).toBeNull();
  });

  it("lets a user with required MFA generate new codes but not turn it off or change it", async () => {
    renderApp([], "/security", (c) => (c.url === "/api/me/mfa" && c.method === "GET" ? { json: { enabled: true, forced: true, recoveryCodesLeft: 7 } } : mfaOn(c)));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Authenticator actions" }));
    expect(await screen.findByRole("menuitem", { name: "Generate new recovery codes" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Disable MFA" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Change authenticator" })).toBeNull();
  });

  it("warns when only a few recovery codes are left, and offers new ones", async () => {
    renderApp([], "/security", (c) => (c.url === "/api/me/mfa" && c.method === "GET" ? { json: { enabled: true, recoveryCodesLeft: 2 } } : mfaOn(c)));
    const user = userEvent.setup();
    expect(await screen.findByText("Running low on recovery codes: 2 left.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate new codes" }));
    expect(within(await screen.findByRole("dialog")).getByText(/The current ones stop working at once/)).toBeInTheDocument();
  });

  it("does not warn while there are enough recovery codes", async () => {
    renderApp([], "/security", mfaOn);
    await screen.findByTestId("mfa-row");
    expect(screen.queryByText(/Running low/)).toBeNull();
  });

  it("cancelling the dialog changes nothing", async () => {
    const calls = renderApp([], "/security", mfaOn);
    const user = userEvent.setup();
    const dialog = await pickMfa(user, "Disable MFA");
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.some((c) => c.url === "/api/me/mfa/disable")).toBe(false);
  });

  it("says it when MFA is required for the account, and offers only the recovery codes", async () => {
    renderApp([], "/security", (c) => (c.url === "/api/me/mfa" && c.method === "GET" ? { json: { enabled: true, forced: true, recoveryCodesLeft: 7 } } : undefined));
    expect(await screen.findByText("It is required for your account and cannot be turned off.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Authenticator actions" })).toBeInTheDocument();
  });

  it("hides the card when MFA is turned off on the server", async () => {
    renderApp([], "/security", (c) =>
      c.url === "/api/me/mfa" ? { status: 400, json: { error: { code: "failed_precondition", reason: "mfa_disabled_on_server", message: "off" } } } : undefined,
    );
    await screen.findByLabelText("Current password");
    await waitFor(() => expect(screen.queryByText("Multi-factor authentication")).toBeNull());
  });
});

describe("security: passkeys", () => {
  const rows = [
    { id: "p1", name: "Laptop", createdAt: "1792000000", lastUsedAt: "1793000000", synced: true },
    { id: "p2", name: "Phone", createdAt: "1792000100" },
  ];
  const optionsJson = JSON.stringify({ publicKey: { challenge: "AQID", rp: { name: "Example", id: "localhost" }, user: { id: "BAUG", name: "ann@example.com", displayName: "Ann" } } });
  const credential = { id: "cred", rawId: new ArrayBuffer(1), type: "public-key", toJSON: () => ({ id: "cred", type: "public-key", response: {} }) };
  let list = rows;

  function browser(create: unknown = vi.fn().mockResolvedValue(credential)) {
    vi.stubGlobal("PublicKeyCredential", function () {});
    Object.defineProperty(navigator, "credentials", { value: { create, get: vi.fn() }, configurable: true });
    return create as ReturnType<typeof vi.fn>;
  }
  const security = (extra?: (c: Call) => Answer) =>
    renderApp([], "/security", (c) => {
      const own = extra?.(c);
      if (own) return own;
      if (c.url === "/api/me/passkeys" && c.method === "GET") return { json: { passkeys: list, max: 20 } };
      if (c.url === "/api/me/passkeys/begin") return { json: { ceremonyId: "cer1", optionsJson } };
      return undefined;
    });
  beforeEach(() => {
    list = rows;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "credentials");
  });

  it("lists the passkeys with what each is", async () => {
    browser();
    security();
    const items = await screen.findAllByTestId("passkey-row");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Laptop")).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Synced/)).toBeInTheDocument();
    expect(within(items[1]!).getByText(/This device only/)).toBeInTheDocument();
    expect(within(items[1]!).getByText(/Never used/)).toBeInTheDocument();
  });

  it("is not shown when the server has passkeys turned off", async () => {
    browser();
    renderApp([], "/security", (c) =>
      c.url === "/api/me/passkeys" ? { status: 404, json: { error: { code: "not_found", reason: "passkeys_off", message: "off" } } } : undefined,
    );
    await screen.findByLabelText("Current password");
    await waitFor(() => expect(screen.queryByTestId("passkeys")).toBeNull());
  });

  /** Opens the menu of the row and picks an item. */
  async function pick(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, item: string) {
    await user.click(within(row).getByRole("button", { name: /^Actions for / }));
    await user.click(await screen.findByRole("menuitem", { name: item }));
    return screen.findByRole("dialog");
  }

  it("has no rename and delete buttons in the rows, only a menu", async () => {
    browser();
    security();
    const [first] = await screen.findAllByTestId("passkey-row");
    expect(within(first!).queryByRole("button", { name: "Rename" })).toBeNull();
    expect(within(first!).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(first!).getByRole("button", { name: "Actions for Laptop" })).toBeInTheDocument();
  });

  it("adds a passkey: a dialog names it, the password comes only after Continue, then the prompt of the browser", async () => {
    const create = browser();
    const calls = security((c) => {
      if (c.url === "/api/me/passkeys" && c.method === "POST") {
        list = [...rows, { id: "p3", name: "Work key", createdAt: "1793100000" }];
        return { json: { passkey: list[2] } };
      }
      return undefined;
    });
    const user = userEvent.setup();
    await screen.findAllByTestId("passkey-row");
    // no form, no password field on the page
    expect(screen.queryByLabelText("Confirm with your password")).toBeNull();
    await user.click(within(screen.getByTestId("passkeys")).getByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.queryByLabelText("Confirm with your password")).toBeNull();
    await user.type(dialog.getByLabelText("Name of the passkey"), "Work key");
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    expect(calls.some((c) => c.url === "/api/me/passkeys/begin")).toBe(false); // nothing asked of the server yet
    await user.type(dialog.getByLabelText("Confirm with your password"), "pw");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    expect(await screen.findByText("Passkey added.")).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.url === "/api/me/passkeys/begin")?.body).toEqual({ password: "pw" });
    const finish = calls.find((c) => c.url === "/api/me/passkeys" && c.method === "POST");
    expect(finish?.body).toMatchObject({ ceremony_id: "cer1", name: "Work key" });
    expect(JSON.parse(String(finish?.body?.credential_json))).toMatchObject({ id: "cred" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findAllByTestId("passkey-row")).toHaveLength(3);
  });

  it("shows the translated error of a wrong password in the dialog and does not open the prompt", async () => {
    const create = browser();
    security((c) => (c.url === "/api/me/passkeys/begin" ? { status: 400, json: { error: { code: "invalid_argument", reason: "wrong_current_password", message: "x" } } } : undefined));
    const user = userEvent.setup();
    await screen.findAllByTestId("passkey-row");
    await user.click(within(screen.getByTestId("passkeys")).getByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Confirm with your password"), "bad");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    expect(await dialog.findByText("The current password is wrong.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("adds nothing when the prompt of the browser is dismissed", async () => {
    browser(vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")));
    const calls = security();
    const user = userEvent.setup();
    await screen.findAllByTestId("passkey-row");
    await user.click(within(screen.getByTestId("passkeys")).getByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Confirm with your password"), "pw");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/me/passkeys/begin")).toBe(true));
    await waitFor(() => expect(dialog.getByRole("button", { name: "Create passkey" })).not.toBeDisabled());
    expect(calls.some((c) => c.url === "/api/me/passkeys" && c.method === "POST")).toBe(false);
    expect(screen.queryByText("Passkey added.")).toBeNull();
  });

  it("cancelling the dialog asks the server for nothing", async () => {
    browser();
    const calls = security();
    const user = userEvent.setup();
    await screen.findAllByTestId("passkey-row");
    await user.click(within(screen.getByTestId("passkeys")).getByRole("button", { name: "Add a passkey" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.some((c) => c.url === "/api/me/passkeys/begin")).toBe(false);
  });

  it("renames a passkey in a dialog with PUT", async () => {
    browser();
    const calls = security((c) => (c.method === "PUT" && c.url.startsWith("/api/me/passkeys/") ? { json: {} } : undefined));
    const user = userEvent.setup();
    const [first] = await screen.findAllByTestId("passkey-row");
    const dialog = within(await pick(user, first!, "Rename"));
    const field = dialog.getByLabelText("Name of the passkey");
    expect(field).toHaveValue("Laptop");
    await user.clear(field);
    await user.type(field, "Old laptop");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url === "/api/me/passkeys/p1")).toBe(true));
    expect(calls.find((c) => c.method === "PUT" && c.url === "/api/me/passkeys/p1")?.body).toEqual({ name: "Old laptop" });
  });

  it("deletes a passkey: the dialog confirms first, the password is asked only after that", async () => {
    browser();
    const calls = security((c) => (c.method === "DELETE" ? { json: {} } : undefined));
    const user = userEvent.setup();
    const [first] = await screen.findAllByTestId("passkey-row");
    const dialog = within(await pick(user, first!, "Delete"));
    expect(dialog.getByText("Delete “Laptop”? You will no longer be able to sign in with it.")).toBeInTheDocument();
    expect(dialog.queryByLabelText("Confirm with your password")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false); // confirmed, but not sent without the password
    expect(dialog.getByText("Enter your password to delete “Laptop”.")).toBeInTheDocument();
    await user.type(dialog.getByLabelText("Confirm with your password"), "pw");
    list = [rows[1]!];
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Passkey removed.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ url: "/api/me/passkeys/p1", body: { password: "pw" } });
    expect(await screen.findAllByTestId("passkey-row")).toHaveLength(1);
  });

  it("says so in a browser that cannot create passkeys", async () => {
    security();
    expect(await screen.findByText("This browser cannot create passkeys.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
  });
});

describe("security: sessions", () => {
  const sessions = [
    { id: "s1", ip: "10.0.0.1", browser: "Chrome", os: "macOS", device: "desktop", amr: ["pwd"], createdAt: "1792000000", lastSeenAt: String(Math.floor(Date.now() / 1000) - 300), current: true },
    { id: "s2", ip: "10.0.0.2", browser: "Safari", os: "iOS", device: "mobile", amr: ["pwd", "swk", "mfa"], createdAt: "1792000100" },
  ];
  const security = (list = sessions) =>
    renderApp([], "/security", (c) => (c.url === "/api/me/sessions" && c.method === "GET" ? { json: { sessions: list } } : undefined));

  it("lists the sessions and marks this device", async () => {
    security();
    const rows = await screen.findAllByTestId("session-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Chrome on macOS")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("This device")).toBeInTheDocument();
    expect(rows[0]!).toHaveTextContent("last active 5 minutes ago");
    expect(within(rows[1]!).getByText("Safari on iOS")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText("This device")).toBeNull();
  });

  it("signs out another session after a confirmation", async () => {
    const calls = security();
    const rows = await screen.findAllByTestId("session-row");
    await userEvent.click(within(rows[1]!).getByRole("button", { name: "Actions for Safari on iOS" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out this session" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(await screen.findByTestId("confirm-ok"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", url: "/api/me/sessions/s2" })));
    expect(await screen.findByText("Session signed out.")).toBeInTheDocument();
  });

  it("warns before ending the current session", async () => {
    const calls = security();
    const rows = await screen.findAllByTestId("session-row");
    await userEvent.click(within(rows[0]!).getByRole("button", { name: "Actions for Chrome on macOS" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out this session" }));
    expect(await screen.findByText(/signed out immediately/)).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("confirm-ok"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", url: "/api/me/sessions/s1" })));
  });

  it("signs out of all the other sessions", async () => {
    const calls = security();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all other sessions" }));
    await userEvent.click(await screen.findByTestId("confirm-ok"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/me/sessions/revoke-others" })));
  });

  it("has no 'all others' button when this is the only session", async () => {
    security([sessions[0]!]);
    await screen.findAllByTestId("session-row");
    expect(screen.queryByRole("button", { name: "Sign out of all other sessions" })).toBeNull();
  });
});

describe("notifications", () => {
  const list = {
    items: [{ id: "n1", title: "Two-step verification turned on", body: "", link: "", severity: "SEVERITY_WARNING", read: false, createdAt: "1700000000" }],
    unread: 1,
  };

  it("shows no bell when the gateway does not list the route", async () => {
    const calls = renderApp([]);
    await screen.findByRole("heading", { name: "Hello, Ann" });
    expect(screen.queryByTestId("notifications")).toBeNull();
    expect(calls.some((c) => c.url.startsWith("/api/notifications"))).toBe(false);
  });

  it("shows the bell with the unread count and marks an item read when it is opened", async () => {
    const calls = renderApp([], "/", (c) => (c.url.startsWith("/api/notifications?") ? { json: list } : c.url === "/api/notifications/read" ? { json: { unread: 0 } } : undefined), {
      allowed: ["GET /api/notifications"],
    });
    const bell = await screen.findByRole("button", { name: "1 unread notification" });
    await waitFor(() => expect(screen.getByTestId("notifications-badge")).toHaveTextContent("1"));
    await userEvent.click(bell);
    expect(await screen.findByText("Two-step verification turned on")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("notifications-read-all"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/notifications/read" && c.body?.all === true)).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("notifications-badge")).toBeNull());
  });
});

describe("notification settings", () => {
  const prefs = {
    categories: [
      { category: "admin", mandatory: false, channels: ["email", "in_app"], disabledChannels: ["email"] },
      { category: "security", mandatory: true, channels: ["email", "in_app"] },
    ],
    quietHours: { enabled: false },
    telegram: { available: true, linked: false },
  };
  const allowed = ["GET /api/notifications/preferences"];

  it("is in the menu only when the gateway lists the route", async () => {
    renderApp([]);
    await screen.findByRole("heading", { name: "Hello, Ann" });
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
  });

  it("shows the choices, keeps security on, and saves what the user turned off", async () => {
    const calls = renderApp([], "/notifications", (c) => (c.url === "/api/notifications/preferences" && c.method === "GET" ? { json: prefs } : undefined), { allowed });
    const admin = await screen.findByTestId("category-admin");
    const sec = screen.getByTestId("category-security");
    const [adminEmail, adminBell] = within(admin).getAllByRole("switch");
    expect(adminEmail).not.toBeChecked(); // turned off before
    expect(adminBell).toBeChecked();
    for (const s of within(sec).getAllByRole("switch")) {
      expect(s).toBeChecked();
      expect(s).toBeDisabled(); // a mandatory category cannot be turned off
    }
    await userEvent.click(adminBell!); // the bell off, e-mail stays off
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/notifications/preferences");
    expect(put.body).toEqual({ categories: [{ category: "admin", disabledChannels: expect.arrayContaining(["email", "in_app"]) }], quietHours: { enabled: false } });
  });

  it("sends the quiet hours with the time zone when they are turned on", async () => {
    const calls = renderApp([], "/notifications", (c) => (c.url === "/api/notifications/preferences" && c.method === "GET" ? { json: prefs } : undefined), { allowed });
    await userEvent.click(await screen.findByRole("switch", { name: "Hold messages during quiet hours" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body?.quietHours).toMatchObject({ enabled: true, from: "22:00", to: "07:00" });
  });

  it("starts the Telegram link and shows the link and the code", async () => {
    renderApp(
      [],
      "/notifications",
      (c) =>
        c.url === "/api/notifications/preferences" && c.method === "GET"
          ? { json: prefs }
          : c.url === "/api/notifications/telegram-binding" && c.method === "POST"
            ? { json: { code: "ABCDE23456", link: "https://t.me/MyBot?start=ABCDE23456", expiresAt: String(Math.floor(Date.now() / 1000) + 900) } }
            : undefined,
      { allowed },
    );
    expect(await screen.findByTestId("telegram-state")).toHaveTextContent("Not linked");
    await userEvent.click(screen.getByRole("button", { name: "Link Telegram" }));
    const box = await screen.findByTestId("telegram-binding");
    expect(within(box).getByRole("link", { name: "Open Telegram" })).toHaveAttribute("href", "https://t.me/MyBot?start=ABCDE23456");
    expect(box).toHaveTextContent("/start ABCDE23456");
  });

  it("unlinks a linked Telegram chat", async () => {
    const calls = renderApp(
      [],
      "/notifications",
      (c) => (c.url === "/api/notifications/preferences" && c.method === "GET" ? { json: { ...prefs, telegram: { available: true, linked: true } } } : undefined),
      { allowed },
    );
    expect(await screen.findByTestId("telegram-state")).toHaveTextContent("Linked");
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/notifications/telegram-binding")).toBe(true));
  });
});

describe("browser notifications (Web Push)", () => {
  const prefs = (push: object) => ({ categories: [], quietHours: { enabled: false }, telegram: { available: false }, push });
  const ENDPOINT = "https://push.example.com/abc";

  function stubBrowser(subscribed: boolean, permission: "default" | "denied" = "default") {
    const sub = { endpoint: ENDPOINT, toJSON: () => ({ keys: { p256dh: "P", auth: "A" } }), unsubscribe: vi.fn(async () => true) };
    let current: typeof sub | null = subscribed ? sub : null;
    const pushManager = {
      getSubscription: async () => current,
      subscribe: vi.fn(async () => {
        current = sub;
        return sub;
      }),
    };
    const reg = { pushManager };
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { permission, requestPermission: vi.fn(async () => (permission === "denied" ? "denied" : "granted")) });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn(async () => reg), ready: Promise.resolve(reg), getRegistration: async () => reg },
    });
    return { sub, pushManager };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error removing the stub
    delete navigator.serviceWorker;
  });

  const allowed = ["GET /api/notifications/preferences"];
  const answer = (push: object) => (c: Call) => (c.url === "/api/notifications/preferences" && c.method === "GET" ? { json: prefs(push) } : undefined);

  it("hides the section when courier has no VAPID keys or the browser cannot do Web Push", async () => {
    stubBrowser(false);
    renderApp([], "/notifications", answer({ available: false }), { allowed });
    await screen.findByText("Choose what reaches you and where.");
    expect(screen.queryByTestId("push-state")).toBeNull();
  });

  it("subscribes this browser and tells courier", async () => {
    const { pushManager } = stubBrowser(false);
    const calls = renderApp([], "/notifications", answer({ available: true, publicKey: "-__-", endpoints: [] }), { allowed });
    expect(await screen.findByTestId("push-state")).toHaveTextContent("Off for this device");
    await userEvent.click(screen.getByRole("button", { name: "Turn on for this device" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/notifications/push-subscription")).toBe(true));
    expect(calls.find((c) => c.url === "/api/notifications/push-subscription")!.body).toEqual({ endpoint: ENDPOINT, p256dh: "P", auth: "A", userAgent: navigator.userAgent });
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(await screen.findByText("Browser notifications are on for this device.")).toBeInTheDocument();
  });

  it("shows this device as on and turns it off", async () => {
    const { sub } = stubBrowser(true);
    const calls = renderApp([], "/notifications", answer({ available: true, publicKey: "-__-", endpoints: [ENDPOINT, "https://push.example.com/other"] }), { allowed });
    await waitFor(() => expect(screen.getByTestId("push-state")).toHaveTextContent("On for this device"));
    expect(screen.getByTestId("push-state")).toHaveTextContent("2 devices");
    await userEvent.click(screen.getByRole("button", { name: "Turn off for this device" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === `/api/notifications/push-subscription?endpoint=${encodeURIComponent(ENDPOINT)}`)).toBe(true));
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it("says so when the browser blocks notifications", async () => {
    stubBrowser(false, "denied");
    const calls = renderApp([], "/notifications", answer({ available: true, publicKey: "-__-", endpoints: [] }), { allowed });
    expect(await screen.findByText(/The browser blocks notifications for this site/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn on for this device" }));
    expect((await screen.findAllByText(/The browser blocks notifications for this site/)).length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url === "/api/notifications/push-subscription")).toBe(false);
  });
});
