import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Correct-Horse-Battery-9";
const suffix = Date.now().toString(36);
const roleName = `e2e-${suffix}`;
const plainEmail = `plain-${suffix}@example.com`;
const plainPassword = "Plain-User-Passw0rd-1";

/** The link of the welcome mail of a user. ENV=local identity writes it to its log instead of sending it. */
function welcomeLink(email: string): string {
  const log = process.env.E2E_IDENTITY_LOG;
  if (!log) throw new Error("E2E_IDENTITY_LOG is not set (run through e2e/run.sh)");
  const lines = readFileSync(log, "utf8")
    .split("\n")
    .filter((l) => l.includes("welcome mail") && l.includes(email));
  const m = /https?:\/\/[^\s"\\]+\/password\/reset\?token=[A-Za-z0-9_%-]+/.exec(lines.at(-1) ?? "");
  if (!m) throw new Error(`no welcome link for ${email} in ${log}`);
  return m[0];
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** A width x height PNG (a gradient), bigger than the avatar so the resize has work to do. */
function png(width: number, height: number): Buffer {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * row + 1 + x * 3;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = 128;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The avatar menu is the proof of a signed in app; "Sign out" is one of its items. */
async function expectSignedIn(page: Page) {
  await expect(page.getByTestId("user-menu")).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

/** The login form of identity (another origin than the app and the gateway). */
async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expectSignedIn(page);
}

test.describe.serial("identity admin", () => {
  test("an admin signs in, creates a role, finds it in the list and signs out", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    // the header shows who signed in (name or e-mail from the ID token), never the id
    await expect(page.getByTestId("user-name")).not.toHaveText(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    await expect(page.getByTestId("user-name")).not.toBeEmpty();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Roles" })).toBeVisible();

    await page.getByRole("link", { name: "Roles" }).click();

    // the catalog (second tab): the add form is above the list; a new permission becomes a checkbox of the role page
    await page.getByRole("tab", { name: "Permissions" }).click();
    const permName = `e2e:${suffix}:read`;
    await page.getByLabel("Permission", { exact: true }).fill(permName);
    await page.getByLabel("Description", { exact: true }).first().fill("e2e permission");
    await page.getByRole("button", { name: "Add permission" }).click();
    await expect(page.getByText(`Permission ${permName} added.`)).toBeVisible();

    // roles (first tab) > Add role
    await page.getByRole("tab", { name: "Roles" }).click();
    await page.getByRole("link", { name: "Add role" }).click();
    await page.getByLabel("Name").fill(roleName);
    await page.getByLabel("Description", { exact: true }).fill("created by the e2e test");
    // the first service (e2e, by name) is open, the others are collapsed until opened
    await expect(page.getByRole("button", { name: /^e2e/ })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: /^identity/ })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: /^identity/ }).click();
    for (const p of ["identity:role:read", "identity:user:read", permName]) {
      await page.getByRole("checkbox", { name: p, exact: true }).check();
    }
    await page.getByRole("button", { name: "Create role" }).click();

    // it lands on the edit page of the new role
    await expect(page.getByText(`Role ${roleName} created.`)).toBeVisible();
    await expect(page.getByLabel("Name")).toBeDisabled();

    // edit: take two permissions away, save
    await page.getByRole("checkbox", { name: "identity:user:read", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: permName, exact: true }).uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();

    // the list shows it with its permissions and nobody holds it
    await page.getByRole("link", { name: "Cancel" }).click();
    const row = page.getByRole("row", { name: new RegExp(roleName) });
    await expect(row).toBeVisible();
    await expect(row.getByText("identity:role:read")).toBeVisible();
    await expect(row.getByText("identity:user:read")).toHaveCount(0);

    // the backend searches the roles: by name, or by a permission the role holds
    await page.getByLabel("Search", { exact: true }).fill(suffix);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(row).toBeVisible();
    await expect(page.getByRole("row", { name: /admin/ })).toHaveCount(0);
    await page.getByLabel("Search", { exact: true }).fill("no-such-role-xyz");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(row).toHaveCount(0);

    // the permission is not held any more: delete it, after the confirmation (found with a search)
    await page.getByRole("tab", { name: "Permissions" }).click();
    await page.getByLabel("Search permissions", { exact: true }).fill(suffix);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("row", { name: new RegExp(permName) })).toBeVisible();
    await expect(page.getByRole("row", { name: /identity:user:read/ })).toHaveCount(0);
    await page.getByRole("button", { name: `Delete ${permName}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`Permission ${permName} deleted.`)).toBeVisible();

    await signOut(page);
    // back at the app, which asks to sign in again
    await expect(page.getByLabel("E-mail")).toBeVisible();
  });

  test("an admin adds a user: pending until the user sets a password from the welcome mail", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
    await page.getByRole("link", { name: "Add user" }).click();

    // Home > Users > Add
    const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumb.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(crumb.getByText("Add", { exact: true })).toHaveAttribute("aria-current", "page");

    // no password field, every role is a card with a checkbox
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "admin" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: roleName })).toBeVisible();

    await page.getByLabel("Email", { exact: true }).fill(plainEmail);
    await page.getByLabel("Name", { exact: true }).fill("Plain User");
    // the picture is cropped and resized in the browser before it is saved
    await page.getByTestId("avatar-input").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: png(900, 600) });
    await expect(page.getByTestId("avatar-size")).toBeVisible();
    await page.getByRole("button", { name: "Create user" }).click();

    // the edit page: Home > Users > Edit, the user is Pending
    await expect(page.getByText(`User ${plainEmail} created.`)).toBeVisible();
    await expect(crumb.getByText("Edit", { exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("user-status")).toHaveText("Pending");
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
    await expect(page.locator('img[src^="data:image/"]').first()).toBeVisible(); // the stored picture comes back as a data URI

    // roles are checkboxes: assign, save, then take it away again
    await page.getByRole("checkbox", { name: roleName }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: roleName })).toBeChecked();
    await page.getByRole("checkbox", { name: roleName }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: roleName })).not.toBeChecked();

    // the welcome mail can be sent again while the user is Pending; the last link is the one that works
    await page.getByRole("button", { name: "Resend welcome email" }).click();
    await expect(page.getByText("Welcome email sent.")).toBeVisible();
    await expect(page.getByTestId("mfa-state")).toBeVisible();

    // found with a search, shown as Pending
    await page.getByRole("link", { name: "Users" }).first().click();
    await page.getByLabel("Email", { exact: true }).fill(`plain-${suffix}`);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const row = page.getByRole("row", { name: new RegExp(plainEmail) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Pending")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(2); // header + the user

    await signOut(page);
    await expect(page.getByLabel("E-mail")).toBeVisible();

    // the user cannot sign in yet, there is no password
    await page.getByLabel("E-mail").fill(plainEmail);
    await page.getByLabel("Password").fill(plainPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();

    // the user sets the password with the link of the welcome mail
    await page.goto(welcomeLink(plainEmail));
    await page.getByLabel(/New password/).fill(plainPassword);
    await page.getByRole("button", { name: "Set the password" }).click();
    await expect(page.getByText(/Your password was changed/)).toBeVisible();

    // now the user is Active. A new tab: the app of this one remembers that it already left for the login page
    const admin = await page.context().newPage();
    await signIn(admin, adminEmail, adminPassword);
    await admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
    await admin.getByLabel("Email", { exact: true }).fill(`plain-${suffix}`);
    await admin.getByRole("button", { name: "Search", exact: true }).click();
    await admin.getByRole("link", { name: `Manage ${plainEmail}` }).click();
    await expect(admin.getByTestId("user-status")).toHaveText("Active");
    await expect(admin.getByRole("button", { name: "Resend welcome email" })).toHaveCount(0);
    await expect(admin.getByLabel(/set a password/i)).toHaveCount(0);
    await signOut(admin);
  });

  test("a role that a user holds cannot be deleted; once taken away it can", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await page.getByRole("link", { name: "Roles & Permissions" }).click();
    // nobody holds the e2e role any more (the user test took it away), the admin role is held
    await expect(page.getByRole("button", { name: "Delete admin" })).toBeDisabled();
    await page.getByRole("button", { name: `Delete ${roleName}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`Role ${roleName} deleted.`)).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(roleName) })).toHaveCount(0);
  });

  test("an admin adds a client, edits it, rotates the secret, disables and deletes it", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await page.goto("/clients");
    await page.getByRole("link", { name: "Add client" }).click();
    await page.getByLabel("Client id").fill(`e2e-svc-${suffix}`);
    await page.getByLabel(/Resource/).fill("identity");
    await page.getByRole("button", { name: "Create client" }).click();
    const secret = page.getByTestId("client-secret");
    await expect(secret).toBeVisible();
    await expect(secret).not.toBeEmpty();
    await page.getByRole("button", { name: "I saved it" }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/e2e-svc-${suffix}$`));
    await expect(page.getByLabel("Client id")).toBeDisabled();

    // found with the search of the list, and not by a text that matches nothing
    await page.getByRole("link", { name: "Clients" }).first().click();
    await page.getByLabel("Search", { exact: true }).fill(`svc-${suffix}`);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("link", { name: `Manage client e2e-svc-${suffix}` })).toBeVisible();
    await page.getByLabel("Search", { exact: true }).fill("no-such-client-xyz");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("link", { name: `Manage client e2e-svc-${suffix}` })).toHaveCount(0);
    // the type filter: the client is confidential, so public hides it
    await page.getByLabel("Search", { exact: true }).fill(`svc-${suffix}`);
    await page.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "confidential" }).click();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("link", { name: `Manage client e2e-svc-${suffix}` })).toBeVisible();
    await page.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "public" }).click();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("link", { name: `Manage client e2e-svc-${suffix}` })).toHaveCount(0);
    await page.goto(`/clients/e2e-svc-${suffix}`);

    await page.getByLabel("Name", { exact: true }).fill("E2E service");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();

    await page.getByRole("button", { name: "Rotate secret" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Rotate secret" }).click();
    await expect(page.getByTestId("client-secret")).toBeVisible();
    await page.getByRole("button", { name: "I saved it" }).click();

    await expect(page.getByRole("button", { name: "Delete client" })).toBeDisabled();
    await page.getByRole("button", { name: "Disable client" }).click();
    await page.getByRole("button", { name: "Delete client" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(new RegExp(`Type e2e-svc-${suffix}`)).fill(`e2e-svc-${suffix}`);
    await dialog.getByRole("button", { name: "Delete client" }).click();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(page.getByText(`Client e2e-svc-${suffix} deleted.`)).toBeVisible();
    await expect(page.getByText(`e2e-svc-${suffix}`, { exact: true })).toHaveCount(0);
  });

  test("an admin adds an exchange policy, finds it with the search and the audience filter, edits and deletes it", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    const client = `e2e-ex-${suffix}`;
    const audience = `aud-${suffix}`;
    // a client for the policy
    await page.goto("/clients/new");
    await page.getByLabel("Client id").fill(client);
    await page.getByLabel(/Resource/).fill("identity");
    await page.getByRole("button", { name: "Create client" }).click();
    await page.getByRole("button", { name: "I saved it" }).click();

    await page.goto("/exchange");
    await page.getByRole("link", { name: "Add policy" }).click();
    await page.getByLabel("Client id").fill(client);
    await page.getByLabel("Audience", { exact: true }).fill(audience);
    await page.getByRole("button", { name: "openid" }).click();
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByText("Policy created.")).toBeVisible();
    await expect(page.getByLabel("Client id")).toBeDisabled();

    // edit: the depth
    await page.getByLabel("Max chain depth").fill("2");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();

    // the list: found by the text, by the audience, and hidden by a value that matches nothing
    await page.getByRole("link", { name: "Cancel" }).click();
    const row = page.getByRole("row", { name: new RegExp(client) });
    await page.getByLabel("Search", { exact: true }).fill(client);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(row).toBeVisible();
    await expect(row.getByText(audience)).toBeVisible();
    await page.getByLabel("Search", { exact: true }).fill("");
    await page.getByLabel("Audience", { exact: true }).fill(audience);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(row).toBeVisible();
    await page.getByLabel("Audience", { exact: true }).fill("no-such-audience-xyz");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(row).toHaveCount(0);

    // delete it from its page
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByLabel("Search", { exact: true }).fill(client);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("link", { name: new RegExp(`^Manage the policy of ${client}`) }).click();
    await page.getByRole("button", { name: "Delete policy" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/exchange$/);
    await expect(page.getByText("Policy deleted.")).toBeVisible();
  });

  test("the picture of the signed in admin shows in the header, also after a reload", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await expect(page.getByTestId("user-image")).toHaveCount(0); // the letter until there is a picture
    // the own profile in Settings: no permission on users needed
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByTestId("avatar-input").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png(300, 300) });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await expect(page.getByTestId("user-menu").locator("img")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("user-menu").locator("img")).toBeVisible();
    // take it away again so the other tests start from the letter
    await page.getByRole("button", { name: "Remove picture" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("user-menu").locator("img")).toHaveCount(0);
    await signOut(page);
  });

  test("the users page shows statistics and the last login of the admin who just signed in", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
    await expect(page.getByTestId("user-stats")).toBeVisible();
    await expect(page.getByTestId("stat-total")).not.toHaveText("0");
    await expect(page.getByTestId("stat-active")).not.toHaveText("0");
    await page.getByLabel("Email", { exact: true }).fill(adminEmail);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const row = page.getByRole("row", { name: new RegExp(adminEmail) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Never")).toHaveCount(0); // signing in just recorded it
    await expect(row.getByText(String(new Date().getFullYear())).first()).toBeVisible();

    // filters: the admin is active and has the admin role, and is not pending
    const filter = async (label: string, option: string) => {
      await page.getByRole("combobox", { name: label }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
      await page.getByRole("button", { name: "Search", exact: true }).click();
    };
    await filter("Status", "Pending");
    await expect(page.getByRole("row", { name: new RegExp(adminEmail) })).toHaveCount(0);
    await filter("Status", "Active");
    await expect(page.getByRole("row", { name: new RegExp(adminEmail) })).toBeVisible();
    await filter("Role", "admin");
    await expect(page.getByRole("row", { name: new RegExp(adminEmail) })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("no-such-name-xyz");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("row", { name: new RegExp(adminEmail) })).toHaveCount(0);
    await signOut(page);
  });

  test("the theme and the language switch and are remembered after a reload", async ({ page, browser }) => {
    await signIn(page, adminEmail, adminPassword);

    // one icon button; the click moves on: system -> light -> dark. The account keeps the theme between runs: start from system
    const theme = page.getByTestId("theme-switch");
    while ((await theme.getAttribute("data-theme")) !== "system") await theme.click();
    await theme.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await theme.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expectSignedIn(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByTestId("theme-switch").click(); // system
    await page.getByTestId("theme-switch").click(); // light
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: "Language" }).click();
    await page.getByRole("menuitemradio", { name: "Tiếng Việt" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
    await expect(page.getByRole("navigation", { name: "Chính" }).getByRole("link", { name: "Người dùng" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");

    // the choice was written to the account: a browser without any choice starts in Vietnamese
    const other = await browser.newContext();
    const fresh = await other.newPage();
    await signIn(fresh, adminEmail, adminPassword);
    await expect(fresh.locator("html")).toHaveAttribute("lang", "vi");
    await other.close();

    // back to English for the next tests (the choice lives in this browser context only)
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: "Ngôn ngữ" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the home page greets, counts and offers quick actions (no raw user id)", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hello");
    await expect(page.getByTestId("stat-users-value")).toHaveText(/^[1-9]\d*$/); // at least the admin
    await expect(page.getByTestId("stat-users-hint")).toHaveText(/^\+\d+ this month$/);
    await expect(page.getByTestId("stat-active-hint")).toHaveText(/^\d+% of all users$/);
    await expect(page.getByTestId("stat-roles-value")).toHaveText(/^\d+$/);
    await expect(page.getByTestId("stat-pending-value")).toHaveText(/^\d+$/);
    await expect(page.getByTestId("quick-add-user")).toHaveAttribute("href", "/users/new");
    await expect(page.getByText(/[0-9a-f]{8}-[0-9a-f]{4}-/)).toHaveCount(0);
    // no ArgoCD in this setup: the status card stays hidden
    await expect(page.getByTestId("system-status")).toHaveCount(0);
    await page.getByTestId("stat-pending").getByRole("link").click();
    await expect(page).toHaveURL(/\/users\?status=pending/);
  });

  test("the theme follows the account: a browser with nothing saved, the admin app and the sign in pages all show it", async ({ page, browser }) => {
    await signIn(page, adminEmail, adminPassword);
    const theme = page.getByTestId("theme-switch");
    const saved = () => page.waitForResponse((r) => r.url().includes("/api/me") && r.request().method() !== "GET");
    while ((await theme.getAttribute("data-theme")) !== "dark") {
      const done = saved();
      await theme.click();
      await done;
    }
    await expect(page.locator("html")).toHaveClass(/dark/);

    // another browser (nothing in localStorage): the admin app is dark after signing in ...
    const other = await browser.newContext();
    const fresh = await other.newPage();
    await signIn(fresh, adminEmail, adminPassword);
    await expect(fresh.locator("html")).toHaveClass(/dark/);
    // ... and so are the pages of identity once the user is known (the list of applications)
    await fresh.goto(`${identityUrl}/apps`);
    await expect(fresh.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(fresh.locator("html")).toHaveClass(/dark/);
    await other.close();

    // after a logout the login page shows the theme of the account too (identity left it in a cookie)
    await signOut(page);
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
    // the account keeps dark: the tests that follow set the theme they need themselves
  });

  test("the sidebar collapses to icons and keeps its state after a reload", async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");
    await page.getByTestId("sidebar-toggle").click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    // icons stay reachable by name
    await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "false");
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
  await signOut(page);
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await signIn2(page, adminEmail, adminPassword);
  await signOut(page);
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

const identityUrl = process.env.E2E_IDENTITY_URL ?? "http://localhost:18180";

test("forgot password: the page answers the same for any address and links back to sign in", async ({ page }) => {
  await page.goto(`${identityUrl}/login`);
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/password\/forgot/);
  await page.getByLabel("E-mail").fill(`nobody-${suffix}@example.com`);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByText(/If the address is registered/)).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("a reset link that is not valid says so and offers a new one", async ({ page }) => {
  await page.goto(`${identityUrl}/password/reset?token=not-a-real-token`);
  await expect(page.getByText("This link is not valid or has expired. Ask for a new one.")).toBeVisible();
  await page.getByRole("link", { name: "Ask for a new link" }).click();
  await expect(page).toHaveURL(/\/password\/forgot/);
});

test("account MFA: signed in on identity the page shows the QR code, and a wrong code is refused", async ({ page }) => {
  // without a session of identity the page sends to the login (and comes back after it)
  await page.goto(`${identityUrl}/account/mfa`);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("img", { name: "QR code" })).toBeVisible();
  await expect(page.getByText(/Or type this key:/)).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code" })).toBeVisible(); // still enrolling, nothing is on
});

test("signing in at identity without an application lists the applications, with no MFA step", async ({ page }) => {
  await page.goto(`${identityUrl}/login`);
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveAttribute("href", /localhost:13002/);
  // the icon of the app loads (the CSP lets the origin of the icon through)
  await expect.poll(() => page.locator("a img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  // MFA is optional here: no link to the MFA page for an account that does not have to use it
  await expect(page.getByRole("link", { name: "Multi-factor authentication" })).toHaveCount(0);
  await page.getByRole("link", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You have been signed out.")).toBeVisible();
});

/** Fills the identity login form that is already on screen. */
async function signIn2(page: Page, email: string, password: string) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expectSignedIn(page);
}
