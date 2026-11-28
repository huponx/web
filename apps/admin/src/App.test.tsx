import { AuthProvider, createClient } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import type { Me } from "@huponx/auth-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { allowedOf } from "./test-rules";

interface Call {
  method: string;
  url: string;
  body?: string;
}

/** The registry the service answers by default: one group with the two dictionaries. */
const EN_GROUPS = [
  {
    id: "en",
    dictionaries: [
      { id: "english", group: "en", source: "en", target: "en", enabled: true },
      {
        id: "english-vietnamese",
        group: "en",
        source: "en",
        target: "vi",
        enabled: true,
      },
    ],
  },
];

function renderApp(
  perms: string[],
  route = "/",
  answer: (c: Call) => unknown = () => ({}),
  profile: Partial<Me> = {},
  groups: unknown[] = EN_GROUPS,
) {
  const calls: Call[] = [];
  const me: Me = {
    sub: "ann",
    roles: ["admin"],
    scopes: [],
    perms,
    allowed: allowedOf(perms),
    amr: [],
    csrf_token: "c",
    expires_at: "2030-01-01T00:00:00Z",
    ...profile,
  };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/me"))
        return new Response(JSON.stringify(me), { status: 200 });
      // the system style is read at start-up by every user; it is not a call the tests count
      if (u.endsWith("/api/ui-style") && (init?.method ?? "GET") === "GET")
        return new Response(
          JSON.stringify({
            uiStyle: "saas",
            uiPalettes: { saas: "aurora", glass: "ocean", mono: "aurora" },
          }),
          { status: 200 },
        );
      // the registry of the dictionaries is read by the dictionary page; it is not a call the tests count
      if (u.endsWith("/api/dictionary/dictionaries"))
        return new Response(JSON.stringify({ groups }), { status: 200 });
      const call = {
        method: init?.method ?? "GET",
        url: u,
        body: init?.body as string | undefined,
      };
      calls.push(call);
      return new Response(JSON.stringify(answer(call)), { status: 200 });
    },
    navigate: () => undefined,
    storage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
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

describe("user menu", () => {
  afterEach(() => {
    delete window.__env__;
  });

  it("links back to the portal when PORTAL_URL is configured", async () => {
    window.__env__ = {
      API_BASE: "https://api.example.com",
      PORTAL_URL: "https://example.com",
    };
    renderApp([]);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "User menu" }));
    expect(
      await screen.findByRole("menuitem", { name: "Back to the portal" }),
    ).toHaveAttribute("href", "https://example.com/");
  });

  it("has no such item without PORTAL_URL", async () => {
    renderApp([]);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "User menu" }));
    await screen.findByRole("menuitem", { name: "Sign out" });
    expect(
      screen.queryByRole("menuitem", { name: "Back to the portal" }),
    ).toBeNull();
  });
});

describe("admin menu", () => {
  it("shows only the pages the user may use", async () => {
    renderApp(["identity:role:read", "identity:mfa:read"]);
    expect(
      await screen.findByRole("link", { name: "Roles & Permissions" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Clients" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Exchange policies" }),
    ).toBeNull();
  });

  it("refuses a page typed in the address bar without its permission", async () => {
    const calls = renderApp([], "/clients");
    expect(
      await screen.findByText("You are not allowed to see this page."),
    ).toBeTruthy();
    expect(calls.filter((c) => !c.url.endsWith("/api/me"))).toHaveLength(0); // the header reads only the own profile
  });

  it("shows everything with identity:*", async () => {
    renderApp(["identity:*"]);
    for (const n of [
      "Users",
      "Roles & Permissions",
      "Clients",
      "Exchange policies",
    ]) {
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
    expect(within(crumb).getByText("Roles & Permissions")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("redirects /session to Settings", async () => {
    renderApp([], "/session", () => ({
      sub: "ann",
      amr: ["pwd"],
      expires_at: "2030-01-01T00:00:00Z",
    }));
    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeTruthy();
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
    expect(
      within(sidebar).getByRole("link", { name: "Settings" }),
    ).toBeTruthy();
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
    const calls = renderApp([], "/", (c) =>
      c.method === "GET" && c.url.endsWith("/api/me")
        ? { user: { name: "Ann", theme: "light" } }
        : { user: {} },
    );
    const sw = await screen.findByTestId("theme-switch");
    await vi.waitFor(() => expect(sw).toHaveAttribute("data-theme", "light")); // the account says light, this browser had nothing
    expect(calls.some((c) => c.method === "PUT")).toBe(false); // applying the account is not a change to save
    await user.click(sw); // light -> dark
    await vi.waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === "PUT" &&
            c.url.endsWith("/api/me") &&
            c.body?.includes('"theme":"dark"'),
        ),
      ).toBe(true),
    );
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
    renderApp([], "/", () => ({}), {
      sub: "1886ffdd-0cde-494b-80af-000000000000",
      name: "Administrator",
      email: "admin@example.com",
    });
    const trigger = await screen.findByTestId("user-menu");
    expect(within(trigger).getByText("Administrator")).toBeTruthy();
    expect(within(trigger).getByText("A")).toBeTruthy();
    expect(within(trigger).queryByText(/1886ffdd/)).toBeNull();
  });

  it("falls back to the e-mail, then to the id, when there is no name", async () => {
    renderApp([], "/", () => ({}), { sub: "u-1", email: "admin@example.com" });
    expect(
      within(await screen.findByTestId("user-menu")).getByText(
        "admin@example.com",
      ),
    ).toBeTruthy();
  });

  it("switches the language from the avatar menu", async () => {
    const user = userEvent.setup();
    renderApp(["identity:role:read"]);
    await user.click(await screen.findByTestId("user-menu"));
    await user.click(screen.getByRole("menuitem", { name: "Language" }));
    const vi = await screen.findByRole("menuitemradio", { name: "Tiếng Việt" });
    vi.focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("link", { name: "Vai trò & Quyền" }),
    ).toBeTruthy();
    expect(document.documentElement.lang).toBe("vi");
  });
});

