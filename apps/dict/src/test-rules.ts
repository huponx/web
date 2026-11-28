import { allowedFor } from "@huponx/auth-client/src/testing";
import { ROUTES as R } from "./authz";

// The `authz.v1.rule` (any_of) of the RPC behind each key: what the gateway checks to build `allowed` of /auth/me.
const RULES: Record<string, string[]> = {
  [R.listSaved]: ["dictionary:word:read"],
  [R.saveWord]: ["dictionary:word:write"],
};

export const allowedOf = (perms: string[]) => allowedFor(perms, RULES);
