import { readFileSync } from "node:fs";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { expect, loginDisposableWorkspace, test } from "./fixtures";

test("packaged image exposes a usable authenticated Workspace shell", async ({ page }, testInfo) => {
  const privatePath = process.env.WORKSPACE_RUNTIME_PRIVATE;
  if (!privatePath) throw new Error("Disposable runtime private descriptor required");
  const runtime = JSON.parse(readFileSync(privatePath, "utf8"));
  expect(runtime.packaged_image_only).toBe(true);
  expect(runtime.source_overlay).toBeNull();
  expect(runtime.release_image_verified).toBe(false);
  expect(runtime.image).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(runtime.origin).toBe(process.env.WORKSPACE_FRONTEND_ORIGIN);
  expect(runtime.public_origin).toBe(runtime.origin);
  expect(runtime.full_config_ready).toBe(true);
  expect(runtime.api_login_ready).toBe(true);

  const diagnostics = await observeApplication(page);
  const developmentAssets: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/(?:@vite|@react-refresh|src\/)/.test(path)) developmentAssets.push(path);
  });
  await loginDisposableWorkspace(page);
  await expect(page.locator("#tabs")).toBeVisible();
  await expect(page).toHaveURL((url) => url.origin === runtime.origin && /^\/app(?:\/|$)/.test(url.pathname));
  expect(await page.locator('script[src*="/@vite/"], script[src*="/@react-refresh"]').count()).toBe(0);
  expect(developmentAssets).toEqual([]);
  expectApplicationDiagnostics(diagnostics);
  await page.screenshot({ path: testInfo.outputPath("packaged-workspace-shell.png"), fullPage: true });
});