describe("roles page", () => {
  const catalog = {
    permissions: [
      { name: "identity:user:read", description: "Read users", roleCount: "1" },
      {
        name: "identity:user:write",
        description: "Change users",
        roleCount: "0",
      },
      { name: "identity:role:read", description: "", roleCount: "0" },
      { name: "*", description: "Everything", roleCount: "1" },
    ],
  };
  const roles = [
    { name: "admin", description: "", permissions: ["*"], assignedCount: "2" },
    {
      name: "support",
      description: "Helpdesk",
      permissions: ["identity:user:read"],
      assignedCount: "0",
    },
  ];
  const answer = (c: Call) => {
    if (/\/api\/permissions(\?|$)/.test(c.url) && c.method === "GET")
      return catalog;
    if (/\/api\/roles(\?|$)/.test(c.url) && c.method === "GET")
      return { roles };
    if (c.url.endsWith("/api/roles") && c.method === "POST")
      return { role: { name: "support" } };
    if (/\/api\/permissions\//.test(c.url) && c.method === "PUT")
      return { permission: { name: "identity:user:write", description: "x" } };
    return {};
  };

  it("has no Add role button without identity:role:write", async () => {
    renderApp(["identity:role:read"], "/roles", answer);
    expect(
      await screen.findByText("admin", { selector: "strong" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Add role/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });

  it("lists roles with how many hold them; a held role cannot be deleted", async () => {
    const calls = renderApp(["identity:role:*"], "/roles", answer);
    const user = userEvent.setup();
    expect(await screen.findByRole("link", { name: "Add role" })).toBeTruthy();
    expect(
      (await screen.findByRole("button", {
        name: "Delete admin",
      })) as HTMLButtonElement,
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("link", { name: "Manage support" }).getAttribute("href"),
    ).toBe("/roles/support");
    await user.click(screen.getByRole("button", { name: "Delete support" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe(
      "https://api.example.com/api/roles/support",
    );
    expect(await screen.findByText("Role support deleted.")).toBeTruthy();
  });

  it("shows a notice on the list after a role is deleted from its edit page", async () => {
    renderApp(["identity:role:*"], "/roles/support", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete role" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    expect(await screen.findByText("Role support deleted.")).toBeTruthy();
  });

  it("adds a role with the permissions typed (no catalog right)", async () => {
    const calls = renderApp(["identity:role:*"], "/roles/new", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Name"), "support");
    await user.type(
      screen.getByLabelText("Permissions"),
      "identity:user:read bill:*",
    );
    await user.click(screen.getByRole("button", { name: "Create role" }));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("https://api.example.com/api/roles");
    expect(JSON.parse(post!.body!)).toEqual({
      role: {
        name: "support",
        description: "",
        permissions: ["identity:user:read", "bill:*"],
      },
    });
    expect(await screen.findByText("Role support created.")).toBeTruthy(); // now on the edit page
  });

  it("shows a required field in the style of the app, not the bubble of the browser", async () => {
    const calls = renderApp(["identity:role:*"], "/roles/new", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Create role" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This field is required.",
    );
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
    await user.type(screen.getByLabelText("Name"), "a");
    expect(screen.queryByText("This field is required.")).toBeNull();
  });

  it("picks the permissions of a new role from the catalog, grouped", async () => {
    const calls = renderApp(
      ["identity:role:*", "identity:permission:read"],
      "/roles/new",
      answer,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Name"), "support");
    const group = await screen.findByRole("group", { name: "identity:user" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Wildcards" })).toBeTruthy();
    await user.click(
      within(group).getByRole("checkbox", { name: "identity:user:read" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "identity:role:read" }),
    );
    await user.click(screen.getByRole("button", { name: "Create role" }));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post!.body!)).toEqual({
      role: {
        name: "support",
        description: "",
        permissions: ["identity:user:read", "identity:role:read"],
      },
    });
  });

  it("groups the permissions by service: the first is open, the others collapse and expand", async () => {
    renderApp(
      ["identity:role:*", "identity:permission:read"],
      "/roles/new",
      (c) =>
        c.url.endsWith("/api/permissions")
          ? {
              permissions: [
                ...catalog.permissions,
                {
                  name: "bill:invoice:read",
                  description: "Invoices",
                  roleCount: "0",
                },
              ],
            }
          : answer(c),
    );
    const user = userEvent.setup();
    const bill = await screen.findByRole("button", { name: /^bill/ });
    const identity = screen.getByRole("button", { name: /^identity/ });
    expect(bill.getAttribute("aria-expanded")).toBe("true"); // first in order
    expect(identity.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("checkbox", { name: "identity:user:read" }),
    ).toBeNull();
    await user.click(identity);
    expect(
      screen.getByRole("checkbox", { name: "identity:user:read" }),
    ).toBeTruthy();
    await user.click(bill);
    expect(
      screen.queryByRole("checkbox", { name: "bill:invoice:read" }),
    ).toBeNull();
  });

  it("edits a role: the name is fixed, description and permissions are saved", async () => {
    const calls = renderApp(
      ["identity:role:*", "identity:permission:read"],
      "/roles/support",
      answer,
    );
    const user = userEvent.setup();
    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(name.disabled).toBe(true);
    expect(name.value).toBe("support");
    expect(
      (
        await screen.findByRole("checkbox", { name: "identity:user:read" })
      ).getAttribute("data-state"),
    ).toBe("checked");
    await user.click(
      screen.getByRole("checkbox", { name: "identity:user:write" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("https://api.example.com/api/roles/support");
    expect(JSON.parse(put!.body!)).toEqual({
      description: "Helpdesk",
      permissions: ["identity:user:read", "identity:user:write"],
    });
  });

  it("deletes a role from its page when nobody holds it", async () => {
    const calls = renderApp(["identity:role:*"], "/roles/support", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete role" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe(
      "https://api.example.com/api/roles/support",
    );
  });

  it("refuses to delete a role that is held", async () => {
    renderApp(["identity:role:*"], "/roles/admin", answer);
    expect(
      (
        (await screen.findByRole("button", {
          name: "Delete role",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/Held by 2 user/)).toBeTruthy();
  });

  it("searches roles and permissions in the backend", async () => {
    const calls = renderApp(
      ["identity:role:*", "identity:permission:read"],
      "/roles",
      answer,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Search", { exact: true }),
      "help",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() =>
      expect(
        calls.some((c) => c.url.endsWith("/api/roles?query=help&page_size=25")),
      ).toBe(true),
    );
    await user.click(screen.getByRole("tab", { name: "Permissions" }));
    await user.type(await screen.findByLabelText("Search permissions"), "user");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() =>
      expect(
        calls.some((c) =>
          c.url.endsWith("/api/permissions?query=user&page_size=25"),
        ),
      ).toBe(true),
    );
  });

  it("hides the Permissions tab without identity:permission:read", async () => {
    renderApp(["identity:role:*"], "/roles", answer);
    await screen.findByText("admin", { selector: "strong" });
    expect(screen.queryByRole("tab", { name: "Permissions" })).toBeNull();
  });

  it("shows the catalog read only, with the service, the wildcards and the retired ones", async () => {
    const calls = renderApp(
      ["identity:role:read", "identity:permission:read"],
      "/roles",
      (c) =>
        /\/api\/permissions(\?|$)/.test(c.url) && c.method === "GET"
          ? {
              permissions: [
                {
                  name: "*",
                  description: "Everything",
                  roleCount: "1",
                  wildcard: true,
                },
                {
                  name: "identity:user:read",
                  description: "Read users",
                  roleCount: "1",
                  service: "identity",
                },
                {
                  name: "identity:user:purge",
                  description: "Purge",
                  roleCount: "1",
                  service: "identity",
                  retired: true,
                },
              ],
            }
          : answer(c),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Permissions" }));
    expect(await screen.findByText("identity:user:read")).toBeTruthy();
    expect(screen.getByText("wildcard")).toBeTruthy();
    expect(screen.getByText("retired")).toBeTruthy();
    // nothing to add, edit or delete: the services declare the permissions
    expect(
      screen.queryByRole("button", { name: /add permission/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^(edit|delete) /i }),
    ).toBeNull();
    expect(calls.some((c) => c.method !== "GET")).toBe(false);
  });

  it("offers no retired permission in the role editor and shows the retired grants of the role so they can be removed", async () => {
    const calls = renderApp(
      ["identity:role:*", "identity:permission:read"],
      "/roles/support",
      (c) => {
        if (/\/api\/permissions(\?|$)/.test(c.url) && c.method === "GET")
          return {
            permissions: [
              {
                name: "identity:user:read",
                description: "Read users",
                service: "identity",
              },
              {
                name: "identity:user:write",
                description: "Change users",
                service: "identity",
              },
              {
                name: "identity:user:purge",
                description: "Purge",
                service: "identity",
                retired: true,
              },
            ],
          };
        if (/\/api\/roles(\?|$)/.test(c.url) && c.method === "GET")
          return {
            roles: [
              {
                name: "support",
                description: "Helpdesk",
                permissions: ["identity:user:purge", "identity:user:read"],
                retiredPermissions: ["identity:user:purge"],
                assignedCount: "0",
              },
            ],
          };
        return {};
      },
    );
    const user = userEvent.setup();
    const retired = await screen.findByRole("checkbox", {
      name: /identity:user:purge/,
    });
    expect(retired.getAttribute("data-state")).toBe("checked");
    expect(
      screen.getByRole("checkbox", { name: "identity:user:write" }),
    ).toBeTruthy();
    // the retired permission appears once, in its own group
    expect(
      screen.getAllByRole("checkbox", { name: /identity:user:purge/ }),
    ).toHaveLength(1);
    await user.click(retired);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({
      description: "Helpdesk",
      permissions: ["identity:user:read"],
    });
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
    if (/\/api\/clients(\?|$)/.test(c.url) && c.method === "GET")
      return { clients };
    if (c.url.endsWith("/api/clients") && c.method === "POST")
      return { client: { clientId: "new" }, clientSecret: "s3cret" };
    if (c.url.endsWith("/api/roles") && c.method === "GET")
      return {
        roles: [{ name: "support", description: "Helpdesk", permissions: [] }],
      };
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
    expect(calls.some((c) => c.url.endsWith("/api/clients?page_size=25"))).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(
      await screen.findByText("second", { selector: "strong" }),
    ).toBeTruthy();
    expect(screen.getByText("web", { selector: "strong" })).toBeTruthy();
    expect(
      calls.some((c) =>
        c.url.endsWith("/api/clients?page_size=25&page_token=t2"),
      ),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("lists clients with a Manage link and the Add button only with write", async () => {
    renderApp(["identity:client:read"], "/clients", answer);
    expect(await screen.findByText("web", { selector: "strong" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Manage client web" })
        .getAttribute("href"),
    ).toBe("/clients/web");
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add client" })).toBeNull();
  });

  it("searches the clients in the backend", async () => {
    const calls = renderApp(["identity:client:read"], "/clients", answer);
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Search", { exact: true }),
      "support",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() =>
      expect(
        calls.some((c) =>
          c.url.endsWith("/api/clients?query=support&page_size=25"),
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "public" }));
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() =>
      expect(
        calls.some((c) =>
          c.url.endsWith(
            "/api/clients?query=support&type=CLIENT_TYPE_PUBLIC&page_size=25",
          ),
        ),
      ).toBe(true),
    );
  });

  it("adds a client and shows the secret once", async () => {
    const calls = renderApp(
      ["identity:client:*", "identity:role:read"],
      "/clients/new",
      answer,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Client id"), "new");
    await user.type(screen.getByLabelText(/Resource/), "api");
    await user.click(await screen.findByRole("checkbox", { name: "support" }));
    await user.click(screen.getByRole("button", { name: "Create client" }));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post!.body!)).toMatchObject({
      client: {
        client_id: "new",
        type: "CLIENT_TYPE_CONFIDENTIAL",
        resource: "api",
        roles: ["support"],
      },
    });
    expect((await screen.findByTestId("client-secret")).textContent).toBe(
      "s3cret",
    );
  });

  it("picks grants from cards and scopes from suggestions; a public client cannot pick client_credentials", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/new", answer);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Client id"), "new");
    await user.type(screen.getByLabelText(/Resource/), "api");
    await user.click(
      screen.getByRole("checkbox", { name: "client_credentials" }),
    );
    await user.click(screen.getByRole("button", { name: "openid" }));
    await user.click(screen.getByRole("button", { name: "email" }));
    await user.click(screen.getByRole("button", { name: "Create client" }));
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post!.body!).client).toMatchObject({
      allowed_grants: [
        "authorization_code",
        "refresh_token",
        "client_credentials",
      ],
      allowed_scopes: ["openid", "email"],
    });
  });

  it("drops the grants a public client cannot use", async () => {
    renderApp(["identity:client:*"], "/clients/new", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: "client_credentials" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: /public/ }));
    const cc = screen.getByRole("checkbox", { name: "client_credentials" });
    expect(cc.getAttribute("data-state")).toBe("unchecked");
    expect((cc as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a required field inline", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/new", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Create client" }),
    );
    expect(
      (await screen.findAllByText("This field is required.")).length,
    ).toBeGreaterThan(0);
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
  });

  it("edits a client: id and type are fixed and the change is sent with PUT", async () => {
    const calls = renderApp(
      ["identity:client:*", "identity:role:read"],
      "/clients/web",
      answer,
    );
    const user = userEvent.setup();
    expect(
      ((await screen.findByLabelText("Client id")) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Renamed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("https://api.example.com/api/clients/web");
    expect(JSON.parse(put!.body!)).toMatchObject({
      name: "Renamed",
      resource: "api",
      allowed_grants: ["authorization_code"],
    });
  });

  it("disables an enabled client; Delete stays off until then", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/web", answer);
    const user = userEvent.setup();
    expect(
      (
        (await screen.findByRole("button", {
          name: "Delete client",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Disable client" }));
    const put = calls.find((c) => c.url.endsWith("/api/clients/web/disabled"));
    expect(JSON.parse(put!.body!)).toEqual({ disabled: true });
  });

  it("deletes a disabled client only after its id is typed", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/svc", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete client" }),
    );
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Delete client",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Type svc/), "svc");
    await user.click(confirm);
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe(
      "https://api.example.com/api/clients/svc",
    );
  });

  it("rotates the secret only after a confirmation, then shows it once", async () => {
    const calls = renderApp(["identity:client:*"], "/clients/svc", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Rotate secret" }),
    );
    expect(calls.find((c) => c.url.endsWith("/rotate-secret"))).toBeUndefined();
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Rotate secret",
      }),
    );
    expect((await screen.findByTestId("client-secret")).textContent).toBe(
      "rotated",
    );
  });
});

describe("exchange policies pages", () => {
  const policies = [
    {
      clientId: "svc",
      audience: "identity",
      maxScope: "openid",
      maxChainDepth: 1,
    },
    {
      clientId: "svc",
      audience: "https://api/x:y",
      maxScope: "",
      maxChainDepth: 2,
    },
  ];
  const answer = (c: Call) => {
    if (c.url.includes("/api/exchange-policies") && c.method === "GET")
      return { policies };
    if (c.url.endsWith("/api/clients"))
      return { clients: [{ clientId: "svc", name: "Service" }] };
    return {};
  };

  it("lists policies with Manage and Delete; Add and Delete only with write", async () => {
    renderApp(["identity:exchange:read"], "/exchange", answer);
    expect(
      (await screen.findAllByText("svc", { selector: "strong" })).length,
    ).toBe(2);
    const links = screen.getAllByRole("link", { name: /^Manage the policy/ });
    expect(links[0]?.getAttribute("href")).toBe(
      "/exchange/edit?client=svc&audience=identity",
    );
    expect(links[1]?.getAttribute("href")).toBe(
      "/exchange/edit?client=svc&audience=https%3A%2F%2Fapi%2Fx%3Ay",
    );
    expect(screen.queryByRole("link", { name: "Add policy" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Delete the policy/ }),
    ).toBeNull();
  });

  it("searches in the backend by text and by audience", async () => {
    const calls = renderApp(["identity:exchange:*"], "/exchange", answer);
    const user = userEvent.setup();
    await screen.findAllByText("svc", { selector: "strong" });
    await user.type(screen.getByLabelText("Search", { exact: true }), "open");
    await user.type(
      screen.getByLabelText("Audience", { exact: true }),
      "ident",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() =>
      expect(
        calls.some((c) =>
          c.url.endsWith(
            "/api/exchange-policies?query=open&audience=ident&page_size=25",
          ),
        ),
      ).toBe(true),
    );
  });

  it("deletes a policy from the list after a confirmation", async () => {
    const calls = renderApp(["identity:exchange:*"], "/exchange", answer);
    const user = userEvent.setup();
    await user.click(
      (
        await screen.findAllByRole("button", { name: /^Delete the policy/ })
      )[0]!,
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({
      policy: {
        client_id: "svc",
        audience: "identity",
        max_scope: "openid",
        max_chain_depth: 1,
      },
      delete: true,
    });
  });

  it("adds a policy and lands on its edit page", async () => {
    const calls = renderApp(
      ["identity:exchange:*", "identity:client:read"],
      "/exchange/new",
      (c) =>
        c.url.includes("/api/exchange-policies") && c.method === "GET"
          ? {
              policies: [
                {
                  clientId: "svc",
                  audience: "bill",
                  maxScope: "openid",
                  maxChainDepth: 1,
                },
              ],
            }
          : answer(c),
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Client id"), "svc");
    await user.type(screen.getByLabelText("Audience"), "bill");
    await user.click(screen.getByRole("button", { name: "openid" }));
    await user.click(screen.getByRole("button", { name: "Save policy" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({
      policy: {
        client_id: "svc",
        audience: "bill",
        max_scope: "openid",
        max_chain_depth: 1,
      },
      delete: false,
    });
    expect(await screen.findByText("Policy created.")).toBeTruthy();
  });

  it("shows a required field inline", async () => {
    const calls = renderApp(["identity:exchange:*"], "/exchange/new", answer);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Save policy" }),
    );
    expect(
      (await screen.findAllByText("This field is required.")).length,
    ).toBeGreaterThan(0);
    expect(calls.find((c) => c.method === "PUT")).toBeUndefined();
  });

  it("edits a policy: client and audience are fixed, the limits are saved", async () => {
    const calls = renderApp(
      ["identity:exchange:*"],
      "/exchange/edit?client=svc&audience=identity",
      answer,
    );
    const user = userEvent.setup();
    expect(
      ((await screen.findByLabelText("Client id")) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Audience") as HTMLInputElement).disabled,
    ).toBe(true);
    await user.clear(screen.getByLabelText("Max chain depth"));
    await user.type(screen.getByLabelText("Max chain depth"), "3");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({
      policy: {
        client_id: "svc",
        audience: "identity",
        max_scope: "openid",
        max_chain_depth: 3,
      },
      delete: false,
    });
  });

  it("says so when the policy does not exist", async () => {
    renderApp(
      ["identity:exchange:*"],
      "/exchange/edit?client=svc&audience=nope",
      answer,
    );
    expect(
      await screen.findByText("There is no policy of svc for nope."),
    ).toBeTruthy();
  });
});

describe("home", () => {
  const answer = (c: Call): unknown => {
    if (c.url.endsWith("/api/user-stats"))
      return {
        total: "40",
        active: "30",
        pending: "6",
        disabled: "4",
        createdThisMonth: "5",
      };
    if (c.url.includes("/api/roles")) return { roles: [], total: "7" };
    if (c.url.includes("/api/permissions"))
      return { permissions: [], total: "25" };
    if (c.url.endsWith("/api/system/status"))
      return {
        apps: [
          {
            name: "identity",
            sync: "Synced",
            health: "Healthy",
            revision: "v2026.11.5-release-463f6d9",
            syncedAt: "2026-11-22T10:00:00Z",
          },
          {
            name: "gatekeeper",
            sync: "OutOfSync",
            health: "Degraded",
            revision: "b5a535e5a5bc9e1f2d3c4b5a69788796a5b4c3d2",
          },
        ],
      };
    return {};
  };

  it("greets by name and shows the numbers with their context", async () => {
    renderApp(["*"], "/", answer, { name: "Ann Admin" });
    expect(
      await screen.findByRole("heading", { name: "Hello, Ann Admin" }),
    ).toBeTruthy();
    expect((await screen.findByTestId("stat-users-value")).textContent).toBe(
      "40",
    );
    expect(screen.getByTestId("stat-users-hint").textContent).toBe(
      "+5 this month",
    );
    expect(screen.getByTestId("stat-active-value").textContent).toBe("30");
    expect(screen.getByTestId("stat-active-hint").textContent).toBe(
      "75% of all users",
    );
    expect(await screen.findByTestId("stat-roles-value")).toBeTruthy();
    expect(screen.getByTestId("stat-roles-value").textContent).toBe("7");
    expect(
      await within(screen.getByTestId("stat-roles")).findByText(
        "25 permissions",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("stat-pending-value").textContent).toBe("6");
    expect(
      screen
        .getByTestId("stat-pending")
        .querySelector("a")
        ?.getAttribute("href"),
    ).toBe("/users?status=pending");
    expect(screen.queryByText(/^[0-9a-f]{8}-/)).toBeNull(); // no raw user id
  });

  it("does not divide by zero without users", async () => {
    renderApp(["identity:user:read"], "/", () => ({
      total: "0",
      active: "0",
      pending: "0",
    }));
    expect((await screen.findByTestId("stat-active-hint")).textContent).toBe(
      "0% of all users",
    );
  });

  it("shows a card, a quick action and the system status only to a user who may use them", async () => {
    const calls = renderApp(
      ["identity:user:read", "identity:role:write"],
      "/",
      answer,
    );
    expect(await screen.findByTestId("stat-users")).toBeTruthy();
    expect(screen.queryByTestId("stat-roles")).toBeNull();
    expect(screen.queryByTestId("system-status")).toBeNull();
    expect(screen.getByTestId("quick-create-role").getAttribute("href")).toBe(
      "/roles/new",
    );
    expect(screen.queryByTestId("quick-add-user")).toBeNull();
    expect(
      calls.some(
        (c) =>
          c.url.includes("/api/roles") || c.url.includes("/api/system/status"),
      ),
    ).toBe(false);
  });

  it("links the quick actions to the forms", async () => {
    renderApp(["*"], "/", answer);
    expect(
      (await screen.findByTestId("quick-add-user")).getAttribute("href"),
    ).toBe("/users/new");
    expect(screen.getByTestId("quick-add-client").getAttribute("href")).toBe(
      "/clients/new",
    );
    expect(screen.getByTestId("quick-add-exchange").getAttribute("href")).toBe(
      "/exchange/new",
    );
  });

  it("summarises the applications of the system status", async () => {
    renderApp(["system:status:read"], "/", answer);
    expect((await screen.findByTestId("system-summary")).textContent).toBe(
      "System status of 2 applications",
    );
    // one chip per health status that occurs (Healthy always), each with its own colour, and the out of sync count
    expect(
      screen.getByTestId("health-count-Healthy").getAttribute("data-count"),
    ).toBe("1");
    expect(
      screen.getByTestId("health-count-Degraded").getAttribute("data-count"),
    ).toBe("1");
    expect(screen.queryByTestId("health-count-Unknown")).toBeNull();
    expect(screen.getByTestId("health-count-Healthy").className).toContain(
      "emerald",
    );
    expect(screen.getByTestId("health-count-Degraded").className).toContain(
      "red",
    );
    expect(screen.getByTestId("out-of-sync-count").textContent).toBe(
      "1 out of sync",
    );
    const rows = screen.getAllByTestId("system-app");
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]!).getByTestId("health-badge").getAttribute("data-health"),
    ).toBe("Healthy");
    expect(
      within(rows[1]!).getByTestId("health-badge").getAttribute("data-health"),
    ).toBe("Degraded");
    expect(within(rows[1]!).getByText("Out of sync")).toBeTruthy();
    // a chart version is shown whole, a git commit is shortened to 7 characters
    expect(
      within(rows[0]!).getByText("v2026.11.5-release-463f6d9"),
    ).toBeTruthy();
    expect(within(rows[1]!).getByText("b5a535e")).toBeTruthy();
  });
});

describe("dictionary settings page", () => {
  const settings = {
    maxSavedWords: 100,
    allowExportDeck: true,
    allowExportLink: true,
    dictionaries: { english: true, "english-vietnamese": true },
    removeAfterExport: true,
    exportedRetentionHours: 168,
    maxCategories: 50,
    maxCategoryNameLength: 40,
    exportMaxBytes: 3 * 1024 * 1024,
    exportPartMaxBytes: 3 * 1024 * 1024,
    exportSyncMaxWords: 2000,
    exportMaxBytesCeiling: 10 * 1024 * 1024,
    exportPartMaxBytesCeiling: 50 * 1024 * 1024,
    maxContentBytes: 64 * 1024,
    maxContentBytesCeiling: 256 * 1024,
    // the gateway writes int64 as a string
    contentUserQuota: "268435456",
    imageUserQuota: "20971520",
    audioUserQuota: "10485760",
    contentUserQuotaCeiling: "1073741824",
    imageUserQuotaCeiling: "1073741824",
    audioUserQuotaCeiling: "1073741824",
  };
  const answer = (c: Call) =>
    c.url.endsWith("/api/dictionary/settings") && c.method === "GET"
      ? { settings }
      : { settings };

  it("is in the menu only with dictionary:settings:read", async () => {
    renderApp(["dictionary:settings:read"], "/", answer);
    expect(
      await screen.findByRole("link", { name: "Dictionary" }),
    ).toBeTruthy();
  });

  it("is hidden without the permission", async () => {
    renderApp(["identity:role:read"], "/", answer);
    await screen.findByRole("link", { name: "Roles & Permissions" });
    expect(screen.queryByRole("link", { name: "Dictionary" })).toBeNull();
  });

  it("runs the cleanup now and shows what it deleted", async () => {
    const calls = renderApp(
      ["dictionary:settings:*"],
      "/dictionary",
      (c: Call) =>
        c.url.endsWith("/api/dictionary/cleanup")
          ? { words: "3", images: 2, audio: 1, orphanImages: 4 }
          : answer(c),
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Run cleanup now" }),
    );
    const post = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/api/dictionary/cleanup"),
    );
    expect(post!.url).toBe("https://api.example.com/api/dictionary/cleanup");
    expect(
      await screen.findByText(
        "Cleanup done: 3 words, 2 images, 1 audio files, 4 orphan images and 0 orphan audio files deleted.",
      ),
    ).toBeTruthy();
  });

  it("has no cleanup button with only the read permission", async () => {
    renderApp(["dictionary:settings:read"], "/dictionary", answer);
    await screen.findByLabelText("Max saved words per user");
    expect(
      screen.queryByRole("button", { name: "Run cleanup now" }),
    ).toBeNull();
  });

  it("saves the changed values", async () => {
    const calls = renderApp(["dictionary:settings:*"], "/dictionary", answer);
    const user = userEvent.setup();
    const max = await screen.findByLabelText("Max saved words per user");
    await user.clear(max);
    await user.type(max, "250");
    await user.click(screen.getByRole("switch", { name: "Export as link" }));
    await user.click(
      screen.getByRole("switch", { name: "English - Vietnamese" }),
    );
    await user.click(
      screen.getByRole("switch", { name: "Remove saved words after export" }),
    );
    const keep = screen.getByLabelText("Keep removed words for (hours)");
    await user.clear(keep);
    await user.type(keep, "48");
    const cats = screen.getByLabelText("Max categories per user");
    await user.clear(cats);
    await user.type(cats, "20");
    const nameLen = screen.getByLabelText("Max category name length");
    await user.clear(nameLen);
    await user.type(nameLen, "10");
    const syncWords = screen.getByLabelText("Max words of an export at once");
    await user.clear(syncWords);
    await user.type(syncWords, "1500");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!)).toEqual({
      settings: {
        max_saved_words: 250,
        allow_export_deck: true,
        allow_export_link: false,
        dictionaries: { english: true, "english-vietnamese": false },
        remove_after_export: false,
        exported_retention_hours: 48,
        max_categories: 20,
        max_category_name_length: 10,
        export_max_bytes: 3 * 1024 * 1024,
        export_part_max_bytes: 3 * 1024 * 1024,
        export_sync_max_words: 1500,
        max_content_bytes: 64 * 1024,
        content_user_quota: 256 * 1024 * 1024,
        image_user_quota: 20 * 1024 * 1024,
        audio_user_quota: 10 * 1024 * 1024,
      },
    });
    expect(await screen.findByText("Dictionary settings saved.")).toBeTruthy();
  });

  it("offers the export sizes up to the ceiling and saves the chosen ones", async () => {
    const calls = renderApp(
      ["dictionary:settings:*"],
      "/dictionary",
      (c: Call) =>
        c.method === "GET"
          ? {
              settings: {
                ...settings,
                exportMaxBytesCeiling: 6 * 1024 * 1024,
                exportPartMaxBytesCeiling: 25 * 1024 * 1024,
              },
            }
          : { settings },
    );
    const user = userEvent.setup();
    // the sizes of one export: the choices stop at the ceiling (6 MiB), the current 3 MiB is selected
    const sync = await screen.findByRole("combobox", {
      name: "Max size of an export",
    });
    expect(sync.textContent).toContain("3 MiB");
    await user.click(sync);
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent),
    ).toEqual(["1 MiB", "3 MiB", "6 MiB"]);
    await user.click(screen.getByRole("option", { name: "6 MiB" }));

    const part = screen.getByRole("combobox", {
      name: "Max size of an export part",
    });
    await user.click(part);
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent),
    ).toEqual(["3 MiB", "6 MiB", "10 MiB", "25 MiB"]);
    await user.click(screen.getByRole("option", { name: "25 MiB" }));

    await user.click(screen.getByRole("button", { name: "Save settings" }));
    const put = JSON.parse(calls.find((c) => c.method === "PUT")!.body!);
    expect(put.settings.export_max_bytes).toBe(6 * 1024 * 1024);
    expect(put.settings.export_part_max_bytes).toBe(25 * 1024 * 1024);
  });

  it("offers the storage sizes up to the ceiling and saves the chosen ones", async () => {
    const calls = renderApp(
      ["dictionary:settings:*"],
      "/dictionary",
      (c: Call) =>
        c.method === "GET"
          ? {
              settings: {
                ...settings,
                maxContentBytesCeiling: 128 * 1024,
                imageUserQuotaCeiling: String(50 * 1024 * 1024),
              },
            }
          : { settings },
    );
    const user = userEvent.setup();
    const content = await screen.findByRole("combobox", {
      name: "Max content of a word",
    });
    expect(content.textContent).toContain("64 KiB");
    await user.click(content);
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent),
    ).toEqual(["16 KiB", "32 KiB", "64 KiB", "128 KiB"]);
    await user.click(screen.getByRole("option", { name: "128 KiB" }));

    const image = screen.getByRole("combobox", {
      name: "Image quota per user",
    });
    expect(image.textContent).toContain("20 MiB");
    await user.click(image);
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent),
    ).toEqual(["1 MiB", "5 MiB", "10 MiB", "20 MiB", "50 MiB"]);
    await user.click(screen.getByRole("option", { name: "50 MiB" }));

    const quota = screen.getByRole("combobox", {
      name: "Content quota per user",
    });
    expect(quota.textContent).toContain("256 MiB");
    await user.click(quota);
    await user.click(await screen.findByRole("option", { name: "64 MiB" }));

    await user.click(screen.getByRole("button", { name: "Save settings" }));
    const put = JSON.parse(calls.find((c) => c.method === "PUT")!.body!);
    expect(put.settings.max_content_bytes).toBe(128 * 1024);
    expect(put.settings.image_user_quota).toBe(50 * 1024 * 1024);
    expect(put.settings.content_user_quota).toBe(64 * 1024 * 1024);
    expect(put.settings.audio_user_quota).toBe(10 * 1024 * 1024);
  });

  it("does not let both dictionaries be turned off", async () => {
    renderApp(["dictionary:settings:*"], "/dictionary", answer);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("switch", { name: "English" }));
    await user.click(
      screen.getByRole("switch", { name: "English - Vietnamese" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows one switch per dictionary of the registry, by group, and an id without a name by the id", async () => {
    const groups = [
      ...EN_GROUPS,
      {
        id: "x",
        dictionaries: [
          {
            id: "test-x",
            group: "x",
            source: "xx",
            target: "xx",
            enabled: true,
          },
        ],
      },
    ];
    const calls = renderApp(
      ["dictionary:settings:*"],
      "/dictionary",
      (c: Call) =>
        c.method === "GET"
          ? {
              settings: {
                ...settings,
                dictionaries: { ...settings.dictionaries, "test-x": true },
              },
            }
          : { settings },
      {},
      groups,
    );
    const user = userEvent.setup();
    const en = await screen.findByTestId("group-en");
    expect(within(en).getByRole("heading", { name: "English" })).toBeTruthy();
    expect(within(en).getAllByRole("switch")).toHaveLength(2);
    const x = screen.getByTestId("group-x");
    // no translation for the group or the dictionary: the id stands in
    expect(within(x).getByRole("heading", { name: "x" })).toBeTruthy();
    await user.click(within(x).getByRole("switch", { name: "test-x" }));
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    const put = JSON.parse(calls.find((c) => c.method === "PUT")!.body!);
    expect(put.settings.dictionaries).toEqual({
      english: true,
      "english-vietnamese": true,
      "test-x": false,
    });
  });

  it("is read only with only the read permission", async () => {
    renderApp(["dictionary:settings:read"], "/dictionary", answer);
    const sw = await screen.findByRole("switch", { name: "Export as link" });
    expect((sw as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
  });
});

describe("system style card", () => {
  it("is not in the user settings page, and the system page needs identity:settings:write", async () => {
    renderApp(["identity:settings:write"], "/settings");
    await screen.findByRole("heading", { name: "Settings" });
    expect(screen.queryByTestId("ui-style-card")).toBeNull();
  });

  it("has a menu item and a page only with identity:settings:write", async () => {
    renderApp(["identity:role:read"], "/system");
    expect(
      await screen.findByText("You are not allowed to see this page."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "System settings" })).toBeNull();
  });

  it("saves the picked style for the whole system and applies it now", async () => {
    document.documentElement.dataset.style = "saas";
    const calls = renderApp(["identity:settings:write"], "/system", () => ({
      uiStyle: "mono",
    }));
    const user = userEvent.setup();
    expect(await screen.findByTestId("ui-style-card")).toBeTruthy();
    await user.click(screen.getByTestId("ui-style-mono"));
    expect(
      screen.getByTestId("ui-style-mono").getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(
      within(screen.getByTestId("ui-style-card")).getByRole("button", {
        name: "Save style",
      }),
    );
    const put = calls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/api/ui-style"),
    );
    expect(JSON.parse(put!.body!)).toEqual({
      ui_style: "mono",
      ui_palettes: { saas: "aurora", glass: "ocean", mono: "aurora" },
    });
    expect(await screen.findByText("System style saved.")).toBeTruthy();
    expect(document.documentElement.dataset.style).toBe("mono");
  });

  it("picks the colours of the selected style, remembers them per style, and applies them on save", async () => {
    document.documentElement.dataset.palette = "aurora";
    const calls = renderApp(["identity:settings:write"], "/system", () => ({
      uiStyle: "glass",
    }));
    const user = userEvent.setup();
    expect(await screen.findByTestId("ui-style-card")).toBeTruthy();
    // glass has the ocean palette from the system value
    await user.click(screen.getByTestId("ui-style-glass"));
    await vi.waitFor(() =>
      expect(
        screen.getByTestId("ui-palette-ocean").getAttribute("aria-checked"),
      ).toBe("true"),
    );
    await user.click(screen.getByTestId("ui-palette-sunset"));
    expect(
      screen.getByTestId("ui-palette-sunset").getAttribute("aria-checked"),
    ).toBe("true");
    // another style shows its own palette, and glass keeps the pick
    await user.click(screen.getByTestId("ui-style-saas"));
    expect(
      screen.getByTestId("ui-palette-aurora").getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByTestId("ui-style-glass"));
    expect(
      screen.getByTestId("ui-palette-sunset").getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(
      within(screen.getByTestId("ui-style-card")).getByRole("button", {
        name: "Save style",
      }),
    );
    const put = calls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/api/ui-style"),
    );
    expect(JSON.parse(put!.body!)).toEqual({
      ui_style: "glass",
      ui_palettes: { saas: "aurora", glass: "sunset", mono: "aurora" },
    });
    await vi.waitFor(() =>
      expect(document.documentElement.dataset.palette).toBe("sunset"),
    );
  });
});

describe("registration settings card", () => {
  it("shows the stored switch, and saves the new value", async () => {
    const calls = renderApp(
      ["identity:settings:write", "identity:settings:read"],
      "/system",
      (c) =>
        c.url.endsWith("/api/registration-settings") && c.method === "GET"
          ? { requiresApproval: true, registrationEnabled: true }
          : { requiresApproval: false, registrationEnabled: true },
    );
    const user = userEvent.setup();
    const card = await screen.findByTestId("registration-card");
    const sw = await within(card).findByRole("switch", {
      name: "Registration requires approval",
    });
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("true"));
    await user.click(sw);
    await user.click(within(card).getByRole("button", { name: "Save" }));
    const put = calls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/api/registration-settings"),
    );
    expect(JSON.parse(put!.body!)).toEqual({ requires_approval: false });
    expect(
      await screen.findByText("Registration settings saved."),
    ).toBeTruthy();
  });

  it("says so when registration is turned off on the server", async () => {
    renderApp(
      ["identity:settings:write", "identity:settings:read"],
      "/system",
      (c) =>
        c.url.endsWith("/api/registration-settings")
          ? { requiresApproval: true }
          : {},
    );
    expect(await screen.findByText(/turned off on the server/)).toBeTruthy();
  });
});

describe("dictionary storage of a user", () => {
  const MIB = 1024 * 1024;
  const quota = (over: Record<string, string> = {}) => ({
    used: { content: String(12 * 1024), image: String(3 * MIB), audio: "0" },
    override: { content: "0", image: "0", audio: "0", ...over },
    effective: {
      content: String(256 * MIB),
      image: over.image ?? String(20 * MIB),
      audio: String(10 * MIB),
    },
  });
  const user = {
    id: "u1",
    email: "ann@example.com",
    name: "Ann",
    locale: "en",
    disabled: false,
    roles: [],
    mfaEnabled: false,
    mfaEnforced: false,
    createdAt: "0",
    status: "USER_STATUS_ACTIVE",
  };
  const answer = (c: Call) =>
    c.url.endsWith("/api/users/u1")
      ? { user }
      : c.url.endsWith("/storage/recalculate")
        ? {
            ...quota(),
            previous: {
              content: String(12 * 1024),
              image: String(9 * MIB),
              audio: "0",
            },
          }
        : c.url.endsWith("/quota")
          ? c.method === "PUT"
            ? quota({ image: String(50 * MIB) })
            : quota()
          : {};

  it("shows what the user stores against the limit and sets an own limit", async () => {
    const calls = renderApp(
      ["identity:user:read", "dictionary:settings:*"],
      "/users/u1",
      answer,
    );
    const u = userEvent.setup();
    const image = await screen.findByTestId("quota-image");
    expect(within(image).getByTestId("quota-image-usage").textContent).toBe(
      "3 MiB of 20 MiB (default)",
    );
    expect(screen.getByTestId("quota-content-usage").textContent).toBe(
      "12 KiB of 256 MiB (default)",
    );
    await u.type(within(image).getByLabelText("Own limit (MiB)"), "50");
    await u.click(screen.getByRole("button", { name: "Save limits" }));
    const put = calls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/quota"),
    );
    expect(put!.url).toBe(
      "https://api.example.com/api/dictionary/users/u1/quota",
    );
    expect(JSON.parse(put!.body!)).toEqual({
      quotas: { content: 0, image: 50 * MIB, audio: 0 },
    });
    expect(await screen.findByText("Storage limits saved.")).toBeTruthy();
    expect(screen.getByTestId("quota-image-usage").textContent).toContain(
      "(own limit)",
    );
  });

  it("recalculates the storage of the user and shows what changed", async () => {
    const calls = renderApp(
      ["identity:user:read", "dictionary:settings:*"],
      "/users/u1",
      answer,
    );
    const u = userEvent.setup();
    await screen.findByTestId("quota-image");
    await u.click(screen.getByRole("button", { name: "Recalculate" }));
    const post = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/storage/recalculate"),
    );
    expect(post!.url).toBe(
      "https://api.example.com/api/dictionary/users/u1/storage/recalculate",
    );
    expect(
      await screen.findByText(
        /Storage recalculated\. Changed: Images: 9 MiB → 3 MiB\./,
      ),
    ).toBeTruthy();
  });

  it("has no recalculate button with only the read permission", async () => {
    renderApp(
      ["identity:user:read", "dictionary:settings:read"],
      "/users/u1",
      answer,
    );
    await screen.findByTestId("quota-image");
    expect(screen.queryByRole("button", { name: "Recalculate" })).toBeNull();
  });

  it("is hidden without dictionary:settings:read and read only without write", async () => {
    renderApp(["identity:user:read"], "/users/u1", answer);
    await screen.findByText("ann@example.com");
    expect(screen.queryByTestId("quota-image")).toBeNull();
  });

  it("shows the usage but no inputs with only the read permission", async () => {
    renderApp(
      ["identity:user:read", "dictionary:settings:read"],
      "/users/u1",
      answer,
    );
    expect(await screen.findByTestId("quota-image")).toBeTruthy();
    expect(screen.queryByLabelText("Own limit (MiB)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save limits" })).toBeNull();
  });
});
