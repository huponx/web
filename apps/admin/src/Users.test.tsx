import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

interface Call {
  method: string;
  url: string;
  body?: string;
}

const ROLES = [
  { name: "admin", description: "Everything", permissions: ["*"] },
  { name: "support", description: "Helps users", permissions: ["identity:user:read"] },
];

function user(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "ann@example.com",
    name: "Ann",
    locale: "en",
    disabled: false,
    roles: ["support"],
    mfaEnabled: false,
    mfaEnforced: false,
    createdAt: "0",
    status: "USER_STATUS_ACTIVE",
    ...over,
  };
}

function renderApp(route: string, answer: (c: Call) => unknown, perms: string[] = ["identity:*"]) {
  const calls: Call[] = [];
  const me: Me = { sub: "root", roles: ["admin"], scopes: [], perms, amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      // read at start-up by every user, not a call the tests count
      if (u.endsWith("/api/ui-style")) return new Response(JSON.stringify({ uiStyle: "saas", uiPalettes: {} }), { status: 200 });
      const call = { method: init?.method ?? "GET", url: u.replace("https://api.example.com", ""), body: init?.body as string | undefined };
      calls.push(call);
      return new Response(JSON.stringify(answer(call)), { status: 200 });
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

describe("users list", () => {
  it("links to the add page and to the edit page, and shows the status", async () => {
    renderApp("/users", (c) =>
      c.url.startsWith("/api/users?")
        ? { users: [user(), user({ id: "u2", email: "bob@example.com", name: "", status: "USER_STATUS_PENDING", roles: [] })], nextPageToken: "" }
        : {},
    );
    expect(await screen.findByRole("link", { name: "Add user" })).toHaveAttribute("href", "/users/new");
    expect(await screen.findByRole("link", { name: "Manage ann@example.com" })).toHaveAttribute("href", "/users/u1");
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).getByText("Active")).toBeTruthy();
    expect(within(rows[2]!).getByText("Pending")).toBeTruthy();
  });
});

describe("users list statistics and dates", () => {
  it("shows the counts and the last login and date added of each user", async () => {
    renderApp("/users", (c) =>
      c.url === "/api/user-stats"
        ? { total: "5", active: "3", pending: "1", disabled: "1", mfaEnabled: "2", mfaEnforced: "1", signedIn30d: "2", neverSignedIn: "2" }
        : c.url.startsWith("/api/users?")
          ? {
              users: [
                user({ lastLoginAt: "1700000000", createdAt: "1690000000" }),
                user({ id: "u2", email: "bob@example.com", lastLoginAt: "0", createdAt: "1690000000" }),
              ],
              nextPageToken: "",
            }
          : {},
    );
    expect((await screen.findByTestId("stat-total")).textContent).toBe("5");
    expect(screen.getByTestId("stat-active").textContent).toBe("3");
    expect(screen.getByTestId("stat-pending").textContent).toBe("1");
    // one line: the rest is behind the expand icon (the cards stay in the page so they can animate, but are hidden)
    const hidden = (id: string) => screen.getByTestId(id).closest('[aria-hidden="true"]');
    expect(hidden("stat-mfaEnabled")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show all statistics" }));
    expect(screen.getByTestId("stat-mfaEnabled").textContent).toBe("2");
    expect(screen.getByTestId("stat-neverSignedIn").textContent).toBe("2");
    expect(hidden("stat-mfaEnabled")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show fewer statistics" }));
    expect(hidden("stat-mfaEnabled")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Last login" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Date added" })).toBeTruthy();
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]!).getAllByText(/2023/)).toHaveLength(2); // last login and date added
    expect(within(rows[2]!).getByText("Never")).toBeTruthy();
  });
});

