import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../components/ui/button";
import { TooltipProvider } from "../components/ui/tooltip";
import { cn } from "../lib/cn";
import { Header } from "./Header";
import { Logo } from "./Logo";
import { SidebarBrand, SidebarNav } from "./Sidebar";
import { useSwipeDrawer } from "./useSwipeDrawer";
import type { Crumb, NavItem, ShellLabels, ShellLink } from "./types";

export const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

/** How far the page is scrolled before the back-to-top button shows. */
const TOP_BUTTON_AFTER = 400;

export interface AppShellProps {
  /** Product name, next to the logo (hidden when the sidebar is collapsed). */
  brand: string;
  /** Defaults to the shield `Logo`. */
  logo?: ReactNode;
  /** Menu items the user may see, top to bottom. */
  items: NavItem[];
  /** Pinned to the bottom of the sidebar (Settings). */
  bottomItems?: NavItem[];
  breadcrumbs: Crumb[];
  /** Link component of the router (`NavLink` of React Router). */
  link: ShellLink;
  labels: ShellLabels;
  /** The avatar menu (`UserMenu`). */
  userMenu: ReactNode;
  children: ReactNode;
  storageKey?: string;
  /** Changes with the page (the pathname): the content then fades in, so a tab change is not a hard cut. */
  pageKey?: string;
}

function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Frame of the app: a collapsible sidebar on the left (logo, menu, settings at the bottom) and a header
 * (breadcrumb, theme switch, avatar menu) over the page. Below the `md` breakpoint the sidebar is a drawer:
 * a swipe from the left edge opens it, a swipe to the left closes it.
 */
export function AppShell({ brand, logo, items, bottomItems, breadcrumbs, link, labels, userMenu, children, storageKey = SIDEBAR_STORAGE_KEY, pageKey }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));
  const [mobileOpen, setMobileOpen] = useState(false);
  useSwipeDrawer(mobileOpen, setMobileOpen);
  const logoNode = logo ?? <Logo />;
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // a new page starts at its top, not where the last one was left
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
    setScrolled(false);
  }, [pageKey]);

  function backToTop() {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mainRef.current?.scrollTo?.({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      // storage can be blocked: the state then lasts for this page only
    }
  }, [collapsed, storageKey]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex overflow-clip bg-background text-foreground">
        <aside
          data-testid="sidebar"
          data-collapsed={collapsed}
          className={cn(
            "relative hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out motion-reduce:transition-none md:flex",
            collapsed ? "w-14" : "w-60",
          )}
        >
          <SidebarBrand logo={logoNode} brand={brand} collapsed={collapsed} />
          <SidebarNav items={items} bottomItems={bottomItems} link={link} collapsed={collapsed} label={labels.navigation} />
          {/* a round button on the edge between the sidebar and the page */}
          <button
            type="button"
            data-testid="sidebar-toggle"
            aria-label={collapsed ? labels.expand : labels.collapse}
            aria-expanded={!collapsed}
            onClick={toggle}
            className="absolute top-1/2 -right-3 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-3.5"
          >
            {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
          </button>
        </aside>

        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none md:hidden" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg outline-none duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left motion-reduce:animate-none md:hidden"
            >
              <DialogPrimitive.Title className="sr-only">{labels.navigation}</DialogPrimitive.Title>
              <div className="flex items-center justify-between pr-2">
                <SidebarBrand logo={logoNode} brand={brand} collapsed={false} />
                <DialogPrimitive.Close
                  aria-label={labels.closeMenu}
                  className="rounded-md p-1.5 outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
                >
                  <X aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>
              <SidebarNav items={items} bottomItems={bottomItems} link={link} label={labels.navigation} onNavigate={() => setMobileOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <Header
            breadcrumbs={breadcrumbs}
            link={link}
            labels={labels}
            onOpenMobileMenu={() => setMobileOpen(true)}
            userMenu={userMenu}
          />
          <main ref={mainRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > TOP_BUTTON_AFTER)} className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
            <div
              key={pageKey}
              className="mx-auto flex w-full max-w-6xl flex-col gap-6 duration-200 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
            >
              {children}
            </div>
          </main>
          {scrolled ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              data-testid="back-to-top"
              aria-label={labels.backToTop ?? "Back to top"}
              title={labels.backToTop ?? "Back to top"}
              onClick={backToTop}
              className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 rounded-full border shadow-md duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none md:right-6 md:bottom-6"
            >
              <ChevronUp aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
