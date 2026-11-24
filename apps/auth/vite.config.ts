import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// identity serves the built app and its /auth-api from one origin. In development the Vite server stands in
// for it: /auth-api goes to a local identity, with the Origin header of that identity (the CSRF check of
// identity compares the Origin with its issuer).
const identity = process.env.IDENTITY_URL ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3003,
    strictPort: true,
    proxy: {
      "/auth-api": {
        target: identity,
        configure: (proxy) => {
          proxy.on("proxyReq", (req) => req.setHeader("origin", identity));
        },
      },
    },
  },
  preview: { port: 3003, strictPort: true },
  build: {
    sourcemap: true,
    // a font is never inlined as a data: URI (the CSP is font-src 'self'): it is a file of the app
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  test: { environment: "jsdom", globals: true, css: false, setupFiles: ["./src/test-setup.ts"] },
});
