import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { clampView, cropFromView, initialView, MAX_ZOOM, panView, sideAt, zoomView } from "../lib/crop";
import type { Crop, CropView } from "../lib/crop";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

/** The texts of the dialog; the kit has no i18n, the app passes them translated. */
export interface ImageCropLabels {
  title: string;
  hint: string;
  zoom: string;
  cancel: string;
  /** The button that takes the chosen region. */
  use: string;
  /** Accessible name of the X. */
  close: string;
}

interface Props {
  /** The picture to cut; the dialog is open while it is set and `open` is true. */
  file: File | undefined;
  open: boolean;
  onCancel: () => void;
  onConfirm: (crop: Crop) => void;
  labels: ImageCropLabels;
}

const FALLBACK_FRAME = 288; // px, where the layout cannot be measured (jsdom)
const KEY_STEP = 10; // frame px per arrow key
const ZOOM_STEP = 0.25;

/** Lets the user drag and zoom a square region over a picture. Confirming returns it in the pixels of the original. */
export function ImageCropDialog({ file, open, onCancel, onConfirm, labels }: Props) {
  const [url, setUrl] = useState<string>();
  const [size, setSize] = useState<{ w: number; h: number }>();
  const [view, setView] = useState<CropView>({ zoom: 1, cx: 0, cy: 0 });
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number }>();

  // the object URL lives as long as the dialog shows the picture
  useEffect(() => {
    if (!file || !open) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setSize(undefined);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(undefined);
    };
  }, [file, open]);

  function frameSize() {
    return frame.current?.getBoundingClientRect().width || FALLBACK_FRAME;
  }

  function pan(dx: number, dy: number) {
    if (size) setView((v) => panView(size.w, size.h, v, dx, dy, frameSize()));
  }

  function zoomBy(delta: number) {
    if (size) setView((v) => zoomView(size.w, size.h, v, v.zoom + delta));
  }

  function onPointerDown(ev: PointerEvent<HTMLDivElement>) {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { x: ev.clientX, y: ev.clientY };
  }

  function onPointerMove(ev: PointerEvent<HTMLDivElement>) {
    const last = drag.current;
    if (!last) return;
    drag.current = { x: ev.clientX, y: ev.clientY };
    pan(ev.clientX - last.x, ev.clientY - last.y);
  }

  function onPointerEnd(ev: PointerEvent<HTMLDivElement>) {
    drag.current = undefined;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
  }

  function onKeyDown(ev: KeyboardEvent<HTMLDivElement>) {
    // an arrow moves the picture the way it points
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[ev.key];
    if (move) pan(...move);
    else if (ev.key === "+" || ev.key === "=") zoomBy(ZOOM_STEP);
    else if (ev.key === "-") zoomBy(-ZOOM_STEP);
    else return;
    ev.preventDefault();
  }

  // the region as fractions of the frame: the picture is as wide as w/side frames and starts at -sx/side
  const style = (() => {
    if (!size) return undefined;
    const c = clampView(size.w, size.h, view);
    const side = sideAt(size.w, size.h, c.zoom);
    return { width: `${(size.w / side) * 100}%`, left: `${-((c.cx - side / 2) / side) * 100}%`, top: `${-((c.cy - side / 2) / side) * 100}%` };
  })();

  return (
    <Dialog open={open && !!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent closeLabel={labels.close} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.hint}</DialogDescription>
        </DialogHeader>
        <div
          ref={frame}
          role="group"
          tabIndex={0}
          aria-label={labels.title}
          data-testid="crop-frame"
          className="relative mx-auto aspect-square w-72 max-w-full cursor-grab touch-none overflow-hidden rounded-md bg-muted outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          {url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={style}
              onLoad={(ev) => {
                const { naturalWidth: w, naturalHeight: h } = ev.currentTarget;
                if (w > 0 && h > 0) {
                  setSize({ w, h });
                  setView(initialView(w, h));
                }
              }}
            />
          ) : null}
          {/* the dark outside the circle shows what an avatar keeps */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <span>{labels.zoom}</span>
          <input
            type="range"
            className="min-w-0 flex-1 accent-primary"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            disabled={!size}
            data-testid="crop-zoom"
            onChange={(ev) => zoomBy(Number(ev.target.value) - view.zoom)}
          />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button type="button" disabled={!size} data-testid="crop-use" onClick={() => size && onConfirm(cropFromView(size.w, size.h, view))}>
            {labels.use}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
