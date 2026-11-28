import { allowedFor } from "@huponx/auth-client/src/testing";

// The rules (routes.yaml) behind the `can` keys of the test APPS: what the gateway checks to build `allowed` of /auth/me.
export const allowedOf = (perms: string[]) =>
  allowedFor(perms, { "GET /api/dictionary/saved": ["dictionary:word:read"], "bill.invoices": ["bill:invoice:read"] });
