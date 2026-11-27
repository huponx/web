import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor, within } from "@testing-library/react";
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
let serverPasskeys = true;

/** Stands in for identity (see App.test.tsx), with the passkey flag of the ui-style answer. */
function renderAt(path: string, answer: (c: Call) => Answer = () => ({ json: {} })) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const c: Call = { method: init?.method ?? "GET", url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined };
      if (url === "/auth-api/csrf") return Promise.resolve(new Response(JSON.stringify({ csrf: "tok" }), { status: 200 }));
      if (url === "/auth-api/ui-style") return Promise.resolve(new Response(JSON.stringify({ uiStyle: "saas", uiPalettes: {}, registration: false, registrationApproval: false, passkeys: serverPasskeys }), { status: 200 }));
      if (url === "/auth-api/session") return Promise.resolve(new Response(JSON.stringify({ code: "unauthenticated", message: "" }), { status: 401 }));
      calls.push(c);
      const a = answer(c) ?? { json: {} };
      return Promise.resolve(new Response(JSON.stringify(a.json ?? {}), { status: a.status ?? 200 }));
    }),
  );
  render(
    <ThemeProvider>
      <StyleProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </StyleProvider>
    </ThemeProvider>,
  );
  return calls;
}

const fail = (status: number, code: string): Answer => ({ status, json: { code, message: "server text" } });
const options = { c: "cer1", options: { publicKey: { challenge: "AQID", rpId: "localhost", userVerification: "required" } } };
const creation = { c: "cer1", options: { publicKey: { challenge: "AQID", rp: { name: "Example", id: "localhost" }, user: { id: "BAUG", name: "a@example.com", displayName: "A" } } } };
const credential = { id: "cred", rawId: new ArrayBuffer(1), type: "public-key", toJSON: () => ({ id: "cred", type: "public-key", response: {} }) };

/** A browser with passkeys. `conditional`: it offers them in the autofill list. */
function browser(o: { get?: unknown; create?: unknown; conditional?: boolean } = {}) {
  const get = o.get ?? vi.fn().mockResolvedValue(credential);
  const create = o.create ?? vi.fn().mockResolvedValue(credential);
  vi.stubGlobal("PublicKeyCredential", Object.assign(function () {}, { isConditionalMediationAvailable: () => Promise.resolve(o.conditional === true) }));
  Object.defineProperty(navigator, "credentials", { value: { get, create }, configurable: true });
  return { get: get as ReturnType<typeof vi.fn>, create: create as ReturnType<typeof vi.fn> };
}

