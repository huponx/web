// Web Push of this browser: the service worker (an app serves its own /sw.js, see apps/portal/public/sw.js), the
// subscription, and what to send to courier. An app that wants the switch uses these three calls; the subscription belongs to
// the origin that registered the service worker.

/** The browser can do Web Push (not in a private window of some browsers, nor on an insecure origin). */
export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The public VAPID key as the bytes PushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** The endpoint of the subscription of this browser, or undefined. */
export async function currentEndpoint(): Promise<string | undefined> {
  if (!pushSupported()) return undefined;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription())?.endpoint;
}

export interface PushSubscriptionBody {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

/** Asks for the permission, subscribes this browser and returns what courier stores. Throws when the user refuses. */
export async function subscribeThisDevice(publicKey: string): Promise<PushSubscriptionBody> {
  if ((await Notification.requestPermission()) !== "granted") throw new Error("permission-denied");
  const reg = await registration();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent };
}

/** Unsubscribes this browser and returns the endpoint it had (to tell courier), or undefined. */
export async function unsubscribeThisDevice(): Promise<string | undefined> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return undefined;
  await sub.unsubscribe();
  return sub.endpoint;
}
