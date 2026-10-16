import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

if (
  process.argv.some((value) => /^(--workers(=|$)|-j)/.test(value)) ||
  process.env.PW_TEST_WORKERS ||
  process.env.PWDEBUG
) {
  throw new Error("Perspective browser acceptance permits one worker only");
}
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "perspective.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 20000 },
  reporter: [
    ["line"],
    [
      "json",
      {
        outputFile:
          process.env.PERSPECTIVE_REPORT ||
          "../../artifacts/task-2.8/browser-results.json",
      },
    ],
  ],
  outputDir:
    process.env.PERSPECTIVE_OUTPUT || "../../artifacts/task-2.8/browser-output",
  use: {
    baseURL: "http://127.0.0.1:4288",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js ${process.env.PERSPECTIVE_PREVIEW ? "preview" : ""} --config tests/perspective/vite.config.ts`,
    cwd: resolve(import.meta.dirname, "../.."),
    url: "http://127.0.0.1:4288/fixture.html",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
