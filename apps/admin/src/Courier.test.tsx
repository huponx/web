import { AuthProvider, createClient } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { allowedOf } from "./test-rules";

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

const EVENT_TYPES = {
  locales: ["en", "vi"],
  eventTypes: [
    {
      type: "system.announcement",
      category: "system",
      template: "system_announcement",
      channels: ["email", "in_app"],
      required: ["title", "message"],
      optional: ["link"],
      broadcast: true,
      templates: [
        { locale: "en", channel: "email", customized: true, version: 2 },
        { locale: "en", channel: "in_app" },
        { locale: "vi", channel: "email" },
        { locale: "vi", channel: "in_app" },
      ],
    },
    {
      type: "account.registration_pending",
      category: "admin",
      template: "identity_registration_pending",
      channels: ["email"],
      digestWindow: "10m",
      templates: [
        { locale: "en", channel: "email" },
        { locale: "en", channel: "email", template: "identity_registration_pending_digest", customized: true, version: 1 },
      ],
    },
    { type: "security.mfa_changed", category: "security", template: "identity_mfa_changed", channels: ["email"], mandatory: true, templates: [{ locale: "en", channel: "email" }] },
  ],
};

function renderApp(perms: string[], route: string, answer: (c: Call) => unknown = () => ({})) {
  const calls: Call[] = [];
  const me: Me = { sub: "ann", roles: ["admin"], scopes: [], perms, allowed: allowedOf(perms), amr: [], csrf_token: "c", expires_at: "2030-01-01T00:00:00Z" };
  const client = createClient({
    apiBase: "https://api.example.com",
    fetch: async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/me")) return new Response(JSON.stringify(me), { status: 200 });
      if (u.endsWith("/api/ui-style")) return new Response(JSON.stringify({ uiStyle: "saas", uiPalettes: { saas: "aurora", glass: "ocean", mono: "aurora" } }), { status: 200 });
      const call: Call = { method: init?.method ?? "GET", url: u.replace("https://api.example.com", ""), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined };
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

const READ = ["courier:template:read", "courier:template:write", "courier:broadcast:send", "courier:delivery:read", "courier:notification:manage", "courier:webhook:manage"];

describe("menu", () => {
  it("shows the notification pages only with their permissions", async () => {
    renderApp([], "/");
    await screen.findByTestId("user-menu");
    for (const id of ["nav-templates", "nav-announcements", "nav-deliveries"]) expect(screen.queryByTestId(id)).toBeNull();
  });

  it("shows each page for its own permission", async () => {
    renderApp(["courier:delivery:read"], "/");
    expect(await screen.findByTestId("nav-deliveries")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-templates")).toBeNull();
    expect(screen.queryByTestId("nav-announcements")).toBeNull();
  });
});

describe("templates", () => {
  it("lists the event types with the templates and which are edited", async () => {
    renderApp(READ, "/templates", (c) => (c.url === "/api/courier/event-types" ? EVENT_TYPES : {}));
    expect(await screen.findByText("system.announcement")).toBeInTheDocument();
    const edited = screen.getByRole("link", { name: "Edit system.announcement, en, E-mail" });
    expect(edited).toHaveAttribute("href", "/templates/system_announcement/en/email");
    expect(edited).toHaveTextContent("v2");
    expect(screen.getByRole("link", { name: "Edit system.announcement, vi, In the app" })).not.toHaveTextContent(/· v\d/);
    expect(screen.getByText(/mandatory/)).toBeInTheDocument();
  });

  it("lists the digest template of a grouped event, with its window", async () => {
    renderApp(READ, "/templates", (c) => (c.url === "/api/courier/event-types" ? EVENT_TYPES : {}));
    expect(await screen.findByText(/grouped within 10m/)).toBeInTheDocument();
    const digest = screen.getByRole("link", { name: "Edit the digest of account.registration_pending, en, E-mail" });
    expect(digest).toHaveAttribute("href", "/templates/identity_registration_pending_digest/en/email");
    expect(digest).toHaveTextContent("digest · en · E-mail · v1");
  });

  it("offers count and items to the editor of a digest template", async () => {
    renderApp(READ, "/templates/identity_registration_pending_digest/en/email", (c) => {
      if (c.url === "/api/courier/event-types") return EVENT_TYPES;
      if (c.url.endsWith("/versions")) return { versions: [] };
      return { content: { subject: "{{.count}} waiting", text: "{{.items}}" } };
    });
    expect(await screen.findByLabelText("Subject")).toHaveValue("{{.count}} waiting");
    expect(screen.getByText("{{.count}}", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("{{.items}}", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText(/replaces several events of this type that come within 10m/)).toBeInTheDocument();
  });

  const doc = { content: { subject: "{{.title}}", text: "Hello {{.name}}\n{{.message}}" }, customized: true, version: 2, updatedBy: "ann", updatedAt: "1700000000" };

  it("edits, previews and saves a template", async () => {
    const calls = renderApp(READ, "/templates/system_announcement/en/email", (c) => {
      if (c.url === "/api/courier/event-types") return EVENT_TYPES;
      if (c.method === "GET" && c.url.endsWith("/versions")) return { versions: [{ version: 2, content: { subject: "{{.title}}", text: "v2" }, updatedBy: "ann", updatedAt: "1700000000" }, { version: 1, content: { subject: "old", text: "v1" } }] };
      if (c.method === "GET") return doc;
      if (c.url.endsWith("/preview")) return { rendered: { subject: "Maintenance", text: "Hello Alex\nTonight" } };
      if (c.method === "PUT") return { version: 3 };
      return {};
    });
    const subject = await screen.findByLabelText("Subject");
    expect(subject).toHaveValue("{{.title}}");
    expect(screen.getByText("Edited, version 2")).toBeInTheDocument();
    expect(screen.getByText("{{.message}}")).toBeInTheDocument(); // a value the template can use

    await userEvent.clear(subject);
    await userEvent.type(subject, "NEWS {{{{.title}}");
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByTestId("preview-subject")).toHaveTextContent("Maintenance");
    expect(screen.getByTestId("preview-text")).toHaveTextContent("Hello Alex");
    const preview = calls.find((c) => c.url.endsWith("/preview"))!;
    expect(preview.body).toEqual({ content: { subject: "NEWS {{.title}}", text: "Hello {{.name}}\n{{.message}}", html: "" } });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.url).toBe("/api/courier/templates/system_announcement/en/email");
    expect(await screen.findByText("Template saved.")).toBeInTheDocument();
  });

  it("loads an older version into the editor and reverts to the built-in template", async () => {
    const calls = renderApp(READ, "/templates/system_announcement/en/email", (c) => {
      if (c.url === "/api/courier/event-types") return EVENT_TYPES;
      if (c.method === "GET" && c.url.endsWith("/versions")) return { versions: [{ version: 2, content: { subject: "two", text: "t2" } }, { version: 1, content: { subject: "one", text: "t1" } }] };
      if (c.method === "GET") return doc;
      return {};
    });
    const versions = await screen.findAllByTestId("template-version");
    await userEvent.click(within(versions[1]!).getByRole("button", { name: "Use this version" }));
    expect(screen.getByLabelText("Subject")).toHaveValue("one");

    await userEvent.click(screen.getByRole("button", { name: "Back to built-in" }));
    // the dialog asks again with the same label
    await userEvent.click((await screen.findAllByRole("button", { name: "Back to built-in" })).at(-1)!);
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("does not offer Save to a user who can only read", async () => {
    renderApp(["courier:template:read"], "/templates/system_announcement/en/email", (c) => (c.url === "/api/courier/event-types" ? EVENT_TYPES : c.url.endsWith("/versions") ? { versions: [] } : doc));
    await screen.findByLabelText("Subject");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });
});

describe("announcements", () => {
  it("sends to everyone after a confirmation and lists the history", async () => {
    const calls = renderApp(READ, "/announcements", (c) => {
      if (c.method === "GET") return { broadcasts: [{ id: "b1", eventType: "system.announcement", audience: { role: "editor" }, createdBy: "ann", createdAt: "1700000000", recipients: 4, skipped: 1 }] };
      return { broadcast: { id: "b2", recipients: 10 } };
    });
    expect(await screen.findByText("role editor")).toBeInTheDocument();
    expect(screen.getByText("4 (1 not reached)")).toBeInTheDocument();

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled(); // a title and a message are needed
    await userEvent.type(screen.getByLabelText("Title"), "Maintenance");
    await userEvent.type(screen.getByLabelText("Message"), "Tonight at 22:00");
    await userEvent.click(send);
    // the confirmation dialog has a Send button too
    await userEvent.click((await screen.findAllByRole("button", { name: "Send" })).at(-1)!);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      eventType: "system.announcement",
      audience: { all: true },
      data: { title: "Maintenance", message: "Tonight at 22:00" },
      channels: ["email", "in_app", "push"],
    });
    expect(await screen.findByText("Announcement sent.")).toBeInTheDocument();
  });

  it("sends on the channels that stay checked", async () => {
    const calls = renderApp(READ, "/announcements", (c) => {
      if (c.url === "/api/courier/event-types") return EVENT_TYPES;
      if (c.method === "GET") return { broadcasts: [{ id: "b1", eventType: "system.announcement", audience: { all: true }, createdBy: "ann", createdAt: "1700000000", recipients: 2, channels: ["in_app"] }, { id: "b0", eventType: "system.announcement", audience: { all: true }, recipients: 1 }] };
      return { broadcast: { id: "b2", recipients: 3 } };
    });
    const group = await screen.findByTestId("announcement-channels");
    // the boxes are the channels of the event type in the catalog
    expect(within(group).getAllByRole("checkbox").map((c) => c.getAttribute("id"))).toEqual(["ch-email", "ch-in_app"]);
    await userEvent.type(screen.getByLabelText("Title"), "Heads up");
    await userEvent.type(screen.getByLabelText("Message"), "Bell only please");
    await userEvent.click(within(group).getByRole("checkbox", { name: "E-mail" }));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await userEvent.click((await screen.findAllByRole("button", { name: "Send" })).at(-1)!);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body?.channels).toEqual(["in_app"]);
    // the history names the channels of each announcement; one made before they could be chosen says all
    expect(screen.getByText("In the app (bell)", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("all", { selector: "td" })).toBeInTheDocument();
  });

  it("cannot send without a channel", async () => {
    renderApp(READ, "/announcements", (c) => (c.url === "/api/courier/event-types" ? EVENT_TYPES : { broadcasts: [] }));
    const group = await screen.findByTestId("announcement-channels");
    await userEvent.type(screen.getByLabelText("Title"), "t");
    await userEvent.type(screen.getByLabelText("Message"), "m");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    for (const box of within(group).getAllByRole("checkbox")) await userEvent.click(box);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(within(group).getByText("Choose at least one channel.")).toBeInTheDocument();
  });

  it("has no form without the permission to send", async () => {
    renderApp(["courier:delivery:read"], "/announcements");
    await screen.findByTestId("user-menu");
    expect(screen.queryByLabelText("Title")).toBeNull();
  });
});

describe("deliveries", () => {
  const rows = {
    deliveries: [
      { delivery: { id: "d1", channel: "email", address: "an@x.io", status: "DELIVERY_STATUS_SENT", attempts: 1 }, notificationId: "n1", eventType: "system.announcement", createdAt: "1700000000", merged: 2 },
      { delivery: { id: "d2", channel: "telegram", address: "42", status: "DELIVERY_STATUS_DEAD", attempts: 5, lastError: "telegram: chat not found" }, notificationId: "n2", eventType: "bvchain.checkin", createdAt: "1700000100" },
    ],
  };

  it("lists the log, filters by status and retries a dead delivery", async () => {
    const calls = renderApp(READ, "/deliveries", (c) => (c.method === "GET" ? rows : {}));
    expect(await screen.findByText("an@x.io", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("telegram: chat not found")).toBeInTheDocument();
    expect(screen.getByText("3 events in one message")).toBeInTheDocument(); // the digest of d1: its own event and 2 more
    // only a failed or dead delivery can be retried
    expect(screen.getAllByRole("button", { name: /Retry the message/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Retry the message to 42" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/courier/deliveries/d2/retry")).toBe(true));
    expect(await screen.findByText("Queued again.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Address"), "an@");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls.some((c) => c.method === "GET" && c.url.includes("address=an%40"))).toBe(true));
  });

  it("hides the retry from a user who may only read the log", async () => {
    renderApp(["courier:delivery:read"], "/deliveries", () => rows);
    await screen.findByText("telegram: chat not found");
    expect(screen.queryByRole("button", { name: /Retry the message/ })).toBeNull();
  });
});

describe("webhooks", () => {
  const hooks = { webhooks: [{ id: "w1", name: "ops", url: "https://hooks.slack.com/services/T/B/x", kind: "slack", events: ["bvchain.*"], enabled: true }] };

  it("is in the menu only for the permission", async () => {
    renderApp(["courier:delivery:read"], "/");
    await screen.findByTestId("nav-deliveries");
    expect(screen.queryByTestId("nav-webhooks")).toBeNull();
  });

  it("lists the webhooks and tests one", async () => {
    const calls = renderApp(READ, "/webhooks", (c) => (c.method === "GET" ? hooks : { ok: true, result: "HTTP 200: ok" }));
    expect(await screen.findByText("ops")).toBeInTheDocument();
    expect(screen.getByText("bvchain.*")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send a test to ops" }));
    expect(await screen.findByTestId("webhook-test-result")).toHaveTextContent("The endpoint answered. ops: HTTP 200: ok");
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/courier/webhooks/w1/test")).toBe(true);
  });

  it("creates a signed webhook and shows its secret once", async () => {
    const calls = renderApp(READ, "/webhooks", (c) => (c.method === "GET" ? hooks : { webhook: { id: "w2", name: "svc", kind: "generic", url: "https://svc.example.com/h", events: ["bvchain.failed"], enabled: true, hasSecret: true }, secret: "abc123secret" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add a webhook" }));
    const form = await screen.findByTestId("webhook-form");
    await userEvent.type(within(form).getByLabelText("Name"), "svc");
    await userEvent.click(within(form).getByRole("combobox", { name: "Kind" }));
    await userEvent.click(await screen.findByRole("option", { name: "Signed JSON" }));
    await userEvent.type(within(form).getByLabelText("URL"), "https://svc.example.com/h");
    await userEvent.type(within(form).getByLabelText("Events"), "bvchain.failed");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("webhook-secret")).toHaveTextContent("abc123secret");
    const post = calls.find((c) => c.method === "POST" && c.url === "/api/courier/webhooks")!;
    expect(post.body).toEqual({ webhook: { name: "svc", url: "https://svc.example.com/h", kind: "generic", events: ["bvchain.failed"], enabled: true }, rotateSecret: false });
  });

  it("edits with a PUT to the id and deletes after a confirmation", async () => {
    const calls = renderApp(READ, "/webhooks", (c) => (c.method === "GET" ? hooks : { webhook: hooks.webhooks[0] }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit ops" }));
    const form = await screen.findByTestId("webhook-form");
    expect(within(form).getByLabelText("Name")).toHaveValue("ops");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url === "/api/courier/webhooks/w1")).toBe(true));

    await userEvent.click(screen.getByRole("button", { name: "Delete ops" }));
    await userEvent.click((await screen.findAllByRole("button", { name: "Delete" })).at(-1)!);
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/courier/webhooks/w1")).toBe(true));
  });
});
