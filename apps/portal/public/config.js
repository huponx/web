// Local development default. In a cluster the chart `web-application` mounts a ConfigMap over this file.
window.__env__ = {
  API_BASE: "http://localhost:8081",
  // The applications of the home page: a JSON string, [{name, url, icon?, can?, widget?}]. `can` is the key of /auth/me `allowed` (a
  // route of the gateway, "GET /api/users", or a capability, "bill.invoices") that shows the card (without one every signed in user sees it); `icon` is a name of the portal (book-open, receipt,
  // layout-grid), not an address; `widget` (dict-review) shows a panel with numbers instead of the plain card: the CSP does not load pictures of other origins. Admin is not listed on purpose.
  APPS: JSON.stringify([
    { name: "Dict", url: "http://localhost:3000", icon: "book-open", can: "GET /api/dictionary/saved", widget: "dict-review" },
    { name: "Bill", url: "http://localhost:3001", icon: "receipt", can: "bill.invoices" },
  ]),
};
