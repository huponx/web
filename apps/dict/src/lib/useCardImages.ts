import { useEffect } from "react";
import type { RefObject } from "react";
import { useDictionary } from "../api";

/** Gives the images of a card shown with cardViewHtml their blob URL once the service has sent the picture. */
export function useCardImages(ref: RefObject<HTMLElement>, html: string): void {
  const api = useDictionary();
  useEffect(() => {
    let live = true;
    ref.current?.querySelectorAll<HTMLImageElement>("img[data-dictimg]").forEach((img) => {
      api
        .imageUrl(img.dataset.dictimg ?? "")
        .then((url) => {
          if (live) img.src = url;
        })
        .catch(() => img.removeAttribute("data-dictimg")); // stays a broken image (alt is empty)
    });
    return () => {
      live = false;
    };
  }, [api, ref, html]);
}
