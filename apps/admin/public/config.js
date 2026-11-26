// Local development default. In a cluster the chart `web-application` mounts a ConfigMap over this file.
window.__env__ = {
  API_BASE: "http://localhost:8081",
  // The portal (root domain): the user menu links back to it; without it there is no link.
  PORTAL_URL: "http://localhost:3004",
};
