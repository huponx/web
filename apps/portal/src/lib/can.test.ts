import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gatewayKeys, hasGatewayRoutes } from "@huponx/auth-client/src/gateway-keys";
import { parseApps, visibleApps } from "./apps";

// `can` of an entry of APPS is a key of the gateway's routes.yaml (a route, or a capability), typed by hand in config.js
// and in the portal.yaml of every environment. A key the gateway does not know is allowed to nobody: the card is hidden.

// vitest runs in the folder of the package (web/apps/portal)
const root = process.cwd();

function cansOf(raw: string): string[] {
  const apps = JSON.parse(raw) as { can?: string }[];
  return apps.flatMap((a) => (a.can ? [a.can] : []));
}

// gatekeeper and mm-deploy are other repositories: these run where the workspace has them beside web, and are skipped in
// the CI of web.
const deploy = join(root, "../../../mm-deploy/applications");

describe("APPS can keys", () => {
  it.skipIf(!hasGatewayRoutes())("public/config.js uses keys of gatekeeper/routes.yaml", () => {
    const src = readFileSync(join(root, "public/config.js"), "utf8");
    const win: { __env__?: { APPS?: string } } = {};
    new Function("window", src)(win);
    const cans = cansOf(win.__env__?.APPS ?? "[]");
    expect(cans.length).toBeGreaterThan(0);
    const keys = gatewayKeys();
    for (const c of cans) expect(keys, `${c} in public/config.js`).toContain(c);
  });

  it.skipIf(!hasGatewayRoutes() || !existsSync(deploy))("mm-deploy/applications/*/portal.yaml uses keys of gatekeeper/routes.yaml", () => {
    const keys = gatewayKeys();
    let files = 0;
    for (const env of readdirSync(deploy)) {
      const file = join(deploy, env, "portal.yaml");
      if (!existsSync(file)) continue;
      const m = /APPS:\s*\|-?\s*\n\s*(\[.*\])\s*$/m.exec(readFileSync(file, "utf8"));
      expect(m, `APPS in ${env}/portal.yaml`).not.toBeNull();
      for (const c of cansOf(m![1]!)) expect(keys, `${c} in ${env}/portal.yaml`).toContain(c);
      files++;
    }
    expect(files).toBeGreaterThan(0);
  });

  it("a card with a key nobody knows is shown to nobody", () => {
    const apps = parseApps(JSON.stringify([{ name: "X", url: "https://x.example.com", can: "GET /api/nope" }]), false);
    const known = new Set(["GET /api/dictionary/saved"]);
    expect(visibleApps(apps, (k) => known.has(k))).toEqual([]);
  });
});
