import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import type { NavItem, ShellLink } from "./types";

function itemClass(isActive: boolean, collapsed: boolean) {
  return cn(
    "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
    collapsed && "justify-center px-0",
    isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
  );
}

function Item({ item, link: Link, collapsed, onNavigate }: { item: NavItem; link: ShellLink; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      end={item.end}
      className={({ isActive }) => itemClass(isActive, collapsed)}
      onClick={onNavigate}
      // collapsed: only the icon is visible, the name stays available to screen readers
      aria-label={collapsed ? item.label : undefined}
      data-testid={item.testId}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return <li>{link}</li>;
  return (
    <li>
      <Tooltip>
        {/* a wrapper: Slot would turn the className function of NavLink into text; focus and hover bubble up to it */}
        <TooltipTrigger asChild>
          <span className="block">{link}</span>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </li>
  );
}

export interface SidebarNavProps {
  items: NavItem[];
  /** Pinned to the bottom of the sidebar (Settings). */
  bottomItems?: NavItem[];
  link: ShellLink;
  collapsed?: boolean;
  label: string;
  onNavigate?: () => void;
}

/** The menu: items from the top, `bottomItems` pinned to the bottom. */
export function SidebarNav({ items, bottomItems = [], link, collapsed = false, label, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label={label} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      <ul className="flex flex-col gap-1">
        {items.map((it) => (
          <Item key={it.to} item={it} link={link} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
      {bottomItems.length > 0 ? (
        <ul className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-2">
          {bottomItems.map((it) => (
            <Item key={it.to} item={it} link={link} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </nav>
  );
}

export function SidebarBrand({ logo, brand, collapsed }: { logo: ReactNode; brand: string; collapsed: boolean }) {
  return (
    <div className={cn("flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
      {logo}
      {collapsed ? null : <span className="truncate text-sm font-semibold">{brand}</span>}
    </div>
  );
}
