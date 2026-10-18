import { createRequire } from "node:module";
import { resolve } from "node:path";

// Use the repository verification toolchain rather than this fork's older
// browser revision. The caller supplies the same package used by the CLI.
const packagePath = process.env.QOPENBB_PLAYWRIGHT_PACKAGE;
if (!packagePath) throw new Error("Explicit repository Playwright package required");
const require = createRequire(import.meta.url);
if (require(resolve(packagePath, "package.json")).version !== "1.64.0")
  throw new Error("Actual application checks require pinned Playwright 1.64.0");
const playwright = require(
  resolve(packagePath, "index.js"),
) as typeof import("@playwright/test");
export const { defineConfig, test, expect } = playwright;
