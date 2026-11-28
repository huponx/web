import { Archive, Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { relativeTime } from "../components/sessions-panel";
import { cn } from "../lib/cn";
import type { ShellLink } from "./types";

/** One notification of the list; the same shape `useNotifications` of auth-client returns (the kit does not depend on it). */
export interface BellItem {
  id: string;
  title: string;
  body: string;
  /** A path of the app ("/users/1": client side navigation) or a URL (another app: a plain link); empty: nothing to open. */
  link: string;
  severity: "info" | "warning" | "critical";
  read: boolean;
  /** Unix seconds. */
  createdAt: number;
}

export interface NotificationBellLabels {
  /** The trigger and the title of the popover ("Notifications"). */
  title: string;
  /** Accessible name of the trigger with the count ("3 unread notifications"). */
  unread: (n: number) => string;
  empty: string;
  markAllRead: string;
  archive: string;
  loadMore: string;
  failed: string;
  retry: string;
}

/**
 * What the bell needs to know and do: exactly what `useNotifications` of auth-client returns (the kit does not depend on
 * it, so the shape is declared here and any source of it fits).
 */
export interface BellState {
  items: BellItem[];
  unread: number;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void> | void;
  /** Reads the list again: when the popover opens, and the "try again" of a failure. */
  refresh: () => Promise<void> | void;
  markRead: (ids: string[]) => Promise<void> | void;
  markAllRead: () => Promise<void> | void;
  archive: (id: string) => Promise<void> | void;
}

export interface NotificationBellProps {
  state: BellState;
  labels: NotificationBellLabels;
  /** Language of the relative times ("5 minutes ago"). */
  language: string;
  /** The link component of the app, for a link that is a path of the app. */
  link: ShellLink;
  /** The current time in ms (tests). */
  now?: number;
}

/** The labels of the bell from the translator of an app, with the keys every app uses under `notifications.`. */
export function bellLabels(
  // loose on purpose, like Translator: the overloads of i18next's own `t` are not assignable to a narrower signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (...args: any[]) => unknown,
): NotificationBellLabels {
  const text = (key: string, options?: { count: number }) => String(t(key, options));
  return {
    title: text("notifications.title"),
    unread: (count) => text("notifications.unread", { count }),
    empty: text("notifications.empty"),
    markAllRead: text("notifications.markAllRead"),
    archive: text("notifications.archive"),
    loadMore: text("notifications.loadMore"),
    failed: text("notifications.failed"),
    retry: text("notifications.retry"),
  };
}

const dot: Record<BellItem["severity"], string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  critical: "bg-destructive",
};

/** A path of this app: starts with one slash (not "//host"). Anything else is a URL for a plain anchor. */
function isAppPath(link: string): boolean {
  return link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\");
}

/**
 * What a notification may open: a path of the app or an http(s) URL. courier checks this when it accepts the event;
 * this is the second check, so a link such as "javascript:..." is never an href of the page, whatever the data holds.
 */
export function safeLink(link: string): string {
  if (isAppPath(link)) return link;
  try {
    const u = new URL(link);
    return u.protocol === "https:" || u.protocol === "http:" ? link : "";
  } catch {
    return "";
  }
}

/**
 * The bell of the header: a badge with the unread count and a popover with the list. It knows nothing of the gateway:
 * the app gives it the state of `useNotifications` and the labels, so every app shows the same bell.
 */
export function NotificationBell({ state, labels, language, link: Link, now }: NotificationBellProps) {
  const { items, unread, loading, failed, hasMore } = state;
  const [open, setOpen] = useState(false);
  const at = now ?? Date.now();
  const badge = unread > 99 ? "99+" : String(unread);

  function change(next: boolean) {
    setOpen(next);
    if (next) void state.refresh();
  }

  function row(it: BellItem) {
    const content = (
      <>
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", it.read ? "bg-transparent" : dot[it.severity])} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", it.read ? "text-muted-foreground" : "font-medium")}>{it.title}</span>
          {it.body ? <span className="line-clamp-2 block text-xs text-muted-foreground">{it.body}</span> : null}
          <span className="block text-xs text-muted-foreground">{relativeTime(it.createdAt, at, language)}</span>
        </span>
      </>
    );
    const cls = "flex min-w-0 flex-1 gap-2 rounded-sm px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50";
    const opened = () => {
      if (!it.read) void state.markRead([it.id]);
      setOpen(false);
    };
    const href = safeLink(it.link);
    if (!href) {
      return (
        <button type="button" className={cls} onClick={() => !it.read && void state.markRead([it.id])}>
          {content}
        </button>
      );
    }
    return isAppPath(href) ? (
      <Link to={href} className={cls} onClick={opened}>
        {content}
      </Link>
    ) : (
      <a href={href} className={cls} onClick={opened} rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread > 0 ? labels.unread(unread) : labels.title} data-testid="notifications">
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <span
              className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white"
              data-testid="notifications-badge"
              aria-hidden="true"
            >
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          <Button variant="ghost" size="sm" disabled={unread === 0} onClick={() => void state.markAllRead()} data-testid="notifications-read-all">
            <CheckCheck aria-hidden="true" />
            {labels.markAllRead}
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto p-1" data-testid="notifications-list">
          {failed ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {labels.failed}{" "}
              <button type="button" className="underline" onClick={() => void state.refresh()}>
                {labels.retry}
              </button>
            </p>
          ) : items.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul>
              {items.map((it) => (
                <li key={it.id} className="group flex items-start" data-testid="notification" data-read={it.read}>
                  {row(it)}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="mt-1 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                    aria-label={`${labels.archive}: ${it.title}`}
                    onClick={() => void state.archive(it.id)}
                  >
                    <Archive aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {hasMore ? (
            <Button variant="ghost" size="sm" className="mt-1 w-full" disabled={loading} onClick={() => void state.loadMore()}>
              {labels.loadMore}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
