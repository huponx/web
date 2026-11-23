// Client side resize of a profile picture: the file the user picks can be several MB, the server
// accepts at most 64 KiB, and a small picture is all an avatar needs.

/** Edge of the stored square, in pixels. */
export const AVATAR_SIDE = 256;
/** Largest file the user may pick (it is decoded in the browser, then thrown away). */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
/** The target size of the result; the quality is lowered until the picture fits. */
export const TARGET_BYTES = 40 * 1024;

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface ResizedImage {
  /** Base64 of the encoded bytes, as the API wants it. */
  base64: string;
  mime: string;
  /** For the preview. */
  dataUrl: string;
  bytes: number;
}

/** The centered square of a width x height picture: where it starts and how long its side is. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/** Splits "data:<mime>;base64,<data>". */
export function splitDataUrl(url: string): { mime: string; base64: string } {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  const mime = m?.[1];
  const base64 = m?.[2];
  if (mime === undefined || base64 === undefined) throw new Error("not a base64 data URL");
  return { mime, base64 };
}

export class ImageError extends Error {
  constructor(readonly code: "type" | "size" | "decode" | "encode") {
    super(code);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Crops the picture to a centered square, scales it to AVATAR_SIDE and encodes it as WebP (JPEG where
 * the browser cannot encode WebP), lowering the quality until it is below TARGET_BYTES.
 */
export async function resizeAvatar(file: File): Promise<ResizedImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new ImageError("type");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("size");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("decode");
  }
  const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
  const out = Math.min(AVATAR_SIDE, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("encode");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();

  let best: Blob | null = null;
  for (const type of ["image/webp", "image/jpeg"]) {
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await toBlob(canvas, type, q);
      if (!blob || blob.type !== type) break; // the browser cannot encode this type
      best = blob;
      if (blob.size <= TARGET_BYTES) break;
    }
    if (best) break;
  }
  if (!best) throw new ImageError("encode");
  const dataUrl = await readDataUrl(best);
  const { mime, base64 } = splitDataUrl(dataUrl);
  return { base64, mime, dataUrl, bytes: best.size };
}
