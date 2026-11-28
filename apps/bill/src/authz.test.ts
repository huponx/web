import { gatewayKeys, hasGatewayRoutes } from "@huponx/auth-client/src/gateway-keys";
import { ROUTES } from "./authz";

// A key that is not in gatekeeper/routes.yaml is never allowed: the UI would hide for everybody. This runs where the
// workspace has gatekeeper beside web, and is skipped in the CI of web.
describe("ROUTES", () => {
  it.skipIf(!hasGatewayRoutes())("every key is a route or a capability of gatekeeper/routes.yaml", () => {
    const keys = gatewayKeys();
    for (const [name, key] of Object.entries(ROUTES)) expect(keys, `ROUTES.${name} = ${key}`).toContain(key);
  });
});
