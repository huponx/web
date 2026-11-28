import { allowedFor } from "@huponx/auth-client/src/testing";
import { ROUTES as R } from "./authz";

// The capability's rule (routes.yaml): what the gateway checks to build `allowed` of /auth/me.
export const allowedOf = (perms: string[]) => allowedFor(perms, { [R.invoices]: ["bill:invoice:read"] });
