// Applies the saved theme before the first paint, so a dark user does not see a white flash.
// An external file on purpose: the CSP of the app (script-src 'self') forbids inline scripts.
// Keep it in line with ThemeProvider and StyleProvider of @huponx/ui-kit (keys `theme` and `ui-style`, `dark` class, `data-style`, `ui-palette` and `data-palette`).
(function () {
  try {
    var saved = window.localStorage.getItem("theme");
    var dark = saved === "dark" || (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    var style = window.localStorage.getItem("ui-style");
    root.dataset.style = style === "glass" || style === "mono" ? style : "saas";
    var palette = window.localStorage.getItem("ui-palette");
    root.dataset.palette = /^(ocean|sunset|mint|rose|graphite)$/.test(palette) ? palette : "aurora";
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  } catch {
    // storage or matchMedia not available: the light theme stays
  }
})();
