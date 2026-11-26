import { useEffect, useRef } from "react";

/** The drawer exists below this width (the `md` breakpoint of Tailwind). */
const MOBILE_MAX = 768;
/**
 * A swipe to open starts between these distances from the left edge (px). The first pixels belong to
 * the browser: iOS Safari turns a swipe that starts there into "back", so the zone begins after them.
 */
const EDGE_MIN = 24;
const EDGE_MAX = 120;
/** Distance that counts as a swipe (px). */
const DISTANCE = 56;

/** True when the touch began inside something that scrolls sideways (a row of chips, a wide table): that swipe is its own. */
function inSideScroller(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/** True when the touch began in a modal dialog or on a slider: dragging there (a crop, a zoom bar) is not a swipe of the drawer. */
function inOwnDrag(target: EventTarget | null, drawerOpen: boolean): boolean {
  // the open drawer is itself a dialog, and a swipe in it must still close it
  const selector = drawerOpen ? 'input[type="range"]' : '[role="dialog"], [role="alertdialog"], input[type="range"]';
  return target instanceof Element && target.closest(selector) !== null;
}

/**
 * Swipe gestures of the mobile drawer: from the left edge to the right opens it, to the left closes it.
 * The touches are watched on the whole document (the drawer is in a portal); only a swipe to the right
 * that began in the edge zone is cancelled, so the scrolling of the page is never blocked. A mostly vertical move is a scroll, not a swipe,
 * and neither is a swipe that began inside an element that scrolls sideways, in a dialog or on a slider.
 */
export function useSwipeDrawer(open: boolean, setOpen: (open: boolean) => void) {
  const state = useRef({ open, setOpen });
  state.current = { open, setOpen };

  useEffect(() => {
    let start: { x: number; y: number; edge: boolean } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length !== 1 || window.innerWidth >= MOBILE_MAX || inOwnDrag(e.target, state.current.open) || inSideScroller(e.target)) {
        start = null;
        return;
      }
      start = { x: t.clientX, y: t.clientY, edge: t.clientX >= EDGE_MIN && t.clientX <= EDGE_MAX };
    };
    // a swipe to the right that began in the edge zone is ours: keep the browser from also scrolling
    // sideways or going back (preventDefault needs a non-passive listener and works while it is cancelable)
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const s = start;
      if (!s || !t || !s.edge || state.current.open || !e.cancelable) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (dx > 8 && dx > Math.abs(dy) * 1.5) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const s = start;
      start = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const { open: isOpen, setOpen: set } = state.current;
      if (!isOpen && dx > 0 && s.edge) set(true);
      else if (isOpen && dx < 0) set(false);
    };
    const cancel = () => {
      start = null;
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", cancel);
    };
  }, []);
}
