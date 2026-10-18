import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { Mode, plugin as markdown } from "vite-plugin-markdown";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

const root = resolve(import.meta.dirname, "../../..");
const backend = process.env.WORKSPACE_BACKEND_ORIGIN;
if (!backend || !/^http:\/\/127\.0\.0\.1:\d+$/.test(backend))
  throw new Error("Explicit disposable loopback backend required");

// The default application config calls loadEnv. Keep the real entry point and
// plugins, but take configuration only from the disposable backend's config.js.
export default defineConfig({
  root,
  envDir: false,
  envPrefix: "__QOPENBB_NO_BROWSER_ENV__",
  cacheDir: process.env.WORKSPACE_VITE_CACHE || "node_modules/.vite-live-chart",
  define: { __LOCKED_CONFIG__: JSON.stringify({}) },
  resolve: {
    alias: [
      {
        find: /^.*\/TVChartContainer\/TVChartContainerFunc$/,
        replacement: resolve(
          root,
          "src/components/Widgets/TVChartContainer/TVChartUnavailable.tsx",
        ),
      },
      { find: "~", replacement: resolve(root, "src") },
    ],
  },
  worker: { format: "es" },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WORKSPACE_FRONTEND_PORT || "4397"),
    strictPort: true,
    proxy: { "/api": backend, "/config.js": backend },
  },
  plugins: [
    react(),
    markdown({ mode: [Mode.MARKDOWN, Mode.REACT] }),
    VitePWA({
      devOptions: { enabled: false },
      selfDestroying: true,
      registerType: "autoUpdate",
    }),
    viteStaticCopy({
      targets: [
        {
          src: ["./src/lib/widgets.json", "./src/lib/sources.json"],
          dest: "assets/data",
        },
        {
          src: "./node_modules/vscode-oniguruma/release/onig.wasm",
          dest: "assets/wasm",
        },
      ],
    }),
  ],
});
