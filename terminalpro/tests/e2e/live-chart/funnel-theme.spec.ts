import { writeFile } from "node:fs/promises";
import { candidateIdentity } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { expect, loginDisposableWorkspace, test } from "./fixtures";

test("Funnel theme administrator public palette observation without edits", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const identity = candidateIdentity();
  const diagnostics = await observeApplication(page);
  const evidence: Record<string, unknown> = {
    identity,
    diagnostics,
    scope:
      "Read-only public Charts/Light Mode/Palette control observation. No color edits, Save Theme, Reset, API overrides or permission changes.",
    limitations:
      "This probe does not prove palette persistence, malformed-color recovery or advanced-object authoring.",
  };
  try {
    await loginDisposableWorkspace(page);
    await page.goto("/admin/theme-settings");
    evidence.route = new URL(page.url()).pathname;
    await expect(page.getByText("Theme Settings", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Charts", exact: true }).click();
    const charts = page.getByRole("tabpanel", { name: "Charts", exact: true });
    await expect(charts).toBeVisible();
    const light = charts.getByRole("tab", { name: "Light Mode", exact: true });
    await light.click();
    await expect(light).toHaveAttribute("aria-selected", "true");
    await expect(
      charts.getByRole("tab", { name: "Dark Mode", exact: true }),
    ).toBeVisible();
    const palette = charts.getByRole("button").filter({
      has: page.getByRole("heading", { name: "Palette", exact: true }),
    });
    await expect(palette).toHaveCount(1);
    if ((await palette.getAttribute("aria-expanded")) !== "true") await palette.click();
    await expect(palette).toHaveAttribute("aria-expanded", "true");
    const paletteSection = palette.locator("..");
    await expect(charts.getByText("Fill Color", { exact: true })).toBeVisible();
    await expect(charts.getByText("Stroke Color", { exact: true })).toBeVisible();
    await expect(
      charts.getByRole("button", { name: "Add palette color", exact: true }),
    ).toBeEnabled();
    const hex = paletteSection.getByRole("textbox", { name: "Hex color", exact: true });
    await expect.poll(() => hex.count()).toBeGreaterThanOrEqual(2);
    const controls = await hex.evaluateAll((elements) =>
      elements.map((element) => ({
        value: (element as HTMLInputElement).value,
        maxLength: (element as HTMLInputElement).maxLength,
        disabled: (element as HTMLInputElement).disabled,
      })),
    );
    expect(controls.length % 2, "paired fill/stroke inputs").toBe(0);
    expect(
      controls.every((control) => control.maxLength === 7 && !control.disabled),
    ).toBe(true);
    await expect(
      charts.getByRole("button", { name: "Save Theme", exact: true }),
    ).toBeEnabled();
    await expect(
      charts.getByRole("button", { name: "Reset", exact: true }),
    ).toBeEnabled();
    evidence.controls = controls;
    evidence.removeColorControls = await charts
      .getByRole("button", { name: /^Remove palette color \d+$/ })
      .allTextContents();
    evidence.charts = await charts.ariaSnapshot();
    // The Charts panel excludes account navigation and all authentication forms.
    await charts.screenshot({
      path: info.outputPath("public-chart-palette-controls.png"),
    });
    expectApplicationDiagnostics(diagnostics);
  } catch (error) {
    evidence.failure = error instanceof Error ? error.stack : String(error);
    evidence.route = new URL(page.url()).pathname;
    evidence.visibleHeadings = await page.getByRole("heading").allTextContents();
    throw error;
  } finally {
    await writeFile(
      info.outputPath("public-theme-controls.json"),
      JSON.stringify(evidence, null, 2),
    );
  }
});
