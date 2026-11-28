import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef } from "react";
import { NotificationBell, bellLabels, safeLink } from "./NotificationBell";
import type { BellItem, NotificationBellProps } from "./NotificationBell";
import type { ShellLinkProps } from "./types";

const Link = forwardRef<HTMLAnchorElement, ShellLinkProps>(function Link({ to, end: _end, className, children, ...rest }, ref) {
  const cls = typeof className === "function" ? className({ isActive: false }) : className;
  return (
    <a ref={ref} href={to} className={cls} data-router="1" {...rest}>
      {children}
    </a>
  );
});

const NOW = 1_700_000_000_000;
const item = (id: string, extra: Partial<BellItem> = {}): BellItem => ({ id, title: `Title ${id}`, body: `Body ${id}`, link: "", severity: "info", read: false, createdAt: NOW / 1000 - 300, ...extra });

function setup(over: Partial<NotificationBellProps["state"]> = {}) {
  const fns = { markRead: vi.fn(), markAllRead: vi.fn(), archive: vi.fn(), loadMore: vi.fn(), refresh: vi.fn() };
  render(
    <NotificationBell
      state={{
        items: [item("1", { link: "/users/1" }), item("2", { read: true, link: "https://admin.example.com/x" })],
        unread: 1,
        loading: false,
        failed: false,
        hasMore: false,
        ...fns,
        ...over,
      }}
      language="en"
      link={Link}
      now={NOW}
      labels={{
        title: "Notifications",
        unread: (n) => `${n} unread notifications`,
        empty: "Nothing new",
        markAllRead: "Mark all read",
        archive: "Archive",
        loadMore: "Show more",
        failed: "Could not load.",
        retry: "Try again",
      }}
    />,
  );
  return fns;
}

describe("NotificationBell", () => {
  // jsdom cannot navigate: a click on a link must not try
  beforeEach(() => {
    document.addEventListener("click", (e) => e.preventDefault());
  });

  it("shows the unread count on the badge and in the accessible name", () => {
    setup({ unread: 120 });
    expect(screen.getByTestId("notifications-badge")).toHaveTextContent("99+");
    expect(screen.getByRole("button", { name: "120 unread notifications" })).toBeInTheDocument();
  });

  it("has no badge when everything is read", () => {
    setup({ unread: 0 });
    expect(screen.queryByTestId("notifications-badge")).toBeNull();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("refreshes when it opens and lists the items with their age", async () => {
    const f = setup();
    await userEvent.click(screen.getByTestId("notifications"));
    expect(f.refresh).toHaveBeenCalledTimes(1);
    const rows = screen.getAllByTestId("notification");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Title 1")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("5 minutes ago")).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute("data-read", "false");
    expect(rows[1]).toHaveAttribute("data-read", "true");
  });

  it("marks an unread item read when it is opened; a path of the app uses the app link, a URL a plain anchor", async () => {
    const f = setup();
    await userEvent.click(screen.getByTestId("notifications"));
    const app = screen.getByRole("link", { name: /Title 1/ });
    expect(app).toHaveAttribute("data-router", "1");
    expect(app).toHaveAttribute("href", "/users/1");
    const ext = screen.getByRole("link", { name: /Title 2/ });
    expect(ext).not.toHaveAttribute("data-router");
    await userEvent.click(app);
    expect(f.markRead).toHaveBeenCalledWith(["1"]);
  });

  it("does not mark a read item again when it is opened", async () => {
    const f = setup({ items: [item("2", { read: true, link: "https://admin.example.com/x" })], unread: 0 });
    await userEvent.click(screen.getByTestId("notifications"));
    await userEvent.click(screen.getByRole("link", { name: /Title 2/ }));
    expect(f.markRead).not.toHaveBeenCalled();
  });

  it("shows a protocol-relative link as text, not as a link", async () => {
    setup({ items: [item("3", { link: "//evil.example/x" })], unread: 1 });
    await userEvent.click(screen.getByTestId("notifications"));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("marks all read, archives one, loads more", async () => {
    const f = setup({ hasMore: true });
    await userEvent.click(screen.getByTestId("notifications"));
    await userEvent.click(screen.getByTestId("notifications-read-all"));
    expect(f.markAllRead).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Archive: Title 1" }));
    expect(f.archive).toHaveBeenCalledWith("1");
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(f.loadMore).toHaveBeenCalled();
  });

  it("disables mark all read when nothing is unread, and shows the empty and failed states", async () => {
    setup({ items: [], unread: 0 });
    await userEvent.click(screen.getByTestId("notifications"));
    expect(screen.getByTestId("notifications-read-all")).toBeDisabled();
    expect(screen.getByText("Nothing new")).toBeInTheDocument();
  });

  it("shows a failure with a way to retry", async () => {
    const f = setup({ items: [], failed: true });
    await userEvent.click(screen.getByTestId("notifications"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(f.refresh).toHaveBeenCalledTimes(2);
  });

  it("never makes an href of a link with another scheme", async () => {
    setup({ items: [item("1", { link: "javascript:alert(1)" }), item("2", { link: "data:text/html,x" })], unread: 2 });
    await userEvent.click(screen.getByTestId("notifications"));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Title 1")).toBeInTheDocument(); // still shown, as text
  });
});

describe("safeLink", () => {
  it("lets through a path and an http(s) URL only", () => {
    expect(safeLink("/users/1")).toBe("/users/1");
    expect(safeLink("https://admin.example.com/x")).toBe("https://admin.example.com/x");
    for (const bad of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "data:text/html,x", "", "users/1"]) expect(safeLink(bad)).toBe("");
  });
});

describe("bellLabels", () => {
  it("takes the labels from the translator under the keys every app uses", () => {
    const t = (key: string, o?: { count: number }): string => (o ? `${key}:${o.count}` : key);
    const labels = bellLabels(t);
    expect(labels.title).toBe("notifications.title");
    expect(labels.unread(3)).toBe("notifications.unread:3");
    expect(Object.values({ ...labels, unread: "" }).every((v) => typeof v === "string" && v.startsWith("notifications.") || v === "")).toBe(true);
  });
});