/** A pending request of the autofill list: it ends (aborted) when the page abandons it. */
function pendingUntilAborted() {
  return vi.fn((o: { signal?: AbortSignal }) => new Promise((_, reject) => o.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
}

beforeEach(() => {
  serverPasskeys = true;
  localStorage.clear();
  resetCsrf();
  assign.mockReset();
  Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "credentials");
});

describe("login with a passkey", () => {
  it("has no passkey button in a browser without passkeys", async () => {
    renderAt("/login");
    expect(await screen.findByLabelText("Password")).toBeTruthy();
    expect(screen.queryByTestId("passkey-login")).toBeNull();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("autocomplete", "username");
  });

  it("has no passkey button when the server has them off", async () => {
    browser();
    serverPasskeys = false;
    renderAt("/login");
    expect(await screen.findByLabelText("Password")).toBeTruthy();
    expect(screen.queryByTestId("passkey-login")).toBeNull();
  });

  it("signs in with the button: options, the prompt of the browser, the answer, then the redirect", async () => {
    const b = browser();
    const calls = renderAt("/login?return_to=%2Foauth2%2Fauthorize%3Fx%3D1", (c) => {
      if (c.url === "/auth-api/passkey/login/begin") return { json: options };
      if (c.url === "/auth-api/passkey/login/finish") return { json: { redirect: "/oauth2/authorize?x=1", theme: "dark", locale: "en" } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/oauth2/authorize?x=1"));

    expect(b.get).toHaveBeenCalledTimes(1);
    expect(b.get.mock.calls[0]![0].mediation).toBeUndefined(); // the modal prompt
    expect(b.get.mock.calls[0]![0].publicKey.challenge).toBeInstanceOf(ArrayBuffer);
    expect(calls.map((c) => c.url)).toEqual(["/auth-api/passkey/login/begin", "/auth-api/passkey/login/finish"]);
    expect(calls[1]!.body).toMatchObject({ c: "cer1", credential: { id: "cred" }, return_to: "/oauth2/authorize?x=1", csrf: "tok" });
    // the next visit puts the passkey first
    expect(localStorage.getItem("huponx.passkey")).toBe("1");
  });

  it("puts the button first when this browser used a passkey before", async () => {
    browser();
    localStorage.setItem("huponx.passkey", "1");
    renderAt("/login");
    const button = await screen.findByTestId("passkey-login");
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("focuses the e-mail field when there is no hint", async () => {
    browser();
    renderAt("/login");
    await screen.findByTestId("passkey-login");
    expect(screen.getByLabelText("E-mail")).toHaveFocus();
  });

  it("offers the passkeys in the autofill list of the e-mail field, and signs in with the one picked", async () => {
    const get = vi.fn().mockResolvedValue(credential);
    browser({ get, conditional: true });
    const calls = renderAt("/login?return_to=%2Fx", (c) => {
      if (c.url === "/auth-api/passkey/login/begin") return { json: options };
      if (c.url === "/auth-api/passkey/login/finish") return { json: { redirect: "/x" } };
      return undefined;
    });
    expect(await screen.findByLabelText("E-mail")).toHaveAttribute("autocomplete", "username webauthn");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/x"));
    expect(get.mock.calls[0]![0].mediation).toBe("conditional");
    expect(calls[1]!.body).toMatchObject({ return_to: "/x" });
  });

  it("a click on the button replaces the request of the autofill list", async () => {
    const pending = pendingUntilAborted();
    const b = browser({ get: pending, conditional: true });
    renderAt("/login", (c) => (c.url === "/auth-api/passkey/login/begin" ? { json: options } : undefined));
    await screen.findByTestId("passkey-login");
    await waitFor(() => expect(b.get).toHaveBeenCalledTimes(1));
    const first = b.get.mock.calls[0]![0] as { signal: AbortSignal };
    b.get.mockResolvedValueOnce(credential);
    await userEvent.setup().click(screen.getByTestId("passkey-login"));
    expect(first.signal.aborted).toBe(true);
    await waitFor(() => expect(b.get).toHaveBeenCalledTimes(2));
  });

  it("says nothing when the prompt is dismissed, and nothing is sent", async () => {
    browser({ get: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")) });
    const calls = renderAt("/login", (c) => (c.url === "/auth-api/passkey/login/begin" ? { json: options } : undefined));
    await userEvent.setup().click(await screen.findByTestId("passkey-login"));
    await waitFor(() => expect(calls.some((c) => c.url === "/auth-api/passkey/login/begin")).toBe(true));
    await waitFor(() => expect(screen.getByTestId("passkey-login")).not.toBeDisabled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(calls.some((c) => c.url === "/auth-api/passkey/login/finish")).toBe(false);
  });

  it("shows the text of a passkey the server refused", async () => {
    browser();
    renderAt("/login", (c) => {
      if (c.url === "/auth-api/passkey/login/begin") return { json: options };
      if (c.url === "/auth-api/passkey/login/finish") return fail(401, "invalid_passkey");
      return undefined;
    });
    await userEvent.setup().click(await screen.findByTestId("passkey-login"));
    expect(await screen.findByText("The passkey was not accepted. Try again or use another way to sign in.")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows a text when the browser refuses the ceremony", async () => {
    browser({ get: vi.fn().mockRejectedValue(new DOMException("bad", "SecurityError")) });
    renderAt("/login", (c) => (c.url === "/auth-api/passkey/login/begin" ? { json: options } : undefined));
    await userEvent.setup().click(await screen.findByTestId("passkey-login"));
    expect(await screen.findByText("The passkey could not be used. Try again or use your password.")).toBeTruthy();
  });

  it("keeps the password form below the button", async () => {
    browser();
    const calls = renderAt("/login?return_to=%2Fx", () => ({ json: { redirect: "/x" } }));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/x"));
    expect(calls[0]).toMatchObject({ url: "/auth-api/login" });
  });
});

describe("second factor with a passkey", () => {
  const mfaPage = (methods: unknown, extra?: (c: Call) => Answer) =>
    renderAt("/login/mfa?c=chal", (c) => {
      if (c.method === "GET" && c.url.startsWith("/auth-api/login/mfa")) return { json: methods };
      if (c.url === "/auth-api/login/mfa/passkey/begin") return { json: { options: options.options } };
      if (c.url === "/auth-api/login/mfa/passkey/finish") return { json: { redirect: "/oauth2/authorize?q=1" } };
      return extra?.(c);
    });

  it("asks a user with only a passkey for the passkey, not a code", async () => {
    const b = browser();
    const calls = mfaPage({ totp: false, passkey: true });
    await userEvent.setup().click(await screen.findByTestId("mfa-passkey"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/oauth2/authorize?q=1"));
    expect(screen.queryByLabelText(/Code from your authenticator/)).toBeNull();
    expect(b.get).toHaveBeenCalled();
    expect(calls.filter((c) => c.method === "POST").map((c) => [c.url, c.body?.c])).toEqual([
      ["/auth-api/login/mfa/passkey/begin", "chal"],
      ["/auth-api/login/mfa/passkey/finish", "chal"],
    ]);
    expect(calls.at(-1)!.body).toMatchObject({ credential: { id: "cred" } });
  });

  it("offers the passkey next to the code field for a user who has both", async () => {
    browser();
    const calls = mfaPage({ totp: true, passkey: true }, () => ({ json: { redirect: "/x" } }));
    const user = userEvent.setup();
    expect(await screen.findByTestId("mfa-passkey")).toBeTruthy();
    await user.type(screen.getByLabelText(/Code from your authenticator/), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/x"));
    expect(calls.at(-1)).toMatchObject({ url: "/auth-api/login/mfa", body: { c: "chal", code: "123456" } });
  });

  it("shows only the code field for a user without a passkey, or in a browser without passkeys", async () => {
    mfaPage({ totp: true, passkey: false });
    expect(await screen.findByLabelText(/Code from your authenticator/)).toBeTruthy();
    expect(screen.queryByTestId("mfa-passkey")).toBeNull();
  });

  it("says so when the only factor is a passkey and the browser has none", async () => {
    mfaPage({ totp: false, passkey: true });
    expect(await screen.findByText("This browser cannot create passkeys.")).toBeTruthy();
  });

  it("goes back to the sign in when the challenge is gone", async () => {
    browser();
    mfaPage({ totp: false, passkey: true }, undefined);
    const user = userEvent.setup();
    const btn = await screen.findByTestId("mfa-passkey");
    // the server forgot the challenge between the page and the click
    vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ csrf: "tok" }), { status: 200 })));
    vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ code: "challenge_expired", message: "" }), { status: 401 })));
    await user.click(btn);
    await waitFor(() => expect(screen.getByLabelText("E-mail")).toBeTruthy());
  });
});

describe("passkeys of the account", () => {
  const rows = [
    { id: "p1", name: "Laptop", createdAt: "2026-11-01T10:00:00Z", lastUsedAt: "2026-11-20T10:00:00Z", synced: true },
    { id: "p2", name: "Phone", createdAt: "2026-11-02T10:00:00Z", synced: false },
  ];
  let list = rows;
  /** The passkeys are a view of their own: the page opens it as soon as the way in is there. */
  function openPasskeys() {
    void screen.findByTestId("to-passkeys").then((link) => userEvent.click(link));
  }
  const page = (extra?: (c: Call) => Answer) => {
    const calls = renderAt("/account/mfa", (c) => {
      if (c.url === "/auth-api/account/mfa") return { json: { enabled: true, forced: true, codesLeft: 3 } };
      if (c.url === "/auth-api/account/passkeys" && c.method === "GET") return { json: { passkeys: list, max: 20 } };
      if (c.url === "/auth-api/account/passkeys/begin") return { json: creation };
      return extra?.(c);
    });
    openPasskeys();
    return calls;
  };
  beforeEach(() => {
    list = rows;
  });

  it("lists them with what each is", async () => {
    browser();
    page();
    const items = await screen.findAllByTestId("passkey-row");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Laptop")).toBeTruthy();
    expect(within(items[0]!).getByText(/Synced/)).toBeTruthy();
    expect(within(items[1]!).getByText(/This device only/)).toBeTruthy();
    expect(within(items[1]!).getByText(/Never used/)).toBeTruthy();
  });

  it("is not shown when the server has passkeys off", async () => {
    browser();
    renderAt("/account/mfa", (c) => {
      if (c.url === "/auth-api/account/mfa") return { json: { enabled: true, forced: true, codesLeft: 3 } };
      if (c.url === "/auth-api/account/passkeys") return fail(404, "not_found");
      return undefined;
    });
    openPasskeys();
    expect(await screen.findByTestId("mfa-back")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("passkeys")).toBeNull());
  });

  /** Opens the menu of the row and picks an item. */
  async function pick(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, item: string) {
    await user.click(within(row).getByRole("button", { name: /^Actions for / }));
    await user.click(await screen.findByRole("menuitem", { name: item }));
    return within(await screen.findByRole("dialog"));
  }

  it("has no rename and delete buttons in the rows, only a menu", async () => {
    browser();
    page();
    const [first] = await screen.findAllByTestId("passkey-row");
    expect(within(first!).queryByRole("button", { name: "Rename" })).toBeNull();
    expect(within(first!).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(first!).getByRole("button", { name: "Actions for Laptop" })).toBeInTheDocument();
  });

  it("adds a passkey: a dialog names it, the password comes only after Continue, then the browser creates it", async () => {
    const b = browser();
    const calls = page((c) => {
      if (c.url === "/auth-api/account/passkeys/finish") {
        list = [...rows, { id: "p3", name: "Work key", createdAt: "2026-11-27T10:00:00Z", synced: false }];
        return { json: list[2] };
      }
      return undefined;
    });
    const user = userEvent.setup();
    await screen.findAllByTestId("passkey-row");
    expect(screen.queryByLabelText("Your current password")).toBeNull();
    await user.click(within(screen.getByTestId("passkeys")).getByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.queryByLabelText("Your current password")).toBeNull();
    await user.type(dialog.getByLabelText("Name of the passkey"), "Work key");
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    expect(calls.some((c) => c.url === "/auth-api/account/passkeys/begin")).toBe(false);
    await user.type(dialog.getByLabelText("Your current password"), "pw");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    expect(await screen.findByText("Passkey added.")).toBeTruthy();
    expect(b.create).toHaveBeenCalledTimes(1);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts[0]).toMatchObject({ url: "/auth-api/account/passkeys/begin", body: { password: "pw", csrf: "tok" } });
    expect(posts[1]).toMatchObject({ url: "/auth-api/account/passkeys/finish", body: { c: "cer1", name: "Work key", credential: { id: "cred" } } });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findAllByTestId("passkey-row")).toHaveLength(3);
    expect(localStorage.getItem("huponx.passkey")).toBe("1");
  });

  it("shows the error of a wrong password in the dialog and does not call the browser", async () => {
    const b = browser();
    renderAt("/account/mfa", (c) => {
      if (c.url === "/auth-api/account/mfa") return { json: { enabled: true, forced: true, codesLeft: 3 } };
      if (c.url === "/auth-api/account/passkeys" && c.method === "GET") return { json: { passkeys: [], max: 20 } };
      if (c.url === "/auth-api/account/passkeys/begin") return fail(401, "invalid_password");
      return undefined;
    });
    openPasskeys();
    const user = userEvent.setup();
    expect(await screen.findByText("You have no passkeys yet.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Your current password"), "bad");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    expect(await dialog.findByText("Wrong password.")).toBeTruthy();
    expect(b.create).not.toHaveBeenCalled();
  });

  it("renames a passkey in a dialog", async () => {
    browser();
    const calls = page((c) => (c.method === "PATCH" ? { json: {} } : undefined));
    const user = userEvent.setup();
    const [first] = await screen.findAllByTestId("passkey-row");
    const dialog = await pick(user, first!, "Rename");
    const field = dialog.getByLabelText("Name of the passkey");
    expect(field).toHaveValue("Laptop");
    await user.clear(field);
    await user.type(field, "Old laptop");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/auth-api/account/passkeys/p1", body: { name: "Old laptop", csrf: "tok" } });
  });

  it("deletes a passkey: the dialog confirms first, the password is asked only after that", async () => {
    browser();
    const calls = page((c) => (c.method === "DELETE" ? { json: {} } : undefined));
    const user = userEvent.setup();
    const [first] = await screen.findAllByTestId("passkey-row");
    const dialog = await pick(user, first!, "Delete");
    expect(dialog.getByText("Delete “Laptop”? You will no longer be able to sign in with it.")).toBeTruthy();
    expect(dialog.queryByLabelText("Your current password")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(dialog.getByText("Enter your password to delete “Laptop”.")).toBeTruthy();
    await user.type(dialog.getByLabelText("Your current password"), "pw");
    list = [rows[1]!];
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Passkey removed.")).toBeTruthy();
    expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ url: "/auth-api/account/passkeys/p1", body: { password: "pw", csrf: "tok" } });
    expect(await screen.findAllByTestId("passkey-row")).toHaveLength(1);
  });

  it("cancelling the dialog or the prompt of the browser adds nothing", async () => {
    browser({ create: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")) });
    const calls = page();
    const user = userEvent.setup();
    await screen.findAllByTestId("passkey-row");
    await user.click(within(screen.getByTestId("passkeys")).getByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Your current password"), "pw");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/auth-api/account/passkeys/begin")).toBe(true));
    await waitFor(() => expect(dialog.getByRole("button", { name: "Create passkey" })).not.toBeDisabled());
    expect(calls.some((c) => c.url === "/auth-api/account/passkeys/finish")).toBe(false);
    expect(screen.queryByText("Passkey added.")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers no way to the passkeys in a browser that cannot make one", async () => {
    renderAt("/account/mfa", (c) => (c.url === "/auth-api/account/mfa" ? { json: { enabled: true, forced: true, codesLeft: 3 } } : undefined));
    expect(await screen.findByTestId("mfa-back")).toBeTruthy();
    expect(screen.queryByTestId("to-passkeys")).toBeNull();
  });
});

