import { Loading } from "@huponx/ui-kit";
import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { CardEditorProps } from "./CardEditor";

// Tiptap is large: it is its own chunk
const load = () => import("./CardEditor");
const Editor = lazy(load);

/** Starts loading the editor chunk (once): called when the user is about to edit, so the editor opens at once. */
export const preloadCardEditor = (): void => void load();

/** Props of an element that preloads the editor when the pointer, a touch or the keyboard reaches it. */
export const preloadOn = {
  onPointerEnter: preloadCardEditor,
  onTouchStart: preloadCardEditor,
  onFocus: preloadCardEditor,
};

/** Loads the editor in the background once the browser is idle (for a user who can edit). */
export function usePreloadCardEditor(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadCardEditor);
      return () => w.cancelIdleCallback?.(id);
    }
    const id = setTimeout(preloadCardEditor, 1500);
    return () => clearTimeout(id);
  }, [enabled]);
}

/** The editor fades in where the text was; while the chunk loads (a first edit on a slow line) the place is kept. */
export function CardEditor(props: CardEditorProps) {
  const { t } = useTranslation();
  return (
    // in a dialog (stickyActions) the editor is a flex child that scrolls inside: this wrapper must pass the height on
    <div
      className={`duration-200 animate-in fade-in-0 motion-reduce:animate-none ${props.stickyActions ? "flex min-h-0 flex-1 flex-col" : ""}`}
    >
      <Suspense
        fallback={
          <div className="min-h-48">
            <Loading label={t("editor.loading")} />
          </div>
        }
      >
        <Editor {...props} />
      </Suspense>
    </div>
  );
}
