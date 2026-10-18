import { resolve } from "node:path";
import { defineConfig } from "./toolchain";

if (
  process.argv.some((arg) => /^(--workers(=|$)|-j)/.test(arg)) ||
  process.env.PW_TEST_WORKERS ||
  process.env.PWDEBUG
)
  throw new Error("Actual application browser checks permit one worker only");
const evidence = process.env.WORKSPACE_EVIDENCE_ROOT;
const origin = process.env.WORKSPACE_FRONTEND_ORIGIN;
if (
  !evidence ||
  !origin ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
  !process.env.PLAYWRIGHT_BROWSERS_PATH
)
  throw new Error(
    "Explicit owned evidence, loopback frontend and browser cache required",
  );

export default defineConfig({
  testDir: import.meta.dirname,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 30000 },
  reporter: [
    ["line"],
    ["json", { outputFile: resolve(evidence, "browser-results.json") }],
  ],
  outputDir: resolve(evidence, "browser-output"),
  use: {
    baseURL: origin,
    headless: true,
    viewport: { width: 1600, height: 1000 },
    trace: "off",
    screenshot: "off",
    video: "off",
    serviceWorkers: "block",
    navigationTimeout: 120000,
    actionTimeout: 30000,
  },
});
