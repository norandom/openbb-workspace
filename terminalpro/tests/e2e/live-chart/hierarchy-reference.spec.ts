import type { Locator, Page } from "@playwright/test";
import { expectedBoxTooltipNumber } from "./box-plot-fixture";
import { observeApplication } from "./diagnostics";
import { chartMenu, saveDashboard } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import {
  amount,
  categories,
  hierarchyFamilies,
  retainedHierarchy,
} from "./hierarchy-fixture";
import { center, drawing, hover, observeHierarchy } from "./hierarchy-observer";
import { importOrdinaryTable } from "./journey";
import { capturePie, growPieWidget, setTheme } from "./pie-observer";
import { radarOriginalUpload } from "./radar-original-observer";
import { chartModel } from "./xy-observer";

const referenceSource = "38dffc33389aca0e4a87e0e88d42f7067aa220df";
async function originalAssignments(page: Page, widget: Locator) {
  await page.getByRole("tab", { name: "Set Up", exact: true }).click();
  for (const [id, fields] of [
    ["categoriesGroup", categories],
    ["seriesGroup", [amount]],
  ] as const) {
    const group = widget.locator(`#${id}`);
    const remove = group.locator(".ag-column-drop-cell-button");
    while (await remove.count()) await remove.first().click();
    for (const field of fields) {
      await group.getByRole("combobox").first().click();
      await page.getByRole("option", { name: field, exact: true }).click();
    }
  }
  await widget.getByRole("checkbox", { name: "Aggregate", exact: true }).uncheck();
}
async function originalSelection(page: Page, widget: Locator) {
  await page.getByRole("tab", { name: "Set Up", exact: true }).click();
  return {
    categories: await widget
      .locator("#categoriesGroup .ag-column-drop-cell-text")
      .allTextContents(),
    series: await widget
      .locator("#seriesGroup .ag-column-drop-cell-text")
      .allTextContents(),
    setup: await widget.locator("#categoriesGroup").ariaSnapshot(),
  };
}

for (const family of hierarchyFamilies) {
  test(`H4 original ${family} matched retained FY2025 reference`, async ({
    page,
  }, info) => {
    test.skip(
      process.env.QOPENBB_HIERARCHY_JOURNEY !== "original",
      "Explicit original journey required",
    );
    test.setTimeout(300000);
    expect(process.env.QOPENBB_REFERENCE_SOURCE).toBe(referenceSource);
    const source = retainedHierarchy();
    const diagnostics = await observeApplication(page);
    const records: unknown[] = [];
    const selections: unknown[] = [];
    await observeHierarchy(page);
    try {
      await loginDisposableWorkspace(page);
      await radarOriginalUpload(page);
      const { widget, dashboardUrl } = await importOrdinaryTable(page, {
        csv: source.csv,
        name: `AAPL FY2025 ${family}, eight reported USD revenue components`,
        expectedValue: "66\\.03 B",
      });
      await widget.locator("#chart-view-button").click();
      await growPieWidget(page, widget, info);
      await chartMenu(page, widget, "Chart settings");
      await page.getByRole("tab", { name: "Chart", exact: true }).click();
      await page.getByRole("button", { name: family, exact: true }).click();
      await originalAssignments(page, widget);
      const initial = await originalSelection(page, widget);
      selections.push({ stage: "initial-assignment", ...initial });
      expect(initial.categories).toEqual(categories);
      expect(initial.series).toEqual([amount]);
      await chartMenu(page, widget, "Chart settings");
      for (const dark of [false, true]) {
        await setTheme(page, dark);
        await chartMenu(page, widget, "Chart settings");
        selections.push({
          stage: `after-theme-${dark}`,
          ...(await originalSelection(page, widget)),
        });
        // The pinned original restores only its first category on theme changes.
        // Reapply the intended visible hierarchy before the matched capture.
        await originalAssignments(page, widget);
        const intended = await originalSelection(page, widget);
        expect(intended.categories).toEqual(categories);
        expect(intended.series).toEqual([amount]);
        selections.push({ stage: `configured-theme-${dark}`, ...intended });
        await chartMenu(page, widget, "Chart settings");
        const paint = await drawing(page, widget, false);
        for (const quarter of ["FY2025 Q1", "FY2025 Q2", "FY2025 Q3", "FY2025 Q4"])
          expect(
            paint.text.some((t) => t.text === quarter || t.text === `${quarter}…`),
            `painted original parent ${quarter}, including its observed default ellipsis`,
          ).toBe(true);
        const observed = [];
        for (const label of paint.text
          .filter((t) => /cost|gross|profit|revenue/i.test(t.text))
          .slice(-24)) {
          await hover(page, widget, center(label.bounds));
          const tip = page
            .locator(".ag-charts-tooltip")
            .filter({ visible: true })
            .last();
          if (await tip.count())
            observed.push({ target: label.text, text: await tip.innerText() });
        }
        const record = { theme: dark ? "dark" : "light", paint, observed };
        records.push(record);
        const verifiedLeaves = source.leaves.filter((leaf) =>
          observed.some(
            (hit) =>
              hit.text.toLowerCase().includes(leaf.component.toLowerCase()) &&
              (family === "Sunburst"
                ? hit.text.split(/\s+/).includes(String(leaf.usd))
                : hit.text.includes(expectedBoxTooltipNumber(leaf.usd))),
          ),
        );
        expect(
          verifiedLeaves,
          "matched original reference exposes all eight component amount leaves",
        ).toHaveLength(8);
        const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
        const model = chartModel((await saveDashboard(page)).items[id]);
        expect(model).toMatchObject({
          chartType: family.toLowerCase(),
          cellRange: {
            columns: ["Fiscal quarter", "Revenue component", "Amount (USD)"],
          },
        });
        Object.assign(record, { model });
        await capturePie(
          page,
          widget,
          info,
          `${family.toLowerCase()}-fmp-${dark ? "dark" : "light"}`,
        );
        await widget.screenshot({
          path: info.outputPath(
            `${family.toLowerCase()}-widget-${dark ? "dark" : "light"}.png`,
          ),
        });
      }
    } finally {
      await info.attach("hierarchy-original-financial-reference", {
        body: JSON.stringify({
          source: referenceSource,
          family,
          sourceHashes: source.hashes,
          records,
          selections,
          diagnostics,
          limits:
            "Appearance reference only. Original Path2D geometry and known original transport/parse faults do not establish candidate geometry, persistence, or clean candidate diagnostics.",
        }),
        contentType: "application/json",
      });
    }
  });
}
