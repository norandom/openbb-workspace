import type { Locator, Page } from "@playwright/test";
import { drawnText, expectApplicationDiagnostics, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";
import { expand, openEditor } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";

async function expectTableCategories(widget: Locator, categories: string[]) {
  const cells = widget.locator('.ag-center-cols-container .ag-cell[col-id="Category"]');
  await expect(cells).toHaveCount(categories.length);
  for (const [index, category] of categories.entries()) {
    await expect(widget.locator(`.ag-center-cols-container .ag-row[row-index="${index}"] .ag-cell[col-id="Category"]`)).toHaveText(category);
  }
}

async function expectChartCategories(page: Page, categories: string[]) {
  await expect.poll(async () => (await drawnText(page))
    .filter((text) => ["A", "B", "C"].includes(text))
    .slice(-categories.length)).toEqual(categories);
}

test("ordinary table sorting and filtering determine rendered chart observations", async ({ page }, testInfo) => {
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  try {
    const { widget } = await importOrdinaryTable(page);
    const toggle = widget.locator("#chart-view-button");
    const sort = widget.locator('.ag-header-cell[col-id="Revenue"] button.truncate');
    await sort.click();
    await expect(sort).toHaveText("Revenue ↑");
    await sort.click();
    await expect(sort).toHaveText("Revenue ↓");
    await expectTableCategories(widget, ["C", "B", "A"]);

    await resetDrawnText(page);
    await toggle.click();
    await expect(widget.locator("canvas").first()).toBeVisible();
    const editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await resetDrawnText(page);
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
    await expectChartCategories(page, ["C", "B", "A"]);
    await editor.getByRole("tab", { name: "Customize", exact: true }).click();
    await expand(editor, "Series");
    const labels = editor.getByRole("region", { name: "Series", exact: true })
      .getByRole("group", { name: "Labels", exact: true })
      .getByRole("switch", { name: "Labels", exact: true });
    if ((await labels.getAttribute("aria-checked")) !== "true") await labels.click();
    await expect(labels).toHaveAttribute("aria-checked", "true");

    await toggle.click();
    await expect(widget.locator("canvas")).toHaveCount(0);
    await widget.getByRole("button", { name: "Filter Category", exact: true }).click();
    const filter = page.locator(".ag-popup .ag-filter");
    await expect(filter.locator(".ag-picker-field-display").first()).toHaveText("Contains");
    const filterValue = filter.getByRole("textbox", { name: "Filter Value", exact: true }).first();
    await filterValue.fill("B");
    await expect(filterValue).toHaveValue("B");
    await filter.getByRole("button", { name: "Apply", exact: true }).click();
    await widget.getByRole("button", { name: "Filter Category", exact: true }).click();
    await expect(filterValue).toHaveValue("B");
    await page.keyboard.press("Escape");
    await expectTableCategories(widget, ["B"]);
    await resetDrawnText(page);
    await toggle.click();
    await expect(widget.locator("canvas").first()).toBeVisible();
    await expectChartCategories(page, ["B"]);
    await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["20", "8"]));
    expect((await drawnText(page)).filter((text) => ["A", "C"].includes(text))).toEqual([]);
    await widget.screenshot({ path: testInfo.outputPath("filtered-chart-observation-b.png") });

    await toggle.click();
    await expectTableCategories(widget, ["B"]);
    await widget.getByRole("button", { name: "Clear Category filter", exact: true }).click();
    await expectTableCategories(widget, ["C", "B", "A"]);
    await resetDrawnText(page);
    await toggle.click();
    await expect(widget.locator("canvas").first()).toBeVisible();
    await expectChartCategories(page, ["C", "B", "A"]);
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await testInfo.attach("data-view-application-diagnostics", {
      body: JSON.stringify(diagnostics),
      contentType: "application/json",
    });
  }
});
