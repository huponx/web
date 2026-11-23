// Applies the saved theme before the first paint, so a dark user does not see a white flash.
// An external file on purpose: the CSP of identity (script-src 'self') forbids inline scripts.
// Keep it in line with ThemeProvider and StyleProvider of @huponx/ui-kit (keys `theme` and `ui-style`, `dark` class, `data-style`, `ui-palette` and `data-palette`).
(function () {
  try {
    // after a logout identity leaves the theme and language of the account in a cookie ("theme.lang"): take it over once
    var m = /(?:^|; )mm_prefs=([a-z]*)\.([a-zA-Z]*)/.exec(document.cookie);
    if (m) {
      if (m[1]) window.localStorage.setItem("theme", m[1]);
      if (m[2]) window.localStorage.setItem("lang", m[2]);
      document.cookie = "mm_prefs=; Max-Age=0; Path=/";
    }
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
