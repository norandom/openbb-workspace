import type { Locator, Page } from "@playwright/test";
import { drawnText, resetDrawnText } from "./diagnostics";
import { expect } from "./fixtures";

export async function chartMenu(page: Page, widget: Locator, name: string) {
  await widget.locator("button:has(svg#list-unordered)").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

export async function openEditor(page: Page, widget: Locator) {
  await chartMenu(page, widget, "Chart settings");
  const editor = widget.getByRole("complementary", { name: "Chart editor" });
  await expect(editor).toBeVisible();
  return editor;
}

export async function expand(editor: Locator, name: string) {
  const heading = editor.getByRole("button", { name, exact: true });
  if ((await heading.getAttribute("aria-expanded")) !== "true") await heading.click();
}

export async function setChartTitle(page: Page, editor: Locator, value: string) {
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Titles");
  const title = editor.getByRole("group", { name: "Chart Title", exact: true });
  const toggle = title.getByRole("switch", { name: "Chart Title", exact: true });
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await resetDrawnText(page);
  await title.getByRole("textbox", { name: "Title", exact: true }).fill(value);
  await expect.poll(() => drawnText(page)).toContain(value);
}

export async function selectFamily(editor: Locator, name: string) {
  await editor.getByRole("tab", { name: "Chart", exact: true }).click();
  const choice = editor.getByRole("button", {
    name: new RegExp(`^${name}(?:\\. Selected)?$`),
  });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
}

export async function saveDashboard(page: Page) {
  const response = page.waitForResponse(
    (item) =>
      item.request().method() === "POST" &&
      new URL(item.url()).pathname.endsWith("/pro/dash/sync"),
  );
  await page.keyboard.press("Control+Shift+S");
  const saved = await response;
  expect(saved.ok()).toBeTruthy();
  return saved.request().postDataJSON();
}

export async function saveAfterFailure(page: Page, editor: Locator) {
  let injected = 0;
  const path = "**/pro/dash/sync";
  await page.route(path, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    injected += 1;
    return route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic save failure"}' });
  });
  try {
    await setChartTitle(page, editor, "Saved ordinary observations");
    const failed = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/pro/dash/sync") && response.status() === 500,
    );
    await page.keyboard.press("Control+Shift+S");
    await failed;
    await expect(editor.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Saved ordinary observations");
  } finally {
    await page.unroute(path);
  }
  const payload = await saveDashboard(page);
  return { payload, injected };
}
