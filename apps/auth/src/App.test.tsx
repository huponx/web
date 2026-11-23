import { ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { resetCsrf } from "./api";

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}
type Answer = { status?: number; json?: unknown } | undefined;

const assign = vi.fn();

/** Stands in for identity: `answer` gets every call (the CSRF fetch is answered here) and returns the response. */
function renderAt(path: string, answer: (c: Call) => Answer = () => ({ json: {} })) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const c: Call = { method: init?.method ?? "GET", url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined };
      if (url === "/auth-api/csrf") return Promise.resolve(new Response(JSON.stringify({ csrf: "tok" }), { status: 200 }));
      calls.push(c);
      const a = answer(c) ?? { json: {} };
      return Promise.resolve(new Response(JSON.stringify(a.json ?? {}), { status: a.status ?? 200 }));
    }),
  );
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  );
  return calls;
}

const fail = (status: number, code: string): Answer => ({ status, json: { code, message: "server text" } });

beforeEach(() => {
  resetCsrf();
  assign.mockReset();
  Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true, configurable: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("account MFA page", () => {
  it("has a way back: to return_to, to the applications without one", async () => {
    renderAt("/account/mfa?return_to=%2Fapps", () => ({ json: { enabled: true, forced: true, codesLeft: 3 } }));
    expect(await screen.findByTestId("mfa-back")).toHaveAttribute("href", "/apps");
  });
  it("does not follow a return_to that leaves the site", async () => {
    renderAt("/account/mfa?return_to=https%3A%2F%2Fevil.example", () => ({ json: { enabled: true, forced: true, codesLeft: 3 } }));
    expect(await screen.findByTestId("mfa-back")).toHaveAttribute("href", "/apps");
  });
});

describe("login", () => {
  it("has switches for the theme and the language on every page", async () => {
    renderAt("/login");
    const user = userEvent.setup();
    const theme = await screen.findByTestId("theme-switch");
    const before = theme.getAttribute("data-theme");
    await user.click(theme);
    expect(screen.getByTestId("theme-switch").getAttribute("data-theme")).not.toBe(before);
    const lang = screen.getByTestId("language-switch");
    const code = lang.textContent;
    await user.click(lang);
    expect(screen.getByTestId("language-switch").textContent).not.toBe(code);
    await user.click(screen.getByTestId("language-switch")); // back to the language the other tests expect
  });

  it("posts the credentials with the CSRF token and the return_to, then follows the redirect", async () => {
    const calls = renderAt("/login?return_to=%2Foauth2%2Fauthorize%3Fx%3D1", () => ({ json: { redirect: "/oauth2/authorize?x=1" } }));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/oauth2/authorize?x=1"));
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "/auth-api/login",
      body: { email: "a@example.com", password: "pw", return_to: "/oauth2/authorize?x=1", csrf: "tok" },
    });
  });

  it("shows a wrong password and does not navigate", async () => {
    renderAt("/login", () => fail(401, "invalid_credentials"));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "bad");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Wrong e-mail or password.")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("never follows a redirect that is not a path of this site", async () => {
    renderAt("/login", () => ({ json: { redirect: "https://evil.example/" } }));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
    expect(assign).not.toHaveBeenCalled();
  });

  it("fetches a new CSRF token and retries once when the form expired", async () => {
    let n = 0;
    const calls = renderAt("/login", () => (n++ === 0 ? fail(403, "csrf_expired") : { json: { redirect: "/account/mfa" } }));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/account/mfa"));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("is in Vietnamese when the browser asks for it", async () => {
    const i18n = (await import("./i18n")).default;
    await i18n.changeLanguage("vi");
    renderAt("/login");
    expect(await screen.findByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
  });
});

