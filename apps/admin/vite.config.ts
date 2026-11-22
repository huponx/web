import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // localhost:3002 is a GATEKEEPER_UI_ORIGINS entry of the local gateway
  server: { port: 3002, strictPort: true },
  preview: { port: 3002, strictPort: true },
  build: { sourcemap: true },
  test: { environment: "jsdom", globals: true },
});
