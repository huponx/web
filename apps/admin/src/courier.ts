import type { AuthClient } from "@huponx/auth-client";
import { useAuth } from "@huponx/auth-client";
import type { Page } from "@huponx/ui-kit";
import { useMemo } from "react";

// The courier calls of the gateway (the notification admin). protojson: camelCase, int64 as a string, enums by name.

export type Channel = "email" | "telegram" | "in_app";

export interface TemplateInfo {
  locale: string;
  channel: Channel;
  customized?: boolean;
  version?: number;
  /** The directory when it is not the event's own: `<template>_digest`, the message that groups several events. */
  template?: string;
}

export interface EventType {
  type: string;
  category: string;
  template: string;
  channels: Channel[];
  mandatory?: boolean;
  severity?: string;
  required?: string[];
  optional?: string[];
  broadcast?: boolean;
  templates?: TemplateInfo[];
  /** How long events wait to be grouped into one message ("10m"); empty: not grouped. */
  digestWindow?: string;
}

export interface Content {
  subject?: string;
  text?: string;
  html?: string;
}

export interface TemplateDoc {
  content?: Content;
  customized?: boolean;
  version?: number;
  updatedBy?: string;
  /** Unix seconds (int64: a string). */
  updatedAt?: string;
}

export interface TemplateVersion {
  version: number;
  content?: Content;
  updatedBy?: string;
  updatedAt?: string;
  reverted?: boolean;
}

export interface Audience {
  all?: boolean;
  role?: string;
  userIds?: string[];
}

export interface Broadcast {
  id: string;
  eventType: string;
  audience?: Audience;
  createdBy?: string;
  createdAt?: string;
  recipients?: number;
  skipped?: number;
  /** The channels it was sent on; empty: every channel of the type. */
  channels?: string[];
}

export type DeliveryStatus = "DELIVERY_STATUS_PENDING" | "DELIVERY_STATUS_SENT" | "DELIVERY_STATUS_FAILED" | "DELIVERY_STATUS_DEAD" | "DELIVERY_STATUS_SKIPPED";

export interface DeliveryRecord {
  delivery: { id: string; channel: string; address: string; status: DeliveryStatus; attempts?: number; lastError?: string; nextAttemptAt?: string; sentAt?: string };
  notificationId: string;
  eventType: string;
  userId?: string;
  createdAt?: string;
  /** How many other events went out in the same message (a digest). */
  merged?: number;
}

export interface DeliveryFilter {
  status?: string;
  channel?: string;
  address?: string;
  userId?: string;
  notificationId?: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  kind: "slack" | "generic";
  events: string[];
  enabled?: boolean;
  hasSecret?: boolean;
}

const PAGE = 50;

export function courierApi(c: AuthClient) {
  const e = encodeURIComponent;
  const tpl = (t: string, l: string, ch: string) => `/api/courier/templates/${e(t)}/${e(l)}/${e(ch)}`;
  return {
    eventTypes: () => c.api<{ eventTypes?: EventType[]; locales?: string[] }>("GET", "/api/courier/event-types").then((r) => ({ eventTypes: r.eventTypes ?? [], locales: r.locales ?? [] })),
    getTemplate: (t: string, l: string, ch: string) => c.api<TemplateDoc>("GET", tpl(t, l, ch)),
    saveTemplate: (t: string, l: string, ch: string, content: Content) => c.api<{ version?: number }>("PUT", tpl(t, l, ch), { content }),
    revertTemplate: (t: string, l: string, ch: string) => c.api<unknown>("DELETE", tpl(t, l, ch)),
    previewTemplate: (t: string, l: string, ch: string, content: Content) =>
      c.api<{ rendered?: Content }>("POST", `${tpl(t, l, ch)}/preview`, { content }).then((r) => r.rendered ?? {}),
    versions: (t: string, l: string, ch: string) => c.api<{ versions?: TemplateVersion[] }>("GET", `${tpl(t, l, ch)}/versions`).then((r) => r.versions ?? []),

    createBroadcast: (eventType: string, audience: Audience, data: Record<string, string>, channels: string[] = []) =>
      c.api<{ broadcast?: Broadcast }>("POST", "/api/courier/broadcasts", { eventType, audience, data, channels }).then((r) => r.broadcast),
    broadcasts: (token = ""): Promise<Page<Broadcast>> =>
      c.api<{ broadcasts?: Broadcast[]; nextPageToken?: string }>("GET", `/api/courier/broadcasts?${new URLSearchParams({ pageSize: "20", ...(token ? { pageToken: token } : {}) })}`).then((r) => ({
        items: r.broadcasts ?? [],
        next: r.nextPageToken ?? "",
      })),

    deliveries: (f: DeliveryFilter, token = ""): Promise<Page<DeliveryRecord>> => {
      const q = new URLSearchParams({ pageSize: String(PAGE) });
      for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
      if (token) q.set("pageToken", token);
      return c.api<{ deliveries?: DeliveryRecord[]; nextPageToken?: string }>("GET", `/api/courier/deliveries?${q}`).then((r) => ({ items: r.deliveries ?? [], next: r.nextPageToken ?? "" }));
    },
    webhooks: () => c.api<{ webhooks?: Webhook[] }>("GET", "/api/courier/webhooks").then((r) => r.webhooks ?? []),
    /** Creates a webhook (no id) or changes one; `secret` is set only when one was made now. */
    saveWebhook: (w: Omit<Webhook, "id" | "hasSecret"> & { id?: string }, rotateSecret = false) =>
      c
        .api<{ webhook?: Webhook; secret?: string }>(w.id ? "PUT" : "POST", w.id ? `/api/courier/webhooks/${e(w.id)}` : "/api/courier/webhooks", {
          webhook: { name: w.name, url: w.url, kind: w.kind, events: w.events, enabled: w.enabled === true },
          rotateSecret,
        })
        .then((r) => ({ webhook: r.webhook, secret: r.secret ?? "" })),
    deleteWebhook: (id: string) => c.api<unknown>("DELETE", `/api/courier/webhooks/${e(id)}`),
    testWebhook: (id: string) => c.api<{ ok?: boolean; result?: string }>("POST", `/api/courier/webhooks/${e(id)}/test`, {}),
    retryDelivery: (id: string) => c.api<unknown>("POST", `/api/courier/deliveries/${e(id)}/retry`, {}),
  };
}

export type CourierApi = ReturnType<typeof courierApi>;

export function useCourier(): CourierApi {
  const { client } = useAuth();
  return useMemo(() => courierApi(client), [client]);
}

/** A time of the API (Unix seconds as a string or a number) for a person; empty when unset. */
export function when(seconds: string | number | undefined, language: string): string {
  const n = Number(seconds ?? 0);
  return n > 0 ? new Date(n * 1000).toLocaleString(language) : "";
}
