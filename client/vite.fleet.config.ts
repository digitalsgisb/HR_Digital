import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Builds the public company-car page into dist/fleet, served at /fleet/ with its own assets,
// so the Cloudflare bypass for /fleet/ never exposes the HR workspace bundle.
const client = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  plugins: [react()],
  root: `${client}fleet`,
  base: "/fleet/",
  publicDir: `${client}public`,
  build: { outDir: `${client}dist/fleet`, emptyOutDir: true },
  server: { fs: { allow: [client] } }
});
