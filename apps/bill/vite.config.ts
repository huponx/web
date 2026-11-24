import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // localhost:3001 is a GATEKEEPER_UI_ORIGINS entry of the local gateway
  server: { port: 3001, strictPort: true },
  preview: { port: 3001, strictPort: true },
  build: {
    sourcemap: true,
    // a font is never inlined as a data: URI (the CSP is font-src 'self'): it is a file of the app
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  test: { environment: "jsdom", globals: true },
});
