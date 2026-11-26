const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

/** A size in bytes as 64 KiB, 1.5 MiB, ... (binary units, at most two decimals). */
export function formatBytes(n: number): string {
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${Number(v.toFixed(2))} ${UNITS[i]}`;
}
