/** A picture the user gave is shrunk here before it is sent (the service shrinks it again and does not trust this). */
export const MAX_SIDE = 1024;
/** The gateway takes a body of 1 MiB; base64 adds a third. */
const MAX_BASE64 = 900 * 1024;

export type ImageProblem = "format" | "tooLarge";

export class ImageError extends Error {
  constructor(readonly problem: ImageProblem) {
    super(problem);
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Scales the long side down to MAX_SIDE and encodes WebP (JPEG where the browser cannot): {contentType, data (base64)}. */
export async function downscaleImage(file: Blob): Promise<{ contentType: string; data: string }> {
  // svg is not an image the service takes (it can carry script)
  if (!file.type.startsWith("image/") || file.type.includes("svg")) throw new ImageError("format");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("format");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  let out = await encode("image/webp", 0.8);
  if (!out || out.type !== "image/webp") out = await encode("image/jpeg", 0.8); // Safari before 17 has no WebP encoder
  if (!out) throw new ImageError("format");
  const data = await toBase64(out);
  if (data.length > MAX_BASE64) throw new ImageError("tooLarge");
  return { contentType: out.type, data };
}