describe("users list filters", () => {
  it("sends name, status and role with the search, and clears them", async () => {
    const calls = renderApp("/users", (c) => (c.url === "/api/roles" ? { roles: ROLES } : c.url.startsWith("/api/users?") ? { users: [user()], nextPageToken: "" } : {}));
    await userEvent.type(await screen.findByLabelText("Name"), "ann");
    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Pending" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "Role" }));
    await userEvent.click(await screen.findByRole("option", { name: "support" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("name=ann") && c.url.includes("status=USER_STATUS_PENDING") && c.url.includes("role=support"))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/api/users?")).at(-1)!.url).toBe("/api/users?page_size=25"));
  });
});

describe("add user page", () => {
  const answer = (c: Call): unknown => (c.url === "/api/roles" ? { roles: ROLES } : {});

  it("shows Home > Users > Add in the breadcrumb, with a link on Users", async () => {
    renderApp("/users/new", answer);
    const crumb = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Home" })).toBeTruthy();
    expect(within(crumb).getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    expect(within(crumb).getByText("Add")).toHaveAttribute("aria-current", "page");
  });

  it("has no password field and lists every role as a card with a checkbox", async () => {
    renderApp("/users/new", answer);
    expect(await screen.findByRole("checkbox", { name: "admin" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "support" })).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getByText("Everything")).toBeTruthy();
  });

  it("creates the user with the chosen roles and asks for the welcome mail", async () => {
    const calls = renderApp("/users/new", (c) => {
      if (c.url === "/api/roles") return { roles: ROLES };
      if (c.method === "POST" && c.url === "/api/users") return { user: user({ id: "new1", email: "new@example.com", status: "USER_STATUS_PENDING", roles: ["support"] }) };
      if (c.url === "/api/users/new1") return { user: user({ id: "new1", email: "new@example.com", status: "USER_STATUS_PENDING", roles: ["support"] }) };
      return {};
    });
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Email"), "new@example.com");
    await u.type(screen.getByLabelText("Name"), "New One");
    await u.click(await screen.findByRole("checkbox", { name: "support" }));
    await u.click(screen.getByRole("button", { name: "Create user" }));
    const post = await waitFor(() => {
      const p = calls.find((c) => c.method === "POST" && c.url === "/api/users");
      expect(p).toBeTruthy();
      return p!;
    });
    expect(JSON.parse(post.body!)).toEqual({ email: "new@example.com", name: "New One", locale: "en", roles: ["support"], send_welcome: true });
    expect(await screen.findByText(/User new@example.com created\./)).toBeTruthy();
    expect(screen.getByTestId("user-status")).toHaveTextContent("Pending");
  });
});

describe("edit user page", () => {
  it("shows Home > Users > Edit and checks the current roles", async () => {
    renderApp("/users/u1", (c) => (c.url === "/api/users/u1" ? { user: user() } : c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional" } : {}));
    const crumb = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Users" })).toBeTruthy();
    expect(within(crumb).getByText("Edit")).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "support" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "admin" })).not.toBeChecked();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByTestId("user-status")).toHaveTextContent("Active");
    expect(screen.queryByRole("button", { name: "Resend welcome email" })).toBeNull();
  });

  it("saves the changed roles by assigning and revoking only the difference", async () => {
    const calls = renderApp("/users/u1", (c) => (c.url === "/api/users/u1" && c.method === "GET" ? { user: user() } : c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional" } : {}));
    const u = userEvent.setup();
    await u.click(await screen.findByRole("checkbox", { name: "admin" }));
    await u.click(screen.getByRole("checkbox", { name: "support" }));
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Changes saved.")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/roles/admin/assignments")).toBeTruthy();
    expect(calls.find((c) => c.method === "DELETE" && c.url === "/api/roles/support/assignments?user_id=u1")).toBeTruthy();
    expect(calls.find((c) => c.method === "PUT" && c.url === "/api/users/u1")).toBeUndefined(); // name and language did not change
  });

  it("explains Pending and resends the welcome email", async () => {
    const calls = renderApp("/users/u1", (c) =>
      c.url === "/api/users/u1" ? { user: user({ status: "USER_STATUS_PENDING" }) } : c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional" } : {},
    );
    const u = userEvent.setup();
    expect(await screen.findByText(/has not set a password yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send password reset" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Resend welcome email" }));
    expect(await screen.findByText("Welcome email sent.")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/users/u1/welcome")).toBeTruthy();
  });

  it("deletes the account after a confirmation and goes back to the list", async () => {
    const calls = renderApp("/users/u1", (c) => {
      if (c.method === "DELETE") return {};
      if (c.url === "/api/users/u1") return { user: user() };
      if (c.url === "/api/roles") return { roles: ROLES };
      if (c.url.endsWith("/mfa")) return { mode: "optional" };
      if (c.url.startsWith("/api/users?")) return { users: [] };
      return {};
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Delete account" }));
    expect(calls.find((c) => c.method === "DELETE")).toBeUndefined(); // nothing before the confirmation
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Delete the account ann@example.com\?/)).toBeTruthy();
    await u.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.find((c) => c.method === "DELETE" && c.url === "/api/users/u1")).toBeTruthy());
    expect(await screen.findByText("The account ann@example.com was deleted.")).toBeTruthy();
  });

  it("has no way to type a password for the user", async () => {
    renderApp("/users/u1", (c) => (c.url === "/api/users/u1" ? { user: user() } : c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional" } : {}));
    await screen.findByRole("button", { name: "Send password reset" });
    expect(screen.queryByLabelText(/set a password/i)).toBeNull();
  });
});

