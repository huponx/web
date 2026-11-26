import { useCallback } from "react";
import { useDictionary } from "../api";
import { isAudioRef } from "./audio";

/** Plays an audio value of a card: an https URL as it is, an uploaded file (`dictaud:<id>`) through its blob URL. */
export function usePlayAudio(): (value: string) => Promise<void> {
  const api = useDictionary();
  return useCallback(
    async (value: string) => {
      const src = isAudioRef(value) ? await api.audioUrl(value) : value;
      await new Audio(src).play();
    },
    [api],
  );
}
