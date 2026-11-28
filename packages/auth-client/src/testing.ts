// For tests only: stands in for the gateway, which computes `allowed` of /auth/me from the rules of the RPCs.

/** A granted permission passes a required one when equal, or when it is `*` or a prefix wildcard (`identity:*`). */
function grants(granted: string, needed: string): boolean {
  return granted === "*" || granted === needed || (granted.endsWith(":*") && needed.startsWith(granted.slice(0, -1)));
}

/** The keys of `rules` (key -> any_of) that a user holding `perms` passes. */
export function allowedFor(perms: string[], rules: Record<string, string[]>): string[] {
  return Object.keys(rules).filter((k) => rules[k]!.some((need) => perms.some((g) => grants(g, need))));
}