describe("header avatar", () => {
  it("reads the own profile through /api/me, without any permission on users", async () => {
    const calls = renderApp("/", () => ({ user: user({ id: "root", name: "Root Admin", avatar: "data:image/webp;base64,AAAA" }) }));
    await screen.findByTestId("user-menu");
    await waitFor(() => expect(calls.find((c) => c.method === "GET" && c.url === "/api/me")).toBeTruthy());
    expect(calls.find((c) => c.url === "/api/users/root")).toBeUndefined();
  });
});

describe("settings profile", () => {
  it("saves the own name through PUT /api/me", async () => {
    const calls = renderApp("/settings", () => ({ user: user({ id: "root", name: "Root", email: "root@example.com" }) }));
    const name = await screen.findByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Rooty");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT" && c.url === "/api/me")).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.method === "PUT" && c.url === "/api/me")!.body!)).toEqual({ name: "Rooty" });
  });

  it("writes the language of the account when the language changes", async () => {
    const calls = renderApp("/settings", () => ({ user: user({ id: "root" }) }));
    await userEvent.click(await screen.findByRole("combobox", { name: "Language" }));
    await userEvent.click(await screen.findByRole("option", { name: "Tiếng Việt" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT" && c.url === "/api/me")).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.method === "PUT" && c.url === "/api/me")!.body!)).toEqual({ locale: "vi" });
  });
});

describe("clearable fields", () => {
  it("empties a filter field with its clear button, which shows only while it has a value", async () => {
    renderApp("/users", (c) => (c.url.startsWith("/api/users?") ? { users: [], nextPageToken: "" } : {}));
    const name = await screen.findByLabelText("Name");
    expect(screen.queryByRole("button", { name: "Clear Name" })).toBeNull();
    await userEvent.type(name, "ann");
    await userEvent.click(screen.getByRole("button", { name: "Clear Name" }));
    expect((name as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Clear Name" })).toBeNull();
  });
});

describe("clear button of every text field", () => {
  it("empties the e-mail of the add user form", async () => {
    renderApp("/users/new", (c) => (c.url === "/api/roles" ? { roles: ROLES } : {}));
    const email = await screen.findByLabelText(/e-?mail/i);
    await userEvent.type(email, "x@y.z");
    await userEvent.click(screen.getByRole("button", { name: /^Clear / }));
    expect((email as HTMLInputElement).value).toBe("");
  });
});

describe("confirmation dialog", () => {
  const edit = (c: Call): unknown =>
    c.url === "/api/users/u1" ? { user: user({ mfaEnabled: true }) } : c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional", enabled: true } : {};

  it("asks in the app, not in the browser, before resetting MFA, and does nothing on Cancel", async () => {
    const native = vi.spyOn(window, "confirm");
    const calls = renderApp("/users/u1", edit);
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/authenticator, the recovery codes and the passkeys are deleted/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.find((c) => c.url.endsWith("/mfa/reset"))).toBeUndefined();
    expect(native).not.toHaveBeenCalled();
  });

  it("shows how many passkeys the user has", async () => {
    renderApp("/users/u1", (c) => (c.url.endsWith("/mfa") ? { mode: "optional", enabled: true, recoveryCodesLeft: 4, passkeyCount: 2 } : edit(c)));
    expect((await screen.findByTestId("mfa-state")).textContent).toContain("passkeys: 2");
  });

  it("resets MFA after Confirm", async () => {
    const calls = renderApp("/users/u1", edit);
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByTestId("confirm-ok"));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/mfa/reset"))).toBeTruthy());
  });
});

describe("awaiting approval", () => {
  const waiting = (c: Call) =>
    c.url === "/api/users/u1" ? { user: user({ status: "USER_STATUS_PENDING_APPROVAL", roles: [] }) } : c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional" } : {};

  it("filters the list by the status and shows its badge", async () => {
    const calls = renderApp("/users?status=awaiting_approval", (c) =>
      c.url.startsWith("/api/users?") ? { users: [user({ status: "USER_STATUS_PENDING_APPROVAL", roles: [] })], nextPageToken: "" } : {},
    );
    expect(await screen.findByText("ann@example.com")).toBeTruthy();
    expect(screen.getAllByText("Awaiting approval").length).toBeGreaterThan(0);
    expect(calls.find((c) => c.url.startsWith("/api/users?") && c.url.includes("status=USER_STATUS_PENDING_APPROVAL"))).toBeTruthy();
  });

  it("approves: the welcome email goes out and the page reloads", async () => {
    const calls = renderApp("/users/u1", waiting);
    expect(await screen.findByText(/registered themselves and waits for an administrator/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resend welcome email" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send password reset" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText(/Approved/)).toBeTruthy();
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/users/u1/approve")).toBeTruthy();
  });

  it("rejects only after a confirmation", async () => {
    const calls = renderApp("/users/u1", waiting);
    const reject = async () => {
      await userEvent.click(await screen.findByRole("button", { name: "More decisions" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Reject" }));
    };
    await reject();
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.find((c) => c.url.endsWith("/reject"))).toBeUndefined();
    await reject();
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByTestId("confirm-ok"));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url === "/api/users/u1/reject")).toBeTruthy());
  });

  it("gives a user_approver the buttons but no editing", async () => {
    renderApp("/users/u1", waiting, ["identity:user:read", "identity:user:approve"]);
    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More decisions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disable account" })).toBeNull();
  });

  it("hides the buttons from someone without identity:user:approve", async () => {
    renderApp("/users/u1", waiting, ["identity:user:read", "identity:user:write"]);
    await screen.findByText(/registered themselves and waits/);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More decisions" })).toBeNull();
  });

  it("approves and rejects from the list row, before the Manage button", async () => {
    let waitingUsers = [user({ status: "USER_STATUS_PENDING_APPROVAL", roles: [] }), user({ id: "u2", email: "bob@example.com", status: "USER_STATUS_ACTIVE" })];
    const calls = renderApp("/users", (c) => {
      if (c.method === "POST" && c.url.endsWith("/approve")) return {};
      if (c.method === "POST" && c.url.endsWith("/reject")) {
        waitingUsers = waitingUsers.slice(1);
        return {};
      }
      return c.url.startsWith("/api/users?") ? { users: waitingUsers, nextPageToken: "" } : {};
    });
    expect(await screen.findByTestId("quick-u1")).toBeTruthy();
    expect(screen.queryByTestId("quick-u2")).toBeNull(); // only a user awaiting approval has it
    await userEvent.click(within(screen.getByTestId("quick-u1")).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url === "/api/users/u1/approve")).toBeTruthy());
    expect(await screen.findByText(/Approved/)).toBeTruthy();

    await userEvent.click(screen.getByTestId("quick-u1-menu"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reject" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByTestId("confirm-ok"));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url === "/api/users/u1/reject")).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId("quick-u1")).toBeNull());
  });
});

