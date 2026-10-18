import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect } from "./toolchain";

export { expect, test } from "./toolchain";

export async function loginDisposableWorkspace(page: Page) {
  const privatePath = process.env.WORKSPACE_RUNTIME_PRIVATE;
  if (!privatePath) throw new Error("Disposable runtime private descriptor required");
  const runtime = JSON.parse(readFileSync(privatePath, "utf8"));
  if (
    !runtime.name?.startsWith("qopenbb-browser-") ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.origin) ||
    !runtime.credentials?.email ||
    !runtime.credentials?.password
  )
    throw new Error("Expected owned disposable runtime descriptor");
  const frontend = process.env.WORKSPACE_FRONTEND_ORIGIN;
  if (!frontend || !/^http:\/\/127\.0\.0\.1:\d+$/.test(frontend))
    throw new Error("Owned frontend origin required");
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      ![frontend, runtime.origin].includes(url.origin)
    )
      return route.abort();
    return route.continue();
  });
  let stage = "open login";
  let entityReady: Promise<void> | undefined;
  const responses: string[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/pro/user-has-entity") entityReady = response.finished().then(() => undefined);
    if (path.startsWith("/api/")) responses.push(`${response.status()} ${path}`);
  });
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(runtime.credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(runtime.credentials.password);
    stage = "submit login";
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL((url) => /^\/(app|onboarding)(?:\/|$)/.test(url.pathname));
    if (new URL(page.url()).pathname === "/onboarding") {
      stage = "complete onboarding";
      await expect.poll(() => Boolean(entityReady)).toBe(true);
      await entityReady;
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.getByPlaceholder("Enter your first name").fill("Browser");
      await page.getByPlaceholder("Enter your last name").fill("Verification");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
    await expect(page).toHaveURL((url) => /^\/app(?:\/|$)/.test(url.pathname));
    await expect(page.locator("#tabs")).toBeVisible();
  } catch {
    throw new Error(`Disposable Workspace login failed at ${stage}; route=${new URL(page.url()).pathname}; API=${responses.slice(-12).join(", ")}`);
  }
}
