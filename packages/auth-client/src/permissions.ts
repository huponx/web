// Permission matching, the same rules as `authz` in gocommon: colon separated segments, "*"
// alone grants everything, a "*" in the middle matches exactly one segment, a trailing "*" matches
// one or more segments. A required permission is concrete. This only decides what the UI shows;
// the gateway and the services enforce it again.

/** Whether the granted permission covers the required one. */
export function match(granted: string, required: string): boolean {
  if (required === "" || required.includes("*")) return false;
  if (granted === "*" || granted === required) return true;
  const gs = granted.split(":");
  const rs = required.split(":");
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    if (i === gs.length - 1 && g === "*") return rs.length > i;
    if (i >= rs.length) return false;
    if (g !== "*" && g !== rs[i]) return false;
  }
  return gs.length === rs.length;
}

/** Whether any granted permission covers the required one. An empty requirement is never allowed. */
export function allowed(granted: readonly string[] | undefined, required: string): boolean {
  return (granted ?? []).some((g) => match(g, required));
}

/** Whether every required permission is covered (false when none is required). */
export function allowedAll(granted: readonly string[] | undefined, ...required: string[]): boolean {
  return required.length > 0 && required.every((r) => allowed(granted, r));
}

/** Whether at least one of the required permissions is covered. */
export function allowedAny(granted: readonly string[] | undefined, ...required: string[]): boolean {
  return required.some((r) => allowed(granted, r));
}
