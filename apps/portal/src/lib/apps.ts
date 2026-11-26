import { BookOpen, LayoutGrid, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** An application of the home page, from `window.__env__.APPS`. */
export interface PortalApp {
  name: string;
  url: string;
  /** A name of ICONS; anything else shows the first letter. */
  icon?: string;
  /** The permission that shows the card; without one every signed in user sees it. */
  perm?: string;
  /** A name of WIDGETS: the card shows a panel instead of the plain card. */
  widget?: Widget;
}

/** The panels an entry of APPS can ask for. */
export const WIDGETS = ["dict-review"] as const;
export type Widget = (typeof WIDGETS)[number];

/** The pictures an entry of APPS can name (the CSP loads no picture from another origin, so there are no addresses). */
export const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  receipt: Receipt,
  "layout-grid": LayoutGrid,
};

const MAX_NAME = 60;

/** http is for a development run on localhost only. */
function localhost(): boolean {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function safeUrl(raw: string, allowHttp: boolean): string | undefined {
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" || (allowHttp && u.protocol === "http:")) return u.href;
  } catch {
    // not an address
  }
  return undefined;
}

/**
 * Reads APPS (a JSON string of `[{name, url, icon?, perm?, widget?}]`). It never throws: a missing or broken value is no
 * application, and an entry with a missing name or an address that is not https (http on localhost) is dropped.
 */
export function parseApps(raw: string | undefined, allowHttp = localhost()): PortalApp[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const apps: PortalApp[] = [];
  for (const e of data as unknown[]) {
    if (typeof e !== "object" || e === null) continue;
    const { name, url, icon, perm, widget } = e as Record<string, unknown>;
    if (typeof name !== "string" || typeof url !== "string") continue;
    const n = name.trim();
    const href = safeUrl(url, allowHttp);
    if (!n || n.length > MAX_NAME || !href) continue;
    apps.push({
      name: n,
      url: href,
      icon: typeof icon === "string" ? icon : undefined,
      perm: typeof perm === "string" && perm ? perm : undefined,
      widget: WIDGETS.find((w) => w === widget),
    });
  }
  return apps;
}

/** The applications the user may use: those without a permission, and those whose permission the user holds. */
export function visibleApps(apps: PortalApp[], can: (perm: string) => boolean): PortalApp[] {
  return apps.filter((a) => !a.perm || can(a.perm));
}
