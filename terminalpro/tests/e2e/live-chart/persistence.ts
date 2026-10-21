import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { observeApplication, observeDrawnText } from "./diagnostics";
import { expect, loginDisposableWorkspace } from "./fixtures";

export function expectSavedTitles(content: {
  data: { widgets: { widgetId: string; storage: unknown }[] };
}) {
  const widget = content.data.widgets.find((item) => item.widgetId.startsWith("file-"));
  expect(widget).toMatchObject({
    storage: {
      chartView: { enabled: true, chartType: "line" },
      default: {
        chartModel: {
          chartOptions: {
            line: { title: { enabled: true, text: "Saved ordinary observations" } },
            bar: { title: { enabled: true, text: "Stacked Column observations" } },
          },
        },
      },
    },
  });
}

export function restartDisposableBackend() {
  const python = process.env.WORKSPACE_RUNTIME_PYTHON;
  const descriptor = process.env.WORKSPACE_RUNTIME_PRIVATE;
  if (!python || !descriptor)
    throw new Error("Explicit owned runtime restart inputs required");
  const helper = resolve(
    import.meta.dirname,
    "../../../../../../tests/delivery/workspace_runtime.py",
  );
  execFileSync(python, [helper, "restart", "--private", descriptor], {
    timeout: 60000,
    windowsHide: true,
    stdio: "pipe",
  });
}

export async function reopenSavedDashboard(browser: Browser, dashboardUrl: string, initializePage?: (page: Page) => Promise<void>) {
  const context = await browser.newContext({
    baseURL: process.env.WORKSPACE_FRONTEND_ORIGIN,
    serviceWorkers: "block",
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  try {
    await initializePage?.(page);
    await loginDisposableWorkspace(page);
    const read = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith("/pro/dash/validate-and-sync"),
    );
    await page.goto(dashboardUrl);
    const response = await read;
    expect(response.ok()).toBeTruthy();
    const backend = await response.json();
    const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    const content = backend.owned[id].content;
    const widget = page
      .locator('[class*="widget-file-"]')
      .filter({
        has: page.locator("#chart-view-button"),
      })
      .last();
    await expect(widget.locator("canvas").first()).toBeVisible();
    return { context, page, widget, content, diagnostics };
  } catch (error) {
    await context.close();
    throw error;
  }
}
