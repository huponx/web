const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

/** A size in bytes as 64 KiB, 12.4 MiB, ... (binary units, at most one decimal from KiB up). */
export function formatBytes(n: number): string {
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : Number(v.toFixed(1))} ${UNITS[i]}`;
}
