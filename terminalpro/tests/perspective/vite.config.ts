import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [react()],
  resolve: { alias: { "~": resolve(import.meta.dirname, "../../src") } },
  server: {
    host: "127.0.0.1",
    port: 4288,
    strictPort: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
  },
  preview: { host: "127.0.0.1", port: 4288, strictPort: true },
  build: {
    target: "esnext",
    outDir: "../../dist-perspective",
    emptyOutDir: true,
    rolldownOptions: { input: resolve(import.meta.dirname, "fixture.html") },
  },
  worker: { format: "es" },
});