const SESSIONS = [
  { id: "s1", ip: "10.0.0.1", browser: "Chrome", os: "macOS", device: "desktop", amr: ["pwd"], createdAt: "1792000000", lastSeenAt: String(Math.floor(Date.now() / 1000) - 120), current: true },
  { id: "s2", ip: "10.0.0.2", browser: "Firefox", os: "Windows", device: "desktop", amr: ["pwd", "otp"], createdAt: "1792000100" },
];

describe("sessions of a user (edit user page)", () => {
  const page = (perms: string[], list = SESSIONS) =>
    renderApp(
      "/users/u1",
      (c) => {
        if (c.url === "/api/users/u1" && c.method === "GET") return { user: user() };
        if (c.url === "/api/users/u1/sessions" && c.method === "GET") return { sessions: list };
        return c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional" } : {};
      },
      perms,
    );

  it("lists the sessions of the user without a menu on the rows or an 'others' button", async () => {
    page(["identity:user:read"]);
    const section = await screen.findByTestId("user-sessions");
    const rows = await within(section).findAllByTestId("session-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText("Firefox on Windows")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("Password + Authenticator code");
    expect(within(section).queryByRole("button")).toBeNull(); // read-only: no row menu, no revoke at all without the write permission
  });

  it("signs the user out of every session after a confirmation", async () => {
    let list = SESSIONS;
    const calls = renderApp(
      "/users/u1",
      (c) => {
        if (c.url === "/api/users/u1" && c.method === "GET") return { user: user() };
        if (c.url === "/api/users/u1/sessions" && c.method === "GET") return { sessions: list };
        if (c.url === "/api/users/u1/sessions" && c.method === "DELETE") {
          list = [];
          return { revoked: 2 };
        }
        return c.url === "/api/roles" ? { roles: ROLES } : c.url.endsWith("/mfa") ? { mode: "optional" } : {};
      },
      ["identity:user:read", "identity:user:write"],
    );
    const section = await screen.findByTestId("user-sessions");
    await within(section).findAllByTestId("session-row");
    expect(within(section).queryByRole("button", { name: /Actions for/ })).toBeNull();
    await userEvent.click(within(section).getByRole("button", { name: "Sign out of all sessions" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("ann@example.com");
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/users/u1/sessions")).toBe(false);
    await userEvent.click(within(dialog).getByTestId("confirm-ok"));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/users/u1/sessions")).toBe(true));
    await waitFor(() => expect(within(section).queryAllByTestId("session-row")).toHaveLength(0));
    expect(within(section).getByText("No active sessions.")).toBeInTheDocument();
  });
});

describe("own sessions (settings)", () => {
  it("lists them with this device marked, and signs out another one", async () => {
    const calls = renderApp("/settings", (c) => (c.url === "/api/me/sessions" && c.method === "GET" ? { sessions: SESSIONS } : {}), []);
    const card = await screen.findByTestId("sessions-card");
    const rows = await within(card).findAllByTestId("session-row");
    expect(within(rows[0]!).getByText("This device")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText("This device")).toBeNull();
    await userEvent.click(within(rows[1]!).getByRole("button", { name: "Actions for Firefox on Windows" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out this session" }));
    await userEvent.click(await screen.findByTestId("confirm-ok"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", url: "/api/me/sessions/s2" })));
    expect(await screen.findByText("Session signed out.")).toBeInTheDocument();
  });

  it("signs out of all the other sessions", async () => {
    const calls = renderApp("/settings", (c) => (c.url === "/api/me/sessions" && c.method === "GET" ? { sessions: SESSIONS } : {}), []);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all other sessions" }));
    await userEvent.click(await screen.findByTestId("confirm-ok"));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/me/sessions/revoke-others" })));
  });
});