describe("the authenticator and the passkeys are two views of the page", () => {
  const enrollment = { json: { enabled: false, qr: "data:image/png;base64,AAAA", secret: "S" } };
  const server = (c: Call): Answer => {
    if (c.url === "/auth-api/account/mfa") return enrollment;
    if (c.url === "/auth-api/account/passkeys") return { json: { passkeys: [], max: 20 } };
    return undefined;
  };

  it("under Next, the enrollment offers a passkey instead; the two are never on the page together", async () => {
    browser();
    renderAt("/account/mfa", server);
    const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.queryByTestId("passkeys")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Set up a passkey instead" }));
    // the passkey view: no QR code, no Next
    expect(await screen.findByTestId("passkeys")).toBeTruthy();
    expect(screen.queryByAltText("QR code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Use an authenticator app instead" }));
    expect(screen.getByAltText("QR code")).toBeTruthy();
    expect(screen.queryByTestId("passkeys")).toBeNull();
  });

  it("offers no switch in a browser without passkeys, or when the server has them off", async () => {
    renderAt("/account/mfa", server);
    expect(await screen.findByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up a passkey instead" })).toBeNull();
  });

  it("a user who must enroll goes on to where they were heading once the first passkey is added", async () => {
    browser();
    const calls = renderAt("/account/mfa?return_to=%2Foauth2%2Fauthorize%3Fq%3D1", (c) => {
      if (c.url === "/auth-api/account/mfa") return { json: { enabled: false, forced: true, qr: "data:image/png;base64,AAAA", secret: "S" } };
      if (c.url === "/auth-api/account/passkeys" && c.method === "GET") return { json: { passkeys: [], max: 20 } };
      if (c.url === "/auth-api/account/passkeys/begin") return { json: creation };
      if (c.url === "/auth-api/account/passkeys/finish") return { json: { id: "p1", name: "k", createdAt: "2026-11-27T10:00:00Z", synced: false, redirect: "/oauth2/authorize?q=1" } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up a passkey instead" }));
    await user.click(await screen.findByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Your current password"), "pw");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/oauth2/authorize?q=1"));
    expect(calls.find((c) => c.url === "/auth-api/account/passkeys/finish")?.body).toMatchObject({ return_to: "/oauth2/authorize?q=1" });
  });

  it("a user who only manages passkeys stays on the page after adding one", async () => {
    browser();
    renderAt("/account/mfa?return_to=%2Foauth2%2Fauthorize%3Fq%3D1", (c) => {
      if (c.url === "/auth-api/account/mfa") return { json: { enabled: true, codesLeft: 8, forced: false } };
      if (c.url === "/auth-api/account/passkeys" && c.method === "GET") return { json: { passkeys: [], max: 20 } };
      if (c.url === "/auth-api/account/passkeys/begin") return { json: creation };
      if (c.url === "/auth-api/account/passkeys/finish") return { json: { id: "p1", name: "k", createdAt: "2026-11-27T10:00:00Z", synced: false, redirect: "/oauth2/authorize?q=1" } };
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Manage passkeys" }));
    await user.click(await screen.findByRole("button", { name: "Add a passkey" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(dialog.getByLabelText("Your current password"), "pw");
    await user.click(dialog.getByRole("button", { name: "Create passkey" }));
    expect(await screen.findByText("Passkey added.")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("the switch is not on the verification step", async () => {
    browser();
    renderAt("/account/mfa", server);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Next" }));
    expect(screen.queryByRole("button", { name: "Set up a passkey instead" })).toBeNull();
  });

  it("with MFA on, the passkeys are behind Manage passkeys", async () => {
    browser();
    renderAt("/account/mfa", (c) => (c.url === "/auth-api/account/mfa" ? { json: { enabled: true, codesLeft: 8, forced: false } } : server(c)));
    const user = userEvent.setup();
    expect(await screen.findByTestId("mfa-row")).toBeTruthy();
    expect(screen.queryByTestId("passkeys")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage passkeys" }));
    expect(await screen.findByTestId("passkeys")).toBeTruthy();
    expect(screen.queryByTestId("mfa-row")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back to multi-factor authentication" }));
    expect(await screen.findByTestId("mfa-row")).toBeTruthy();
  });
});
