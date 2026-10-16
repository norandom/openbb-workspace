import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  preview: { host: "127.0.0.1", port: 4293, strictPort: true },
  build: {
    target: "esnext",
    outDir: "../../../dist-chart-compatibility",
    emptyOutDir: true,
    rolldownOptions: { input: resolve(import.meta.dirname, "fixture.html") },
  },
});
