import { defineConfig } from "@playwright/test";

// e2e/run.sh starts identity, gatekeeper and the built admin app (vite preview) on their own ports and passes the
// address of the app in E2E_BASE_URL.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:13002", trace: "retain-on-failure", screenshot: "only-on-failure" },
  outputDir: "../test-results",
});
