/** Where the paths of the audio files of Cambridge Dictionary ("/media/english/...") live. */
export const CAMBRIDGE_ORIGIN = "https://dictionary.cambridge.org";

/**
 * The address a user typed or pasted in an audio field. It may be a plain URL, the <source> (or <audio>) tag of a
 * dictionary page, or just its src; a src of "/media/english/..." is a file of Cambridge Dictionary and becomes a
 * full URL. Anything else is returned trimmed and unchanged (the editor rejects it when it is not https).
 */
export function normalizeAudioInput(raw: string): string {
  let s = raw.trim();
  if (/^dictaud:/.test(s)) return s; // an uploaded file: the reference stays as it is
  if (s.includes("<")) {
    const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(s);
    if (!m) return s;
    s = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  }
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/^\/media\/english\//i.test(s)) return CAMBRIDGE_ORIGIN + s;
  return s;
}

/** How long a probe waits for the browser to say whether a file loads. */
export const PROBE_TIMEOUT_MS = 8000;

/**
 * Asks the browser whether the file at the address loads as audio: true it does, false it does not (not found, not
 * audio, refused), "unknown" nothing was heard in time. A media element is not held back by CORS, so this works for
 * any host; it reads the headers of the file, not all of it.
 */
export function probeAudio(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean | "unknown"> {
  if (typeof Audio === "undefined") return Promise.resolve("unknown");
  return new Promise((resolve) => {
    const a = new Audio();
    let done = false;
    const finish = (r: boolean | "unknown") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.removeAttribute("src");
      a.load();
      resolve(r);
    };
    const timer = setTimeout(() => finish("unknown"), timeoutMs);
    a.preload = "metadata";
    a.addEventListener("loadedmetadata", () => finish(true), { once: true });
    a.addEventListener("error", () => finish(false), { once: true });
    a.src = url;
  });
}
