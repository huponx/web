/** The largest audio file the card takes: the gateway body is 1 MiB and base64 adds a third (the service checks again). */
export const MAX_AUDIO_BYTES = 400 * 1024;

/** Extensions and types of the files the service takes (it checks the bytes, not these). */
export const AUDIO_ACCEPT =
  ".mp3,.ogg,.wav,.m4a,audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a";

const EXTENSION = /\.(mp3|ogg|oga|wav|m4a)$/i;
const TYPE = /^audio\/(mpeg|mp3|ogg|wav|x-wav|wave|mp4|x-m4a|m4a)$/i;

export type AudioProblem = "format" | "tooLarge";

export class AudioError extends Error {
  constructor(readonly problem: AudioProblem) {
    super(problem);
  }
}

/** An uploaded file is kept in the card as `dictaud:<uuid>` (the id UploadAudio returned). */
export const AUDIO_REF =
  /^dictaud:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isAudioRef(value: string): boolean {
  return AUDIO_REF.test(value);
}

export function audioRef(id: string): string {
  return `dictaud:${id}`;
}

export function audioId(ref: string): string {
  return ref.slice("dictaud:".length);
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Checks the kind (by type or extension) and the size of the file and reads it: {contentType, data (base64)}. */
export async function readAudio(
  file: File,
): Promise<{ contentType: string; data: string }> {
  if (!TYPE.test(file.type) && !EXTENSION.test(file.name))
    throw new AudioError("format");
  if (file.size > MAX_AUDIO_BYTES) throw new AudioError("tooLarge");
  return { contentType: file.type, data: await toBase64(file) };
}
