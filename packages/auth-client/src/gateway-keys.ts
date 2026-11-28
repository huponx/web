// For tests only: the keys `can()` may ask about, read from the routes.yaml of gatekeeper (a sibling repository).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** gatekeeper/routes.yaml as the workspace has it beside web, from the folder of an app (vitest runs there). */
export const GATEWAY_ROUTES = join(process.cwd(), "../../../gatekeeper/routes.yaml");

export const hasGatewayRoutes = () => existsSync(GATEWAY_ROUTES);

/** The route keys ("GET /api/users") and capability names ("bill.invoices") of a routes.yaml. */
export function gatewayKeys(file: string = GATEWAY_ROUTES): Set<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const route = /^\s*- \{http: "([A-Z]+ [^"]+)"/.exec(line);
    if (route) keys.add(route[1]!);
    const cap = /^ {2}([a-z][\w-]*(?:\.[\w-]+)+): \{/.exec(line);
    if (cap) keys.add(cap[1]!);
  }
  return keys;
}