describe("second factor", () => {
  it("goes back to the login when the challenge is gone", async () => {
    renderAt("/login/mfa?c=x", (c) => (c.url.startsWith("/auth-api/login/mfa") ? fail(404, "challenge_expired") : undefined));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("verifies the code and follows the redirect; a wrong code stays on the page", async () => {
    let code = "";
    const calls = renderAt("/login/mfa?c=chal", (c) => {
      if (c.method === "GET") return { json: {} };
      code = String(c.body?.code);
      return code === "111111" ? { json: { redirect: "/oauth2/authorize?a=b" } } : fail(401, "invalid_mfa_code");
    });
    const user = userEvent.setup();
    const field = await screen.findByLabelText("Code from your authenticator app, or a recovery code");
    await user.type(field, "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Wrong code.")).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "111111");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/oauth2/authorize?a=b"));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ c: "chal", csrf: "tok" });
  });

  it("sends the user back to the login with the reason after too many wrong codes", async () => {
    renderAt("/login/mfa?c=chal", (c) => (c.method === "GET" ? { json: {} } : fail(401, "challenge_expired")));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Code from your authenticator app, or a recovery code"), "1");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Too many wrong attempts or the request expired. Please sign in again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("forced password change", () => {
  it("shows the notice, rejects different passwords from the server and continues on success", async () => {
    let n = 0;
    const calls = renderAt("/login/password?c=chal", (c) => {
      if (c.method === "GET") return { json: {} };
      return n++ === 0 ? fail(422, "password_mismatch") : { json: { redirect: "/account/mfa?return_to=x" } };
    });
    const user = userEvent.setup();
    expect(await screen.findByText(/signing in with a temporary password/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password (at least 12 characters)"), "a-long-password-1");
    await user.type(screen.getByLabelText("Repeat the new password"), "a-long-password-2");
    await user.click(screen.getByRole("button", { name: "Set the password" }));
    expect(await screen.findByText("The two passwords are not the same.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set the password" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/account/mfa?return_to=x"));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ c: "chal", password: "a-long-password-1", password2: "a-long-password-2" });
  });
});

describe("forgot and reset", () => {
  it("says the same whatever the address, and hides the form", async () => {
    const calls = renderAt("/password/forgot");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Send the link" }));
    expect(await screen.findByText(/If the address is registered/)).toBeInTheDocument();
    expect(screen.queryByLabelText("E-mail")).toBeNull();
    expect(calls[0]).toMatchObject({ url: "/auth-api/password/forgot", body: { email: "a@example.com" } });
  });

  it("explains an invalid or expired link", async () => {
    renderAt("/password/reset?token=old", () => fail(400, "invalid_link"));
    expect(await screen.findByText("This link is not valid or has expired. Ask for a new one.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/password/forgot");
  });

  it("sets the new password and offers the login", async () => {
    const calls = renderAt("/password/reset?token=tok1");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("New password (at least 12 characters)"), "a-long-password-1");
    await user.click(screen.getByRole("button", { name: "Set the password" }));
    expect(await screen.findByText(/signed out everywhere/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ token: "tok1", password: "a-long-password-1" });
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/login");
  });

  it("shows the reason of a refused password", async () => {
    renderAt("/password/reset?token=tok1", (c) => (c.method === "POST" ? fail(422, "password_common") : { json: {} }));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("New password (at least 12 characters)"), "passwordpassword");
    await user.click(screen.getByRole("button", { name: "Set the password" }));
    expect(await screen.findByText("The password is too common.")).toBeInTheDocument();
  });
});

describe("account MFA", () => {
  it("sends a visitor without a session to the login and back", async () => {
    renderAt("/account/mfa?return_to=%2Foauth2%2Fauthorize%3Fq%3D1", () => fail(401, "unauthenticated"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`/login?return_to=${encodeURIComponent("/account/mfa?return_to=%2Foauth2%2Fauthorize%3Fq%3D1")}`));
  });

  it("enrolls: QR code and key, then the recovery codes once and a Continue button", async () => {
    const calls = renderAt("/account/mfa?return_to=%2Foauth2%2Fauthorize%3Fq%3D1", (c) =>
      c.method === "GET"
        ? { json: { enabled: false, qr: "data:image/png;base64,AAAA", secret: "ABCDEF" } }
        : { json: { recoveryCodes: ["aaaa-bbbb", "cccc-dddd"], redirect: "/oauth2/authorize?q=1" } },
    );
    const user = userEvent.setup();
    expect(await screen.findByAltText("QR code")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(screen.getByText("ABCDEF")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("aaaa-bbbb")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ code: "123456", return_to: "/oauth2/authorize?q=1" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(assign).toHaveBeenCalledWith("/oauth2/authorize?q=1");
  });

  it("shows a wrong code and keeps the QR code", async () => {
    renderAt("/account/mfa", (c) => (c.method === "GET" ? { json: { enabled: false, qr: "data:image/png;base64,AAAA", secret: "ABCDEF" } } : fail(401, "invalid_code")));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Code"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/Wrong code. Check the clock/)).toBeInTheDocument();
    expect(screen.getByAltText("QR code")).toBeInTheDocument();
  });

  it("turns MFA off with the password and a code, then shows the enrollment again", async () => {
    let enabled = true;
    const calls = renderAt("/account/mfa", (c) => {
      if (c.method === "POST") {
        enabled = false;
        return { json: {} };
      }
      return { json: enabled ? { enabled: true, codesLeft: 8, forced: false } : { enabled: false, qr: "data:image/png;base64,AAAA", secret: "S" } };
    });
    const user = userEvent.setup();
    expect(await screen.findByText(/Recovery codes left: 8/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.type(screen.getByLabelText("Code or recovery code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByAltText("QR code")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/auth-api/account/mfa/disable", body: { password: "pw", code: "123456" } });
  });

  it("cannot turn MFA off when it is required", async () => {
    renderAt("/account/mfa", () => ({ json: { enabled: true, codesLeft: 3, forced: true } }));
    expect(await screen.findByText(/required for your account/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  it("says the page does not exist when MFA is off for the whole service", async () => {
    renderAt("/account/mfa", () => fail(404, "not_found"));
    expect(await screen.findByText("This page does not exist.")).toBeInTheDocument();
  });
});

describe("logout and error pages", () => {
  it("posts the parameters of the request and follows the redirect of the server", async () => {
    const calls = renderAt("/logout?post_logout_redirect_uri=https%3A%2F%2Fapp.example%2F&state=s1&client_id=web", () => ({
      json: { redirect: "/after" },
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/after"));
    expect(calls[0]).toMatchObject({
      url: "/auth-api/logout",
      body: { post_logout_redirect_uri: "https://app.example/", state: "s1", client_id: "web", csrf: "tok" },
    });
  });

  it("follows the registered address of the application the server returns, a full URL included", async () => {
    renderAt("/logout?client_id=web", () => ({ json: { redirect: "https://app.example/bye?state=s1" } }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://app.example/bye?state=s1"));
  });

  it("does not ask again when identity already signed the user out", async () => {
    renderAt("/logout?done=1");
    expect(await screen.findByText("You have been signed out.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("says so when there is nowhere to go back to", async () => {
    renderAt("/logout");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("You have been signed out.")).toBeInTheDocument();
  });

  it("explains an error code and ignores an unknown one", async () => {
    renderAt("/error?e=unknown_client");
    expect(await screen.findByText("Unknown application.")).toBeInTheDocument();
  });

  it("does not show text taken from the URL", async () => {
    renderAt("/error?e=%3Cb%3Ehello%3C%2Fb%3E");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/hello/)).toBeNull();
  });
});

describe("apps", () => {
  it("lists the applications and the MFA link of the signed in user", async () => {
    renderAt("/apps", () => ({ json: { apps: [{ name: "Admin", url: "http://localhost:3002", icon: "http://localhost:3002/logo.svg" }, { name: "Bill", url: "http://localhost:3001" }], name: "Ann", email: "a@example.com", mfa: true } }));
    const link = await screen.findByRole("link", { name: "Admin" });
    expect(link).toHaveAttribute("href", "http://localhost:3002");
    expect(link.querySelector("img")).toHaveAttribute("src", "http://localhost:3002/logo.svg"); // the icon of the app
    expect(screen.getByRole("link", { name: "Bill" }).querySelector("img")).toBeNull(); // no icon configured
    expect(screen.getByText("Signed in as Ann")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Multi-factor authentication" })).toHaveAttribute("href", "/account/mfa?return_to=%2Fapps");
  });

  it("hides the MFA link when MFA is off and says so when no application is configured", async () => {
    renderAt("/apps", () => ({ json: { apps: [], name: "", email: "a@example.com", mfa: false } }));
    expect(await screen.findByText("No application is configured.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Multi-factor authentication" })).toBeNull();
  });

  it("applies the theme of the account", async () => {
    renderAt("/apps", () => ({ json: { apps: [], name: "Ann", email: "a@example.com", theme: "dark", mfa: false } }));
    await screen.findByText("Signed in as Ann");
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(window.localStorage.getItem("theme")).toBe("dark"); // kept for the next visit of the pages
  });

  it("goes to the login when there is no session", async () => {
    renderAt("/apps", () => fail(401, "unauthenticated"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login?return_to=%2Fapps"));
  });
});
