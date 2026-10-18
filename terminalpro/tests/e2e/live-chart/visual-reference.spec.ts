import { writeFile } from "node:fs/promises";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText, drawnText } from "./diagnostics";
import { openEditor, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";

test("default line chart presents the original reference observations", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  try {
    if ((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark")) {
      const saved = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/pro/display-settings");
      await page.keyboard.press("Control+m");
      expect((await saved).ok()).toBeTruthy();
    }
    const { widget } = await importOrdinaryTable(page, {
      name: "Chart Reference Fixture",
      csv: "Period,Revenue (USD millions),Operating Income (USD millions)\n2024-Q1,100,20\n2024-Q2,,\n2024-Q3,140,30\n2024-Q4,160,40\n",
      expectedValue: "160",
    });
    const before = await widget.boundingBox();
    const handle = page.locator(".react-grid-item").filter({ has: page.locator("#chart-view-button") }).last().locator(".react-resizable-handle-se");
    const grip = await handle.boundingBox();
    if (!before || !grip) throw new Error("Owned widget resize handle missing");
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 864 - before.width, grip.y + grip.height / 2 + 411 - before.height, { steps: 12 });
    await page.mouse.up();
    await widget.locator("#chart-view-button").click();
    const editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Period" });
    await selectFamily(editor, "Line");
    await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["2024-Q1", "2024-Q3", "2024-Q4"]));
    await widget.screenshot({ path: info.outputPath("light-line-reference.png") });
    await writeFile(info.outputPath("visual-context.json"), JSON.stringify({
      viewport: page.viewportSize(), widget: await widget.boundingBox(),
      original: "artifacts/reviewed/parity/theme-matrix/light-line-stable.png",
      scope: "Same observations, light theme and Chart tab; actual grid snapping determines widget dimensions. No default style overrides.",
    }, null, 2));
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await info.attach("visual-reference-diagnostics", { body: JSON.stringify(diagnostics), contentType: "application/json" });
  }
});
