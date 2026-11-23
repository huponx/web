import { useEffect } from "react";

/**
 * Replacement of `react-remove-scroll-bar`, aliased by the app (see vite.config.ts).
 *
 * Radix dialogs lock the page scroll with react-remove-scroll, whose companion package injects a <style> element at
 * runtime. The CSP of the apps (`style-src 'self'`) blocks that element (a violation is logged on every dialog), so
 * this version only marks the body; `styles.css` holds the rule (`body[data-scroll-locked] { overflow: hidden }`).
 */
let locks = 0;

export function RemoveScrollBar() {
  useEffect(() => {
    locks += 1;
    document.body.setAttribute("data-scroll-locked", String(locks));
    return () => {
      locks -= 1;
      if (locks > 0) document.body.setAttribute("data-scroll-locked", String(locks));
      else document.body.removeAttribute("data-scroll-locked");
    };
  }, []);
  return null;
}
