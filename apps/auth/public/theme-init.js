// Applies the saved theme before the first paint, so a dark user does not see a white flash.
// An external file on purpose: the CSP of identity (script-src 'self') forbids inline scripts.
// Keep it in line with ThemeProvider of @huponx/ui-kit (same key `theme`, same `dark` class).
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
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  } catch {
    // storage or matchMedia not available: the light theme stays
  }
})();
