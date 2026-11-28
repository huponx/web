// Service worker of the portal: shows the browser notifications courier sends (Web Push) and opens the page of the
// notification when it is clicked. It is registered from Settings, Notifications. Served as it is (no build step) and
// must not be cached for long: the browser checks it on every start.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Notification", {
      body: d.body || "",
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // a path is the portal's; an absolute URL is another app (the admin)
  let url = new URL("/", self.location.origin).href;
  try {
    const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (target.protocol === "https:" || target.protocol === "http:") url = target.href; // never another scheme
  } catch {
    // an unreadable URL opens the portal
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) if (w.url === url && "focus" in w) return w.focus();
      return self.clients.openWindow(url);
    }),
  );
});
