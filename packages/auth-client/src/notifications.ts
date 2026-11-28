import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthClient } from "./client";

export type Severity = "info" | "warning" | "critical";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  /** A path or URL to open; empty when there is nothing to open. */
  link: string;
  severity: Severity;
  read: boolean;
  /** Unix seconds. */
  createdAt: number;
}

export interface Notifications {
  items: NotificationItem[];
  /** Unread count of the bell. */
  unread: number;
  loading: boolean;
  /** The list could not be read. */
  failed: boolean;
  hasMore: boolean;
  /** True while the realtime stream is open; otherwise the count is polled. */
  live: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  archive: (id: string) => Promise<void>;
}

export interface UseNotificationsOptions {
  /** Without it nothing is read or opened (the user may not see the bell, or a test). Default true. */
  enabled?: boolean;
  /** How often the unread count is read while the stream is down (default 60 s). */
  pollMs?: number;
  /** Items per page (default 20). */
  pageSize?: number;
}

interface WireItem {
  id: string;
  title?: string;
  body?: string;
  link?: string;
  severity?: string;
  read?: boolean;
  createdAt?: string | number;
}

interface WireList {
  items?: WireItem[];
  nextPageToken?: string;
  unread?: number;
}

/** The gateway answers with protojson: int64 as a string and the enum by name. */
export function toItem(w: WireItem): NotificationItem {
  const sev = (w.severity ?? "").replace("SEVERITY_", "").toLowerCase();
  return {
    id: w.id,
    title: w.title ?? "",
    body: w.body ?? "",
    link: w.link ?? "",
    severity: sev === "warning" || sev === "critical" ? sev : "info",
    read: w.read === true,
    createdAt: Number(w.createdAt ?? 0),
  };
}

/**
 * The notifications of the signed in user (the bell): the list, the unread count, and the actions. The count and
 * new items arrive over Server-Sent Events (`/api/notifications/stream`, the browser reconnects by itself); while the
 * stream is down the count is polled. A read in another tab or app arrives on the stream too, so every bell agrees.
 * Reads and changes go through the gateway with the session cookie, like every other call.
 */
export function useNotifications(client: AuthClient, opts: UseNotificationsOptions = {}): Notifications {
  const { enabled = true, pollMs = 60_000, pageSize = 20 } = opts;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [next, setNext] = useState("");
  const [live, setLive] = useState(false);
  const unreadRef = useRef(0);
  unreadRef.current = unread;
  const generation = useRef(0); // a refresh that finishes after a newer one is dropped

  const load = useCallback(
    async (token: string) => {
      const gen = ++generation.current;
      setLoading(true);
      try {
        const q = new URLSearchParams({ pageSize: String(pageSize) });
        if (token) q.set("pageToken", token);
        const r = await client.api<WireList>("GET", `/api/notifications?${q.toString()}`);
        if (gen !== generation.current) return;
        const got = (r.items ?? []).map(toItem);
        setItems((prev) => (token ? [...prev, ...got.filter((g) => !prev.some((p) => p.id === g.id))] : got));
        setNext(r.nextPageToken ?? "");
        setUnread(r.unread ?? 0);
        setFailed(false);
      } catch {
        if (gen === generation.current) setFailed(true);
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [client, pageSize],
  );

  const refresh = useCallback(() => load(""), [load]);
  const loadMore = useCallback(() => (next ? load(next) : Promise.resolve()), [load, next]);

  useEffect(() => {
    if (!enabled) return;
    void load("");
  }, [enabled, load]);

  // realtime
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const es = new EventSource(`${client.apiBase}/api/notifications/stream`, { withCredentials: true });
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false); // the browser reconnects; the polling below covers the gap
    es.onmessage = (e: MessageEvent<string>) => {
      let ev: { unread?: number; item?: WireItem; heartbeat?: boolean };
      try {
        ev = JSON.parse(e.data) as typeof ev;
      } catch {
        return;
      }
      if (ev.heartbeat) return;
      const count = ev.unread ?? 0;
      if (ev.item) {
        const item = toItem(ev.item);
        setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [item, ...prev]));
        setUnread(count);
      } else if (count !== unreadRef.current) {
        // read or archived in another tab (or the first message after a reconnect): the list is out of date
        setUnread(count);
        void load("");
      }
    };
    return () => {
      es.close();
      setLive(false);
    };
  }, [client, enabled, load]);

  // fallback: the count while the stream is down
  useEffect(() => {
    if (!enabled || live) return;
    const t = setInterval(() => {
      client
        .api<{ unread?: number }>("GET", "/api/notifications/unread-count")
        .then((r) => {
          const n = r.unread ?? 0;
          if (n !== unreadRef.current) void load("");
        })
        .catch(() => undefined);
    }, pollMs);
    return () => clearInterval(t);
  }, [client, enabled, live, pollMs, load]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)));
      try {
        const r = await client.api<{ unread?: number }>("POST", "/api/notifications/read", { ids });
        setUnread(r.unread ?? 0);
      } catch {
        void load("");
      }
    },
    [client, load],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    try {
      const r = await client.api<{ unread?: number }>("POST", "/api/notifications/read", { all: true });
      setUnread(r.unread ?? 0);
    } catch {
      void load("");
    }
  }, [client, load]);

  const archive = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        const r = await client.api<{ unread?: number }>("POST", "/api/notifications/archive", { ids: [id] });
        setUnread(r.unread ?? 0);
      } catch {
        void load("");
      }
    },
    [client, load],
  );

  return { items, unread, loading, failed, hasMore: next !== "", live, loadMore, refresh, markRead, markAllRead, archive };
}
