import { AuthProvider, createClient } from "@huponx/auth-client";
import { ThemeProvider } from "@huponx/ui-kit";
import type { Me } from "@huponx/auth-client";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

interface Call {
  method: string;
  url: string;
  body?: string;
}

function renderApp(perms: string[], route = "/", answer: (c: Call) => unknown = () => ({}), profile: Partial<Me> = {}) {
  const calls: Call[] = [];
  const me: Me = { sub: "ann", roles: ["admin"], scopes: [], perms, amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z", ...profile };
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

describe("admin menu", () => {
  it("shows only the pages the user may use", async () => {
    renderApp(["identity:role:read", "identity:mfa:read"]);
    expect(await screen.findByRole("link", { name: "Roles & Permissions" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Clients" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Exchange policies" })).toBeNull();
  });

  it("refuses a page typed in the address bar without its permission", async () => {
    const calls = renderApp([], "/clients");
    expect(await screen.findByText("You are not allowed to see this page.")).toBeTruthy();
    expect(calls.filter((c) => !c.url.endsWith("/api/me"))).toHaveLength(0); // the header reads only the own profile
  });

  it("shows everything with identity:*", async () => {
    renderApp(["identity:*"]);
    for (const n of ["Users", "Roles & Permissions", "Clients", "Exchange policies"]) {
      expect(await screen.findByRole("link", { name: n })).toBeTruthy();
    }
  });
});

describe("shell", () => {
  it("pins Settings at the bottom of the menu for every user", async () => {
    renderApp([]);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Home", "Settings"]);
  });

  it("shows Home / <page> in the breadcrumb", async () => {
    renderApp(["identity:role:read"], "/roles", () => ({ roles: [] }));
    const crumb = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Home" })).toBeTruthy();
    expect(within(crumb).getByText("Roles & Permissions")).toHaveAttribute("aria-current", "page");
  });

  it("redirects /session to Settings", async () => {
    renderApp([], "/session", () => ({ sub: "ann", amr: ["pwd"], expires_at: "2030-01-01T00:00:00Z" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
  });

  it("collapses the sidebar to icons and remembers it", async () => {
    const user = userEvent.setup();
    renderApp([]);
    const sidebar = await screen.findByTestId("sidebar");
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    await user.click(screen.getByTestId("sidebar-toggle"));
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem("sidebar-collapsed")).toBe("1");
    // collapsed: icons only, the name stays as the accessible name
    expect(within(sidebar).getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  it("switches the theme and remembers it", async () => {
    const user = userEvent.setup();
    renderApp([]);
    // one icon button; each click moves on: system (default) -> light -> dark -> system
    const sw = await screen.findByTestId("theme-switch");
    expect(sw).toHaveAttribute("data-theme", "system");
    await user.click(sw);
    expect(sw).toHaveAttribute("data-theme", "light");
    await user.click(sw);
    expect(sw).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
    await user.click(sw);
    expect(sw).toHaveAttribute("data-theme", "system");
  });

  it("takes the theme of the account, and saves a change of the switch to the account", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("theme");
    const calls = renderApp([], "/", (c) => (c.method === "GET" && c.url.endsWith("/api/me") ? { user: { name: "Ann", theme: "light" } } : { user: {} }));
    const sw = await screen.findByTestId("theme-switch");
    await vi.waitFor(() => expect(sw).toHaveAttribute("data-theme", "light")); // the account says light, this browser had nothing
    expect(calls.some((c) => c.method === "PUT")).toBe(false); // applying the account is not a change to save
    await user.click(sw); // light -> dark
    await vi.waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/api/me") && c.body?.includes('"theme":"dark"'))).toBe(true));
  });

  it("shows the name of the user next to the avatar, and only the actions in the menu", async () => {
    const user = userEvent.setup();
    renderApp([]);
    const trigger = await screen.findByTestId("user-menu");
    expect(within(trigger).getByText("ann")).toBeTruthy();
    await user.click(trigger);
    expect(screen.queryByTestId("user-info")).toBeNull();
    expect(within(screen.getByRole("menu")).queryByText("admin")).toBeNull(); // no role in the menu
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("shows the name, not the id, and the first letter of it in the avatar", async () => {
    renderApp([], "/", () => ({}), { sub: "1886ffdd-0cde-494b-80af-000000000000", name: "Administrator", email: "admin@example.com" });
    const trigger = await screen.findByTestId("user-menu");
    expect(within(trigger).getByText("Administrator")).toBeTruthy();
    expect(within(trigger).getByText("A")).toBeTruthy();
    expect(within(trigger).queryByText(/1886ffdd/)).toBeNull();
  });

  it("falls back to the e-mail, then to the id, when there is no name", async () => {
    renderApp([], "/", () => ({}), { sub: "u-1", email: "admin@example.com" });
    expect(within(await screen.findByTestId("user-menu")).getByText("admin@example.com")).toBeTruthy();
  });

  it("switches the language from the avatar menu", async () => {
    const user = userEvent.setup();
    renderApp(["identity:role:read"]);
    await user.click(await screen.findByTestId("user-menu"));
    await user.click(screen.getByRole("menuitem", { name: "Language" }));
    const vi = await screen.findByRole("menuitemradio", { name: "Tiếng Việt" });
    vi.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("link", { name: "Vai trò & Quyền" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("vi");
  });
});

describe("roles page", () => {
  const catalog = {
    permissions: [
      { name: "identity:user:read", description: "Read users", roleCount: "1" },
      { name: "identity:user:write", description: "Change users", roleCount: "0" },
      { name: "identity:role:read", description: "", roleCount: "0" },
      { name: "*", description: "Everything", roleCount: "1" },
    ],
  };
  const roles = [
    { name: "admin", description: "", permissions: ["*"], assignedCount: "2" },
    { name: "support", description: "Helpdesk", permissions: ["identity:user:read"], assignedCount: "0" },
  ];
  const answer = (c: Call) => {
    if (/\/api\/permissions(\?|$)/.test(c.url) && c.method === "GET") return catalog;
    if (/\/api\/roles(\?|$)/.test(c.url) && c.method === "GET") return { roles };
    if (c.url.endsWith("/api/roles") && c.method === "POST") return { role: { name: "support" } };
    if (/\/api\/permissions\//.test(c.url) && c.method === "PUT") return { permission: { name: "identity:user:write", description: "x" } };
    return {};
  };

  it("has no Add role button without identity:role:write", async () => {
    renderApp(["identity:role:read"], "/roles", answer);
    expect(await screen.findByText("admin", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Add role/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });

  it("lists roles with how many hold them; a held role cannot be deleted", async () => {
    const calls = renderApp(["identity:role:*"], "/roles", answer);
    const user = userEvent.setup();
    expect(await screen.findByRole("link", { name: "Add role" })).toBeTruthy();
    expect((await screen.findByRole("button", { name: "Delete admin" })) as HTMLButtonElement).toHaveProperty("disabled", true);
    expect(screen.getByRole("link", { name: "Manage support" }).getAttribute("href")).toBe("/roles/support");
    await user.click(screen.getByRole("button", { name: "Delete support" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("https://api.example.com/api/roles/support");
    expect(await screen.findByText("Role support deleted.")).toBeTruthy();
  });

  it("shows a notice on the list after a role is deleted from its edit page", async () => {
    renderApp(["identity:role:*"], "/roles/support", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete role" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Role support deleted.")).toBeTruthy();
  });

  it("shows a notice after the description of a permission is edited", async () => {
    renderApp(["identity:role:*", "identity:permission:*"], "/roles", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Permissions" }));
    await user.click(await screen.findByRole("button", { name: "Edit identity:user:write" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Description"), " x");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Permission identity:user:write updated.")).toBeTruthy();
  });

  it("adds a role with the permissions typed (no catalog right)", async () => {
    const calls = renderApp(["identity:role:*"], "/roles/new", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Name"), "support");
    await user.type(screen.getByLabelText("Permissions"), "identity:user:read bill:*");
    await user.click(screen.getByRole("button", { name: "Create role" }));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("https://api.example.com/api/roles");
    expect(JSON.parse(post!.body!)).toEqual({ role: { name: "support", description: "", permissions: ["identity:user:read", "bill:*"] } });
    expect(await screen.findByText("Role support created.")).toBeTruthy(); // now on the edit page
  });

  it("shows a required field in the style of the app, not the bubble of the browser", async () => {
    const calls = renderApp(["identity:role:*"], "/roles/new", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create role" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This field is required.");
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
    await user.type(screen.getByLabelText("Name"), "a");
    expect(screen.queryByText("This field is required.")).toBeNull();
  });

  it("picks the permissions of a new role from the catalog, grouped", async () => {
    const calls = renderApp(["identity:role:*", "identity:permission:read"], "/roles/new", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Name"), "support");
    const group = await screen.findByRole("group", { name: "identity:user" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Wildcards" })).toBeTruthy();
    await user.click(within(group).getByRole("checkbox", { name: "identity:user:read" }));
    await user.click(screen.getByRole("checkbox", { name: "identity:role:read" }));
    await user.click(screen.getByRole("button", { name: "Create role" }));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post!.body!)).toEqual({ role: { name: "support", description: "", permissions: ["identity:user:read", "identity:role:read"] } });
  });

  it("groups the permissions by service: the first is open, the others collapse and expand", async () => {
    renderApp(["identity:role:*", "identity:permission:read"], "/roles/new", (c) =>
      c.url.endsWith("/api/permissions")
        ? { permissions: [...catalog.permissions, { name: "bill:invoice:read", description: "Invoices", roleCount: "0" }] }
        : answer(c),
    );
    const user = userEvent.setup();
    const bill = await screen.findByRole("button", { name: /^bill/ });
    const identity = screen.getByRole("button", { name: /^identity/ });
    expect(bill.getAttribute("aria-expanded")).toBe("true"); // first in order
    expect(identity.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("checkbox", { name: "identity:user:read" })).toBeNull();
    await user.click(identity);
    expect(screen.getByRole("checkbox", { name: "identity:user:read" })).toBeTruthy();
    await user.click(bill);
    expect(screen.queryByRole("checkbox", { name: "bill:invoice:read" })).toBeNull();
  });

  it("edits a role: the name is fixed, description and permissions are saved", async () => {
    const calls = renderApp(["identity:role:*", "identity:permission:read"], "/roles/support", answer);
    const user = userEvent.setup();
    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(name.disabled).toBe(true);
    expect(name.value).toBe("support");
    expect((await screen.findByRole("checkbox", { name: "identity:user:read" })).getAttribute("data-state")).toBe("checked");
    await user.click(screen.getByRole("checkbox", { name: "identity:user:write" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("https://api.example.com/api/roles/support");
    expect(JSON.parse(put!.body!)).toEqual({ description: "Helpdesk", permissions: ["identity:user:read", "identity:user:write"] });
  });

  it("deletes a role from its page when nobody holds it", async () => {
    const calls = renderApp(["identity:role:*"], "/roles/support", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete role" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("https://api.example.com/api/roles/support");
  });

  it("refuses to delete a role that is held", async () => {
    renderApp(["identity:role:*"], "/roles/admin", answer);
    expect(((await screen.findByRole("button", { name: "Delete role" })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Held by 2 user/)).toBeTruthy();
  });

  it("searches roles and permissions in the backend", async () => {
    const calls = renderApp(["identity:role:*", "identity:permission:read"], "/roles", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Search", { exact: true }), "help");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/roles?query=help&page_size=25"))).toBe(true));
    await user.click(screen.getByRole("tab", { name: "Permissions" }));
    await user.type(await screen.findByLabelText("Search permissions"), "user");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/permissions?query=user&page_size=25"))).toBe(true));
  });

  it("hides the Permissions tab without identity:permission:read", async () => {
    renderApp(["identity:role:*"], "/roles", answer);
    await screen.findByText("admin", { selector: "strong" });
    expect(screen.queryByRole("tab", { name: "Permissions" })).toBeNull();
  });

  it("manages the catalog: adds, and deletes only what no role holds", async () => {
    const calls = renderApp(["identity:role:read", "identity:permission:*"], "/roles", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Permissions" }));
    // the add form comes before the list
    const addForm = await screen.findByRole("button", { name: "Add permission" });
    const firstRow = (await screen.findByRole("button", { name: "Delete identity:user:read" })) as HTMLButtonElement;
    expect(addForm.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(firstRow.disabled).toBe(true);
    const del = screen.getByRole("button", { name: "Delete identity:user:write" });
    expect((del as HTMLButtonElement).disabled).toBe(false);

    await user.type(screen.getByLabelText("Permission"), "bill:invoice:read");
    await user.type(screen.getAllByLabelText("Description")[0]!, "Read invoices");
    await user.click(screen.getByRole("button", { name: "Add permission" }));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("https://api.example.com/api/permissions");
    expect(JSON.parse(post!.body!)).toEqual({ permission: { name: "bill:invoice:read", description: "Read invoices" } });

    await user.click(del);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const sent = calls.find((c) => c.method === "DELETE");
    expect(sent?.url).toBe("https://api.example.com/api/permissions/identity%3Auser%3Awrite");
  });
});

describe("clients pages", () => {
  const clients = [
    {
      clientId: "web",
      name: "Web app",
      type: "CLIENT_TYPE_PUBLIC",
      redirectUris: ["https://app/cb"],
      postLogoutRedirectUris: [],
      backchannelLogoutUri: "",
      allowedGrants: ["authorization_code"],
      allowedScopes: ["openid"],
      resource: "api",
      roles: [],
    },
    {
      clientId: "svc",
      name: "Service",
      type: "CLIENT_TYPE_CONFIDENTIAL",
      redirectUris: [],
      postLogoutRedirectUris: [],
      backchannelLogoutUri: "",
      allowedGrants: ["client_credentials"],
      allowedScopes: [],
      resource: "api",
      roles: ["support"],
      disabled: true,
    },
  ];
  const answer = (c: Call) => {
    if (/\/api\/clients(\?|$)/.test(c.url) && c.method === "GET") return { clients };
    if (c.url.endsWith("/api/clients") && c.method === "POST") return { client: { clientId: "new" }, clientSecret: "s3cret" };
    if (c.url.endsWith("/api/roles") && c.method === "GET") return { roles: [{ name: "support", description: "Helpdesk", permissions: [] }] };
    if (c.url.endsWith("/rotate-secret")) return { clientSecret: "rotated" };
    return { client: clients[0] };
  };

  it("pages the clients by token: Load more appends the next page and disappears on the last one", async () => {
    const calls = renderApp(["identity:client:read"], "/clients", (c) => {
      if (!/\/api\/clients\?/.test(c.url)) return answer(c);
      return c.url.includes("page_token=t2")
        ? { clients: [{ ...clients[0], clientId: "second", name: "Second" }] }
        : { clients: [clients[0]], nextPageToken: "t2" };
    });
    const user = userEvent.setup();
    expect(await screen.findByText("web", { selector: "strong" })).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith("/api/clients?page_size=25"))).toBe(true);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("second", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("web", { selector: "strong" })).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith("/api/clients?page_size=25&page_token=t2"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("lists clients with a Manage link and the Add button only with write", async () => {
    renderApp(["identity:client:read"], "/clients", answer);
    expect(await screen.findByText("web", { selector: "strong" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage client web" }).getAttribute("href")).toBe("/clients/web");
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add client" })).toBeNull();
  });

  it("searches the clients in the backend", async () => {
    const calls = renderApp(["identity:client:read"], "/clients", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Search", { exact: true }), "support");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/clients?query=support&page_size=25"))).toBe(true));
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "public" }));
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/clients?query=support&type=CLIENT_TYPE_PUBLIC&page_size=25"))).toBe(true));
  });

  it("adds a client and shows the secret once", async () => {
    const calls = renderApp(["identity:client:*", "identity:role:read"], "/clients/new", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Client id"), "new");
    await user.type(screen.getByLabelText(/Resource/), "api");
    await user.click(await screen.findByRole("checkbox", { name: "support" }));
    await user.click(screen.getByRole("button", { name: "Create client" }));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post!.body!)).toMatchObject({ client: { client_id: "new", type: "CLIENT_TYPE_CONFIDENTIAL", resource: "api", roles: ["support"] } });
    expect((await screen.findByTestId("client-secret")).textContent).toBe("s3cret");
  });

  it("picks grants from cards and scopes from suggestions; a public client cannot pick client_credentials", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/new", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Client id"), "new");
    await user.type(screen.getByLabelText(/Resource/), "api");
    await user.click(screen.getByRole("checkbox", { name: "client_credentials" }));
    await user.click(screen.getByRole("button", { name: "openid" }));
    await user.click(screen.getByRole("button", { name: "email" }));
    await user.click(screen.getByRole("button", { name: "Create client" }));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post!.body!).client).toMatchObject({ allowed_grants: ["authorization_code", "refresh_token", "client_credentials"], allowed_scopes: ["openid", "email"] });
  });

  it("drops the grants a public client cannot use", async () => {
    renderApp(["identity:client:*"], "/clients/new", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "client_credentials" }));
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: /public/ }));
    const cc = screen.getByRole("checkbox", { name: "client_credentials" });
    expect(cc.getAttribute("data-state")).toBe("unchecked");
    expect((cc as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a required field inline", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/new", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create client" }));
    expect((await screen.findAllByText("This field is required.")).length).toBeGreaterThan(0);
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
  });

  it("edits a client: id and type are fixed and the change is sent with PUT", async () => {
    const calls = renderApp(["identity:client:*", "identity:role:read"], "/clients/web", answer);
    const user = userEvent.setup();
    expect(((await screen.findByLabelText("Client id")) as HTMLInputElement).disabled).toBe(true);
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Renamed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("https://api.example.com/api/clients/web");
    expect(JSON.parse(put!.body!)).toMatchObject({ name: "Renamed", resource: "api", allowed_grants: ["authorization_code"] });
  });

  it("disables an enabled client; Delete stays off until then", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/web", answer);
    const user = userEvent.setup();
    expect(((await screen.findByRole("button", { name: "Delete client" })) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Disable client" }));
    const put = calls.find((c) => c.url.endsWith("/api/clients/web/disabled"));
    expect(JSON.parse(put!.body!)).toEqual({ disabled: true });
  });

  it("deletes a disabled client only after its id is typed", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/svc", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete client" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete client" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Type svc/), "svc");
    await user.click(confirm);
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("https://api.example.com/api/clients/svc");
  });

  it("rotates the secret only after a confirmation, then shows it once", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/svc", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Rotate secret" }));
    expect(calls.find((c) => c.url.endsWith("/rotate-secret"))).toBeUndefined();
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Rotate secret" }));
    expect((await screen.findByTestId("client-secret")).textContent).toBe("rotated");
  });
});

describe("exchange policies pages", () => {
  const policies = [
    { clientId: "svc", audience: "identity", maxScope: "openid", maxChainDepth: 1 },
    { clientId: "svc", audience: "https://api/x:y", maxScope: "", maxChainDepth: 2 },
  ];
  const answer = (c: Call) => {
    if (c.url.includes("/api/exchange-policies") && c.method === "GET") return { policies };
    if (c.url.endsWith("/api/clients")) return { clients: [{ clientId: "svc", name: "Service" }] };
    return {};
  };

  it("lists policies with Manage and Delete; Add and Delete only with write", async () => {
    renderApp(["identity:exchange:read"], "/exchange", answer);
    expect((await screen.findAllByText("svc", { selector: "strong" })).length).toBe(2);
    const links = screen.getAllByRole("link", { name: /^Manage the policy/ });
    expect(links[0]?.getAttribute("href")).toBe("/exchange/edit?client=svc&audience=identity");
    expect(links[1]?.getAttribute("href")).toBe("/exchange/edit?client=svc&audience=https%3A%2F%2Fapi%2Fx%3Ay");
    expect(screen.queryByRole("link", { name: "Add policy" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete the policy/ })).toBeNull();
  });

  it("searches in the backend by text and by audience", async () => {
    const calls = renderApp(["identity:exchange:*"], "/exchange", answer);
    const user = userEvent.setup();
    await screen.findAllByText("svc", { selector: "strong" });
    await user.type(screen.getByLabelText("Search", { exact: true }), "open");
    await user.type(screen.getByLabelText("Audience", { exact: true }), "ident");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/exchange-policies?query=open&audience=ident&page_size=25"))).toBe(true));
  });

  it("deletes a policy from the list after a confirmation", async () => {
    const calls = renderApp(["identity:exchange:*"], "/exchange", answer);
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: /^Delete the policy/ }))[0]!);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({ policy: { client_id: "svc", audience: "identity", max_scope: "openid", max_chain_depth: 1 }, delete: true });
  });

  it("adds a policy and lands on its edit page", async () => {
    const calls = renderApp(["identity:exchange:*", "identity:client:read"], "/exchange/new", (c) =>
      c.url.includes("/api/exchange-policies") && c.method === "GET" ? { policies: [{ clientId: "svc", audience: "bill", maxScope: "openid", maxChainDepth: 1 }] } : answer(c),
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Client id"), "svc");
    await user.type(screen.getByLabelText("Audience"), "bill");
    await user.click(screen.getByRole("button", { name: "openid" }));
    await user.click(screen.getByRole("button", { name: "Save policy" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({ policy: { client_id: "svc", audience: "bill", max_scope: "openid", max_chain_depth: 1 }, delete: false });
    expect(await screen.findByText("Policy created.")).toBeTruthy();
  });

  it("shows a required field inline", async () => {
    const calls = renderApp(["identity:exchange:*"], "/exchange/new", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Save policy" }));
    expect((await screen.findAllByText("This field is required.")).length).toBeGreaterThan(0);
    expect(calls.find((c) => c.method === "PUT")).toBeUndefined();
  });

  it("edits a policy: client and audience are fixed, the limits are saved", async () => {
    const calls = renderApp(["identity:exchange:*"], "/exchange/edit?client=svc&audience=identity", answer);
    const user = userEvent.setup();
    expect(((await screen.findByLabelText("Client id")) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Audience") as HTMLInputElement).disabled).toBe(true);
    await user.clear(screen.getByLabelText("Max chain depth"));
    await user.type(screen.getByLabelText("Max chain depth"), "3");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({ policy: { client_id: "svc", audience: "identity", max_scope: "openid", max_chain_depth: 3 }, delete: false });
  });

  it("says so when the policy does not exist", async () => {
    renderApp(["identity:exchange:*"], "/exchange/edit?client=svc&audience=nope", answer);
    expect(await screen.findByText("There is no policy of svc for nope.")).toBeTruthy();
  });
});

describe("home", () => {
  const answer = (c: Call): unknown => {
    if (c.url.endsWith("/api/user-stats")) return { total: "40", active: "30", pending: "6", disabled: "4", createdThisMonth: "5" };
    if (c.url.includes("/api/roles")) return { roles: [], total: "7" };
    if (c.url.includes("/api/permissions")) return { permissions: [], total: "25" };
    if (c.url.endsWith("/api/system/status"))
      return {
        apps: [
          { name: "identity", sync: "Synced", health: "Healthy", revision: "v2026.11.5-release-463f6d9", syncedAt: "2026-11-22T10:00:00Z" },
          { name: "gatekeeper", sync: "OutOfSync", health: "Degraded", revision: "b5a535e5a5bc9e1f2d3c4b5a69788796a5b4c3d2" },
        ],
      };
    return {};
  };

  it("greets by name and shows the numbers with their context", async () => {
    renderApp(["*"], "/", answer, { name: "Ann Admin" });
    expect(await screen.findByRole("heading", { name: "Hello, Ann Admin" })).toBeTruthy();
    expect((await screen.findByTestId("stat-users-value")).textContent).toBe("40");
    expect(screen.getByTestId("stat-users-hint").textContent).toBe("+5 this month");
    expect(screen.getByTestId("stat-active-value").textContent).toBe("30");
    expect(screen.getByTestId("stat-active-hint").textContent).toBe("75% of all users");
    expect(await screen.findByTestId("stat-roles-value")).toBeTruthy();
    expect(screen.getByTestId("stat-roles-value").textContent).toBe("7");
    expect(await within(screen.getByTestId("stat-roles")).findByText("25 permissions")).toBeTruthy();
    expect(screen.getByTestId("stat-pending-value").textContent).toBe("6");
    expect(screen.getByTestId("stat-pending").querySelector("a")?.getAttribute("href")).toBe("/users?status=pending");
    expect(screen.queryByText(/^[0-9a-f]{8}-/)).toBeNull(); // no raw user id
  });

  it("does not divide by zero without users", async () => {
    renderApp(["identity:user:read"], "/", () => ({ total: "0", active: "0", pending: "0" }));
    expect((await screen.findByTestId("stat-active-hint")).textContent).toBe("0% of all users");
  });

  it("shows a card, a quick action and the system status only to a user who may use them", async () => {
    const calls = renderApp(["identity:user:read", "identity:role:write"], "/", answer);
    expect(await screen.findByTestId("stat-users")).toBeTruthy();
    expect(screen.queryByTestId("stat-roles")).toBeNull();
    expect(screen.queryByTestId("system-status")).toBeNull();
    expect(screen.getByTestId("quick-create-role").getAttribute("href")).toBe("/roles/new");
    expect(screen.queryByTestId("quick-add-user")).toBeNull();
    expect(calls.some((c) => c.url.includes("/api/roles") || c.url.includes("/api/system/status"))).toBe(false);
  });

  it("links the quick actions to the forms", async () => {
    renderApp(["*"], "/", answer);
    expect((await screen.findByTestId("quick-add-user")).getAttribute("href")).toBe("/users/new");
    expect(screen.getByTestId("quick-add-client").getAttribute("href")).toBe("/clients/new");
    expect(screen.getByTestId("quick-add-exchange").getAttribute("href")).toBe("/exchange/new");
  });

  it("summarises the applications of the system status", async () => {
    renderApp(["system:status:read"], "/", answer);
    expect((await screen.findByTestId("system-summary")).textContent).toBe("System status of 2 applications");
    // one chip per health status that occurs (Healthy always), each with its own colour, and the out of sync count
    expect(screen.getByTestId("health-count-Healthy").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("health-count-Degraded").getAttribute("data-count")).toBe("1");
    expect(screen.queryByTestId("health-count-Unknown")).toBeNull();
    expect(screen.getByTestId("health-count-Healthy").className).toContain("emerald");
    expect(screen.getByTestId("health-count-Degraded").className).toContain("red");
    expect(screen.getByTestId("out-of-sync-count").textContent).toBe("1 out of sync");
    const rows = screen.getAllByTestId("system-app");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId("health-badge").getAttribute("data-health")).toBe("Healthy");
    expect(within(rows[1]!).getByTestId("health-badge").getAttribute("data-health")).toBe("Degraded");
    expect(within(rows[1]!).getByText("Out of sync")).toBeTruthy();
    // a chart version is shown whole, a git commit is shortened to 7 characters
    expect(within(rows[0]!).getByText("v2026.11.5-release-463f6d9")).toBeTruthy();
    expect(within(rows[1]!).getByText("b5a535e")).toBeTruthy();
  });
});

describe("dictionary settings page", () => {
  const settings = { maxSavedWords: 100, allowExportDeck: true, allowExportLink: true, englishEnabled: true, englishViEnabled: true };
  const answer = (c: Call) => (c.url.endsWith("/api/dictionary/settings") && c.method === "GET" ? { settings } : { settings });

  it("is in the menu only with dictionary:settings:read", async () => {
    renderApp(["dictionary:settings:read"], "/", answer);
    expect(await screen.findByRole("link", { name: "Dictionary" })).toBeTruthy();
  });

  it("is hidden without the permission", async () => {
    renderApp(["identity:role:read"], "/", answer);
    await screen.findByRole("link", { name: "Roles & Permissions" });
    expect(screen.queryByRole("link", { name: "Dictionary" })).toBeNull();
  });

  it("saves the changed values", async () => {
    const calls = renderApp(["dictionary:settings:*"], "/dictionary", answer);
    const user = userEvent.setup();
    const max = await screen.findByLabelText("Max saved words per user");
    await user.clear(max);
    await user.type(max, "250");
    await user.click(screen.getByRole("switch", { name: "Export as link" }));
    await user.click(screen.getByRole("switch", { name: "English-Vietnamese" }));
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({
      settings: { max_saved_words: 250, allow_export_deck: true, allow_export_link: false, english_enabled: true, english_vi_enabled: false },
    });
    expect(await screen.findByText("Dictionary settings saved.")).toBeTruthy();
  });

  it("does not let both dictionaries be turned off", async () => {
    renderApp(["dictionary:settings:*"], "/dictionary", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("switch", { name: "English" }));
    await user.click(screen.getByRole("switch", { name: "English-Vietnamese" }));
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is read only with only the read permission", async () => {
    renderApp(["dictionary:settings:read"], "/dictionary", answer);
    const sw = await screen.findByRole("switch", { name: "Export as link" });
    expect((sw as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
  });
});
