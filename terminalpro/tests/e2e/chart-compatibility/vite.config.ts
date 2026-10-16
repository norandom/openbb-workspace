import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [react()],
  preview: { host: "127.0.0.1", port: 4293, strictPort: true },
  build: {
    target: "esnext",
    outDir: "../../../dist-chart-compatibility",
    emptyOutDir: true,
    rolldownOptions: {
      input: [
        resolve(import.meta.dirname, "fixture.html"),
        resolve(import.meta.dirname, "host.html"),
        resolve(import.meta.dirname, "cartesian.html"),
      ],
    },
  },
});
