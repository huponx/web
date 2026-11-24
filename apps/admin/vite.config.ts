import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // react-remove-scroll-bar injects a <style> that the CSP (style-src 'self') blocks, see the file
      {
        find: /^react-remove-scroll-bar$/,
        replacement: fileURLToPath(new URL("../../packages/ui-kit/src/csp/remove-scroll-bar.tsx", import.meta.url)),
      },
    ],
  },
  // localhost:3002 is a GATEKEEPER_UI_ORIGINS entry of the local gateway
  server: { port: 3002, strictPort: true },
  preview: { port: 3002, strictPort: true },
  build: {
    sourcemap: true,
    // a font is never inlined as a data: URI (the CSP is font-src 'self'): it is a file of the app
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  test: { environment: "jsdom", globals: true, css: false, setupFiles: ["./src/test-setup.ts"] },
});
