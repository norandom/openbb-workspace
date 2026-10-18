import type { Page } from "@playwright/test";
import { saveDashboard } from "./editor";
import { expect } from "./fixtures";

type SavedContent = {
  data: { widgets: { widgetId: string; storage: unknown }[] };
};

const sentinel = {
  other: { retained: "legacy-model" },
  chartOptions: {
    custom: { x: 1 },
    pie: { title: { enabled: true, text: "Inactive saved pie observations" } },
  },
};

export function expectUnknownSettings(content: SavedContent) {
  const widget = content.data.widgets.find((item) => item.widgetId.startsWith("file-"));
  expect(widget).toMatchObject({
    storage: { default: { chartModel: sentinel } },
  });
}

export async function seedUnknownSettings(page: Page, dashboardUrl: string) {
  const saving = page.waitForRequest((request) =>
    request.method() === "POST" &&
    new URL(request.url()).pathname.endsWith("/pro/dash/sync"),
  );
  const payload = await saveDashboard(page);
  const request = await saving;
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const content = payload.items[id];
  const widget = content.data.widgets.find((item: { widgetId: string }) =>
    item.widgetId.startsWith("file-"),
  );
  expect(widget).toBeDefined();
  const model = widget.storage.default.chartModel;
  model.other = sentinel.other;
  model.chartOptions = {
    ...model.chartOptions,
    custom: sentinel.chartOptions.custom,
    pie: {
      ...model.chartOptions?.pie,
      title: { ...model.chartOptions?.pie?.title, ...sentinel.chartOptions.pie.title },
    },
  };
  // Reuse the authenticated application's request without persisting credentials.
  const authorization = await request.headerValue("authorization");
  const headers = authorization ? { authorization } : {};
  // Unmount first: the editor saves its original widget state on beforeunload.
  await page.goto("about:blank");
  const saved = await page.request.post(request.url(), {
    data: payload,
    headers,
  });
  expect(saved.ok()).toBeTruthy();
  const stored = await page.request.get(request.url(), { headers });
  expect(stored.ok()).toBeTruthy();
  expectUnknownSettings((await stored.json()).owned[id].content);
  const reading = page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname.endsWith("/pro/dash/validate-and-sync"),
  );
  await page.goto(dashboardUrl);
  const read = await reading;
  expect(read.ok()).toBeTruthy();
  const backend = await read.json();
  const persisted = backend.owned[id].content;
  expectUnknownSettings(persisted);
  await expect(page.locator('[class*="widget-file-"] canvas').first()).toBeVisible();
  return persisted as SavedContent;
}
