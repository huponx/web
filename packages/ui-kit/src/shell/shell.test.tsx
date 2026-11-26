import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Home, Settings, Users } from "lucide-react";
import { forwardRef } from "react";
import { DropdownMenuItem } from "../components/ui/dropdown-menu";
import { ThemeProvider } from "../theme/ThemeProvider";
import { AppShell } from "./AppShell";
import { initials, UserMenu } from "./UserMenu";
import type { ShellLabels, ShellLinkProps } from "./types";

const labels: ShellLabels = {
  navigation: "Main",
  collapse: "Collapse sidebar",
  expand: "Expand sidebar",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  breadcrumb: "Breadcrumb",
  theme: { group: "Theme", light: "Light", dark: "Dark", system: "System" },
};

/** Plain anchors: the shell does not depend on a router (a forwardRef like React Router's NavLink). */
const Link = forwardRef<HTMLAnchorElement, ShellLinkProps>(function Link({ to, end: _end, className, children, ...rest }, ref) {
  const cls = typeof className === "function" ? className({ isActive: false }) : className;
  return (
    <a ref={ref} href={to} className={cls} {...rest}>
      {children}
    </a>
  );
});

function renderShell(extra: { signOut?: () => void } = {}) {
  return render(
    <ThemeProvider>
      <AppShell
        brand="Admin Portal"
        items={[
          { to: "/", label: "Home", icon: Home, end: true },
          { to: "/users", label: "Users", icon: Users },
        ]}
        bottomItems={[{ to: "/settings", label: "Settings", icon: Settings }]}
        breadcrumbs={[{ label: "Home", to: "/" }, { label: "Users" }]}
        link={Link}
        labels={labels}
        userMenu={
          <UserMenu name="ann@example.com" label="User menu">
            <DropdownMenuItem onSelect={extra.signOut}>Sign out</DropdownMenuItem>
          </UserMenu>
        }
      >
        <p>page</p>
      </AppShell>
    </ThemeProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("AppShell", () => {
  it("shows the logo and brand, the menu with Settings at the bottom, the breadcrumb and the page", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Home", "Users", "Settings"]);
    expect(screen.getByText("Admin Portal")).toBeTruthy();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(within(crumbs).getByText("Users").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("page")).toBeTruthy();
  });

  it("collapses to icons only, keeps the names accessible, and remembers the state", async () => {
    const { unmount } = renderShell();
    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar.getAttribute("data-collapsed")).toBe("false");

    await userEvent.click(screen.getByTestId("sidebar-toggle"));
    expect(sidebar.getAttribute("data-collapsed")).toBe("true");
    expect(screen.queryByText("Admin Portal")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Users" }).textContent).toBe("");
    // the tooltip wrapper must not turn the className function of the link into text (it did once)
    expect(within(nav).getByRole("link", { name: "Users" }).className).toContain("justify-center");
    expect(within(nav).getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByTestId("sidebar-toggle").getAttribute("aria-label")).toBe("Expand sidebar");
    expect(localStorage.getItem("sidebar-collapsed")).toBe("1");
    unmount();

    renderShell();
    expect(screen.getByTestId("sidebar").getAttribute("data-collapsed")).toBe("true");
    await userEvent.click(screen.getByTestId("sidebar-toggle"));
    expect(screen.getByTestId("sidebar").getAttribute("data-collapsed")).toBe("false");
    expect(localStorage.getItem("sidebar-collapsed")).toBe("0");
  });

  it("shows the name next to the avatar and opens a menu with the items only", async () => {
    const signOut = vi.fn();
    renderShell({ signOut });
    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByTestId("user-name").textContent).toBe("ann@example.com");
    expect(screen.queryByTestId("user-info")).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("puts the theme switch before the avatar", () => {
    renderShell();
    const sw = screen.getByTestId("theme-switch");
    expect(screen.getAllByTestId("theme-switch")).toHaveLength(1); // a single icon
    const avatar = screen.getByTestId("user-menu");
    expect(sw.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("initials", () => {
  it("takes letters from names and e-mail addresses", () => {
    expect(initials("Administrator")).toBe("A");
    expect(initials("  ann lee")).toBe("A");
    expect(initials("ann@example.com")).toBe("A");
    expect(initials("Đức")).toBe("Đ");
    expect(initials("")).toBe("?");
  });
});

describe("back to top", () => {
  it("shows a button once the page is scrolled down, and it scrolls the page to the top", () => {
    renderShell();
    const main = screen.getByRole("main");
    const scrollTo = vi.fn();
    main.scrollTo = scrollTo as unknown as typeof main.scrollTo;
    expect(screen.queryByTestId("back-to-top")).toBeNull();
    main.scrollTop = 120;
    fireEvent.scroll(main);
    expect(screen.queryByTestId("back-to-top")).toBeNull(); // not far enough
    main.scrollTop = 900;
    fireEvent.scroll(main);
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    main.scrollTop = 0;
    fireEvent.scroll(main);
    expect(screen.queryByTestId("back-to-top")).toBeNull();
  });
});

describe("swipe gestures of the drawer", () => {
  const touch = (type: "touchstart" | "touchend", x: number, y = 300) => {
    const point = { clientX: x, clientY: y, identifier: 1, target: document.body };
    act(() => {
      fireEvent(document, Object.assign(new Event(type, { bubbles: true }), { touches: type === "touchstart" ? [point] : [], changedTouches: [point] }));
    });
  };
  const swipe = (from: number, to: number, y2 = 300) => {
    touch("touchstart", from);
    touch("touchend", to, y2);
  };
  const width = window.innerWidth;
  afterEach(() => {
    window.innerWidth = width;
  });

  it("opens from the left edge and closes with a swipe to the left (phone width only)", () => {
    window.innerWidth = 390;
    renderShell();
    expect(screen.queryByRole("dialog")).toBeNull();
    swipe(200, 320); // not from the edge
    expect(screen.queryByRole("dialog")).toBeNull();
    swipe(30, 60); // too short
    expect(screen.queryByRole("dialog")).toBeNull();
    swipe(30, 140, 500); // mostly vertical
    expect(screen.queryByRole("dialog")).toBeNull();
    swipe(30, 160);
    expect(screen.getByRole("dialog")).toBeTruthy();
    swipe(250, 120);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores a swipe that begins inside something that scrolls sideways", () => {
    window.innerWidth = 390;
    renderShell();
    const row = document.createElement("div");
    row.style.overflowX = "auto";
    Object.defineProperty(row, "scrollWidth", { value: 600 });
    Object.defineProperty(row, "clientWidth", { value: 300 });
    document.body.append(row);
    const point = (x: number) => ({ clientX: x, clientY: 300, identifier: 1, target: row });
    const fire = (type: string, x: number) =>
      act(() => {
        fireEvent(row, Object.assign(new Event(type, { bubbles: true }), { touches: type === "touchstart" ? [point(x)] : [], changedTouches: [point(x)] }));
      });
    fire("touchstart", 30);
    fire("touchend", 160);
    expect(screen.queryByRole("dialog")).toBeNull();
    row.remove();
  });

  it("ignores a drag that begins on a slider or in a dialog", () => {
    window.innerWidth = 390;
    renderShell();
    const slider = document.createElement("input");
    slider.type = "range";
    document.body.append(slider);
    const point = (x: number) => ({ clientX: x, clientY: 300, identifier: 1, target: slider });
    const fire = (type: string, x: number) =>
      act(() => {
        fireEvent(slider, Object.assign(new Event(type, { bubbles: true }), { touches: type === "touchstart" ? [point(x)] : [], changedTouches: [point(x)] }));
      });
    fire("touchstart", 30);
    fire("touchend", 160);
    expect(screen.queryByRole("dialog")).toBeNull();
    slider.remove();
  });

  it("does nothing on a wide screen", () => {
    window.innerWidth = 1280;
    renderShell();
    swipe(30, 160);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves the first pixels to the browser (its back gesture)", () => {
    window.innerWidth = 390;
    renderShell();
    swipe(8, 140);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
