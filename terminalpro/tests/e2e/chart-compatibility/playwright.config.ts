import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

if (
  process.argv.some((value) => /^(--workers(=|$)|-j)/.test(value)) ||
  process.env.PW_TEST_WORKERS || process.env.PWDEBUG
) throw new Error("Chart fixture permits one worker only");
const evidence = process.env.CHART_EVIDENCE_ROOT;
if (!evidence || !process.env.PLAYWRIGHT_BROWSERS_PATH)
  throw new Error("Explicit chart evidence root and browser cache required");

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "smoke.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [["line"], ["json", { outputFile: resolve(evidence, "browser-results.json") }]],
  outputDir: resolve(evidence, "browser-output"),
  use: {
    baseURL: "http://127.0.0.1:4293",
    headless: true,
    trace: "off", screenshot: "off", video: "off",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --config tests/e2e/chart-compatibility/vite.config.ts",
    cwd: resolve(import.meta.dirname, "../../.."),
    url: "http://127.0.0.1:4293/fixture.html",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
