import path from "node:path";
import react from "@vitejs/plugin-react";
import { loadEnv, type PluginOption } from "vite";
import { Mode, plugin as mdPlugin } from "vite-plugin-markdown";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { defineConfig } from "vitest/config";
import { runtimeConfigPlugins } from "./build/runtimeConfig.ts";

// plugin so it always forces reload because hmr breaks the dev app
const fullReloadAlways: PluginOption = {
  name: "full-reload-always",
  handleHotUpdate({ server }) {
    server.ws.send({ type: "full-reload" });
    return [];
  },
} as PluginOption;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ""); // we need to do this so we can use the env variables in the config

  const APP_NAME = env.VITE_WL_NAME;
  const APP_DESCRIPTION = env.VITE_WL_DESCRIPTION;
  const APP_SHORT_NAME = env.VITE_WL_SHORT_NAME;
  const IS_SNOWFLAKE = env.VITE_SNOWFLAKE_NATIVE_APP === "true";
  const isTradingViewEnabled = env.VITE_TRADINGVIEW_ENABLED === "true";

  const { lockedConfig, stripConfigScriptPlugin, generateRuntimeConfigPlugin } =
    runtimeConfigPlugins(env, mode, import.meta.dirname);

  return {
    define: {
      __LOCKED_CONFIG__: JSON.stringify(lockedConfig),
    },
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    // prevent vite from obscuring rust errors
    clearScreen: false,
    // tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
    },
    // to make use of `TAURI_DEBUG` and other env variables
    // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
    envPrefix: ["VITE_", "TAURI_"],
    optimizeDeps: {
      rolldownOptions: {
        resolve: {
          conditionNames: ["import", "module", "browser", "default"],
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 10000,
      rolldownOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return;
            const parts = id.split("node_modules/")[1].split("/");
            const pkg = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];

            if (pkg === "plotly.js-dist-min") return "vendor-plotly";
            if (
              pkg === "monaco-editor" ||
              pkg === "dt-sql-parser" ||
              pkg === "antlr4ng"
            )
              return "vendor-monaco";
            if (pkg.startsWith("highcharts")) return "vendor-highcharts";
            if (pkg.startsWith("@azure/") || pkg.startsWith("@okta/"))
              return "vendor-auth";
            if (pkg.startsWith("@wooorm/")) return "vendor-starry-night";
            if (
              pkg.startsWith("ag-grid") ||
              pkg.startsWith("ag-charts") ||
              pkg.startsWith("@ag-grid")
            )
              return "vendor-ag";
          },
          entryFileNames: "[name].[hash].js",
          chunkFileNames: "[name].[hash].js",
          assetFileNames: "[name].[hash].[ext]",
        },
      },
      // Tauri supports es2021
      target: "esnext",
      // don't minify for debug builds
      minify: process.env.TAURI_DEBUG ? false : "oxc",
      // produce sourcemaps for debug builds
      sourcemap: !!process.env.TAURI_DEBUG,
    },
    resolve: {
      alias: [
        ...(!isTradingViewEnabled
          ? [
              {
                find: /^.*\/TVChartContainer\/TVChartContainerFunc$/,
                replacement: path.resolve(
                  import.meta.dirname,
                  "src/components/Widgets/TVChartContainer/TVChartUnavailable.tsx",
                ),
              },
            ]
          : []),
        { find: "~", replacement: path.resolve(import.meta.dirname, "src") },
      ],
    },
    html: { cspNonce: "VITE_NONCE" },
    worker: { format: "es" },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./vitest.setup.ts",
      exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        exclude: [
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.spec.ts",
          "**/*.spec.tsx",
          "**/*config*",
          "**/charting_library/**",
          "**/public/assets/js/**",
          "**/coverage/**",
        ],
      },
      alias: [
        {
          find: /^monaco-editor$/,
          replacement: path.resolve(
            import.meta.dirname,
            "node_modules/monaco-editor/esm/vs/editor/editor.api.js",
          ),
        },
        {
          find: /^react-pdf$/,
          replacement: path.resolve(import.meta.dirname, "tests/mocks/react-pdf.tsx"),
        },
      ],
    },
    plugins: [
      react(),
      VitePWA({
        selfDestroying: true,
        registerType: "autoUpdate",
        devOptions: { enabled: false },
        workbox: {
          cacheId: "openbb-workspace",
          maximumFileSizeToCacheInBytes: 15000000, // 15mb
          cleanupOutdatedCaches: true,
          globIgnores: ["**/charting_library/**"],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkOnly",
            },
          ],
        },
        manifest: {
          // https://web.dev/articles/add-manifest
          name: APP_NAME,
          short_name: APP_SHORT_NAME,
          description: APP_DESCRIPTION,
          theme_color: "#161618",
          background_color: "#161618",
          display: "fullscreen",
          orientation: "portrait",
          start_url: "/",
          icons: IS_SNOWFLAKE
            ? [
                {
                  src: "/favicon/snowflake-favicon.png",
                  type: "image/png",
                  sizes: "300x300",
                },
                {
                  src: "/icons/android/snowflake-launchericon-192-192.png",
                  type: "image/png",
                  sizes: "192x192",
                },
                {
                  src: "/icons/android/snowflake-launchericon-512-512.png",
                  type: "image/png",
                  sizes: "512x512",
                },
              ]
            : [
                {
                  src: "/logo.svg",
                  type: "image/svg+xml",
                  sizes: "300x300",
                },
                {
                  src: "/icons/android/android-launchericon-192-192.png",
                  type: "image/png",
                  sizes: "192x192",
                },
                {
                  src: "/icons/android/android-launchericon-512-512.png",
                  type: "image/png",
                  sizes: "512x512",
                },
              ],
          screenshots: [
            {
              src: "https://openbb-cms.directus.app/assets/6573dc42-39bc-4ab4-9cd0-ff211b28ab6b.png?cache-buster=2024-10-06T16:11:21.818Z",
              sizes: "1300x848",
              type: "image/png",
              form_factor: "wide",
            },
            {
              src: "https://openbb-cms.directus.app/assets/ae22447a-7b40-4ec1-83c5-9486b0a1f55c.png?cache-buster=2024-10-06T16:11:21.818Z",
              sizes: "572x1120",
              type: "image/png",
              form_factor: "narrow",
            },
          ],
        },
      }),
      mdPlugin({ mode: [Mode.MARKDOWN, Mode.REACT] }),
      viteStaticCopy({
        targets: [
          {
            src: ["./src/lib/widgets.json", "./src/lib/sources.json"],
            dest: "assets/data",
          },
          ...(isTradingViewEnabled
            ? [
                {
                  src: "./src/lib/charting_library/**/*",
                  dest: "assets/js/charting_library",
                },
              ]
            : []),
          {
            src: "./node_modules/vscode-oniguruma/release/onig.wasm",
            dest: "assets/wasm",
          },
        ],
      }),
      fullReloadAlways,
      stripConfigScriptPlugin,
      generateRuntimeConfigPlugin,
    ],
  };
});
