import { allowedFor } from "@huponx/auth-client/src/testing";
import { ROUTES as R } from "./authz";

// The `authz.v1.rule` (any_of) of the RPC behind each key: what the gateway checks to build `allowed` of /auth/me.
const RULES: Record<string, string[]> = {
  [R.listUsers]: ["identity:user:read", "identity:user:approve"],
  [R.getUser]: ["identity:user:read"],
  [R.getUserSessions]: ["identity:user:read"],
  [R.userStats]: ["identity:user:read"],
  [R.createUser]: ["identity:user:write"],
  [R.putUser]: ["identity:user:write"],
  [R.approveUser]: ["identity:user:approve"],
  [R.getUserMfa]: ["identity:mfa:read"],
  [R.putUserMfa]: ["identity:mfa:write"],
  [R.listRoles]: ["identity:role:read"],
  [R.createRole]: ["identity:role:write"],
  [R.putRole]: ["identity:role:write"],
  [R.listPermissions]: ["identity:permission:read"],
  [R.listClients]: ["identity:client:read"],
  [R.createClient]: ["identity:client:write"],
  [R.putClient]: ["identity:client:write"],
  [R.listExchange]: ["identity:exchange:read"],
  [R.putExchange]: ["identity:exchange:write"],
  [R.getRegistrationSettings]: ["identity:settings:read"],
  [R.putUiStyle]: ["identity:settings:write"],
  [R.getDictSettings]: ["dictionary:settings:read"],
  [R.putDictSettings]: ["dictionary:settings:write"],
  [R.runDictCleanup]: ["dictionary:settings:write"],
  [R.getDictCleanup]: ["dictionary:settings:read"],
  [R.courierEventTypes]: ["courier:template:read"],
  [R.getTemplate]: ["courier:template:read"],
  [R.putTemplate]: ["courier:template:write"],
  [R.listBroadcasts]: ["courier:broadcast:send"],
  [R.createBroadcast]: ["courier:broadcast:send"],
  [R.listWebhooks]: ["courier:webhook:manage"],
  [R.putWebhook]: ["courier:webhook:manage"],
  [R.listDeliveries]: ["courier:delivery:read"],
  [R.retryDelivery]: ["courier:notification:manage"],
  [R.systemStatus]: ["system:status:read"],
};

export const allowedOf = (perms: string[]) => allowedFor(perms, RULES);
