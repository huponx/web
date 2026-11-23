// Applies the saved theme before the first paint, so a dark user does not see a white flash.
// An external file on purpose: the CSP of the app (script-src 'self') forbids inline scripts.
// Keep it in line with ThemeProvider of @huponx/ui-kit (same key `theme`, same `dark` class).
(function () {
  try {
    var saved = window.localStorage.getItem("theme");
    var dark = saved === "dark" || (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  } catch {
    // storage or matchMedia not available: the light theme stays
  }
})();
