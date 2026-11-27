import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PERMISSIONS, isPermission } from "@huponx/auth-client";
import { parseApps, visibleApps } from "./apps";

// `perm` of an entry of APPS is a permission name typed by hand in config.js and in the portal.yaml of every environment.
// The names are declared in the permissions.proto files; a name that is not in that list shows the card to nobody.

// vitest runs in the folder of the package (web/apps/portal)
const root = process.cwd();

function permsOf(raw: string): string[] {
  const apps = JSON.parse(raw) as { perm?: string }[];
  return apps.flatMap((a) => (a.perm ? [a.perm] : []));
}

describe("APPS permissions", () => {
  it("public/config.js uses declared permissions", () => {
    const src = readFileSync(join(root, "public/config.js"), "utf8");
    const win: { __env__?: { APPS?: string } } = {};
    new Function("window", src)(win);
    const perms = permsOf(win.__env__?.APPS ?? "[]");
    expect(perms.length).toBeGreaterThan(0);
    for (const p of perms) expect(PERMISSIONS, `${p} in public/config.js`).toContain(p);
  });

  // mm-deploy is another repository: this runs where the workspace has it beside web, and is skipped in the CI of web.
  const deploy = join(root, "../../../mm-deploy/applications");
  it.skipIf(!existsSync(deploy))("mm-deploy/applications/*/portal.yaml uses declared permissions", () => {
    let files = 0;
    for (const env of readdirSync(deploy)) {
      const file = join(deploy, env, "portal.yaml");
      if (!existsSync(file)) continue;
      const yaml = readFileSync(file, "utf8");
      const m = /APPS:\s*\|-?\s*\n\s*(\[.*\])\s*$/m.exec(yaml);
      expect(m, `APPS in ${env}/portal.yaml`).not.toBeNull();
      for (const p of permsOf(m![1]!)) expect(PERMISSIONS, `${p} in ${env}/portal.yaml`).toContain(p);
      files++;
    }
    expect(files).toBeGreaterThan(0);
  });

  it("a card with a permission nobody declared is shown to nobody, even to an admin with *", () => {
    const apps = parseApps(JSON.stringify([{ name: "X", url: "https://x.example.com", perm: "dictionary:word:reed" }]), false);
    const can = (perm: string) => isPermission(perm) && ["*"].some((g) => g === "*");
    expect(visibleApps(apps, can)).toEqual([]);
  });

  it("the declared names are what the apps use", () => {
    expect(isPermission("dictionary:word:read")).toBe(true);
    expect(isPermission("bill:invoice:read")).toBe(true);
    expect(isPermission("identity:permission:write")).toBe(false);
  });
});
