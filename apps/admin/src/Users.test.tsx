import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { ThemeProvider } from "@huponx/ui-kit";
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

function renderApp(route: string, answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  const me: Me = { sub: "root", roles: ["admin"], scopes: [], perms: ["identity:*"], amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      const call = { method: init?.method ?? "GET", url: u.replace("https://api.example.com", ""), body: init?.body as string | undefined };
      calls.push(call);
      return new Response(JSON.stringify(answer(call)), { status: 200 });
    },
    navigate: () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  render(
    <ThemeProvider>
      <AuthProvider client={client}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
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
    // one line: the rest is behind the expand icon
    expect(screen.queryByTestId("stat-mfaEnabled")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show all statistics" }));
    expect(screen.getByTestId("stat-mfaEnabled").textContent).toBe("2");
    expect(screen.getByTestId("stat-neverSignedIn").textContent).toBe("2");
    await userEvent.click(screen.getByRole("button", { name: "Show fewer statistics" }));
    expect(screen.queryByTestId("stat-mfaEnabled")).toBeNull();
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
    expect(within(dialog).getByText(/authenticator and the recovery codes are deleted/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.find((c) => c.url.endsWith("/mfa/reset"))).toBeUndefined();
    expect(native).not.toHaveBeenCalled();
  });

  it("resets MFA after Confirm", async () => {
    const calls = renderApp("/users/u1", edit);
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByTestId("confirm-ok"));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/mfa/reset"))).toBeTruthy());
  });
});
