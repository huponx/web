import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Correct-Horse-Battery-9";
const suffix = Date.now().toString(36);
const roleName = `e2e-${suffix}`;
const plainEmail = `plain-${suffix}@example.com`;
const plainPassword = "Plain-User-Passw0rd-1";

/** The login form of identity (another origin than the app and the gateway). */
async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test.describe.serial("identity admin", () => {
  test("an admin signs in, creates a role, finds it in the list and signs out", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Roles" })).toBeVisible();

    await page.getByRole("link", { name: "Roles" }).click();
    await page.getByLabel("Name").fill(roleName);
    await page.getByLabel("Description").fill("created by the e2e test");
    await page.getByLabel("Permissions").fill("identity:role:read identity:user:read");
    await page.getByRole("button", { name: "Create role" }).click();
    await expect(page.getByText(`Role ${roleName} created.`)).toBeVisible();

    // the list shows it with its permissions
    const row = page.getByRole("row", { name: new RegExp(roleName) });
    await expect(row).toBeVisible();
    await expect(row.getByText("identity:role:read")).toBeVisible();

    // edit the permissions
    await row.getByRole("button", { name: "Edit permissions" }).click();
    await page.getByLabel("Permissions", { exact: true }).last().fill("identity:role:read");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText("identity:user:read")).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    // back at the app, which asks to sign in again
    await expect(page.getByLabel("E-mail")).toBeVisible();
  });

  test("an admin creates a user without roles and finds it with a search", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await page.getByRole("link", { name: "Users" }).click();

    await page.getByLabel("Email", { exact: true }).last().fill(plainEmail);
    await page.getByLabel("Password", { exact: true }).fill(plainPassword);
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText(`User ${plainEmail} created.`)).toBeVisible();

    await page.getByLabel("Search by email").fill(`plain-${suffix}`);
    await page.getByRole("button", { name: "Search" }).click();
    const row = page.getByRole("row", { name: new RegExp(plainEmail) });
    await expect(row).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(2); // header + the user

    // roles, account and MFA of the user
    await row.getByRole("button", { name: `Manage ${plainEmail}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Assign role").fill(roleName);
    await dialog.getByRole("button", { name: "Assign" }).click();
    await expect(dialog.getByText(roleName)).toBeVisible();
    await dialog.getByRole("button", { name: `Revoke ${roleName}` }).click();
    await expect(dialog.getByRole("button", { name: `Revoke ${roleName}` })).toHaveCount(0);
    await expect(dialog.getByTestId("mfa-state")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Sign out" }).click();
  });

  test("a user without permissions sees no menu entries and the gateway answers 403", async ({ page }) => {
    await signIn(page, plainEmail, plainPassword);
    const menu = page.getByRole("navigation", { name: "Main" });
    await expect(menu.getByRole("link", { name: "Home" })).toBeVisible();
    for (const name of ["Users", "Roles", "Clients", "Exchange policies"]) {
      await expect(menu.getByRole("link", { name })).toHaveCount(0);
    }

    // typed in the address bar: the app refuses the page
    await page.goto("/roles");
    await expect(page.getByText("You are not allowed to see this page.")).toBeVisible();

    // and the gateway refuses the call itself (it does not trust the menu)
    const status = await page.evaluate(async () => {
      const base = (window as unknown as { __env__: { API_BASE: string } }).__env__.API_BASE;
      const r = await fetch(`${base}/api/roles`, { credentials: "include" });
      return r.status;
    });
    expect(status).toBe(403);
  });
});

test("the same browser signs in again after signing out", async ({ page }) => {
  await signIn(page, adminEmail, adminPassword);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await signIn2(page, adminEmail, adminPassword);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

/** Fills the identity login form that is already on screen. */
async function signIn2(page: Page, email: string, password: string) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
