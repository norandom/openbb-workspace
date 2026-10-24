import { fields, radarFinancialPaint, retainedRadarFixture } from "./radar-fixture";
import { writeFile } from "node:fs/promises";
import { chartMenu, saveDashboard } from "./editor";
import { test, expect, loginDisposableWorkspace } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { stablePie, growPieWidget, setTheme } from "./pie-observer";
import { observeApplication } from "./diagnostics";
import { chartModel } from "./xy-observer";
import { observeOriginalRadar, radarOriginalUpload } from "./radar-original-observer";

test("original Radar discriminating numerical and control contract", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  expect(process.env.QOPENBB_REFERENCE_SOURCE).toBe(
    "38dffc33389aca0e4a87e0e88d42f7067aa220df",
  );
  await observeOriginalRadar(page);
  await loginDisposableWorkspace(page);
  await radarOriginalUpload(page);
  const diagnostics = await observeApplication(page);
  const csv =
    "Category,Primary,Secondary\nC,10,5\nA,-5,10\nB,0,15\nD,,20\nA,20,25\nE,30,30\n";
  const { widget } = await importOrdinaryTable(page, {
    csv,
    name: "Radar original contract",
    expectedValue: "-5",
  });
  await widget.locator("#chart-view-button").click();
  await growPieWidget(page, widget, info);
  const records: any[] = [];
  const capture = async (name: string) => {
    await stablePie(page, widget);
    const drawing = await page.evaluate(() => (window as any).radarPaint);
    await writeFile(info.outputPath(`${name}.json`), JSON.stringify(drawing, null, 2));
    await widget.screenshot({ path: info.outputPath(`${name}.png`) });
    return drawing;
  };
  try {
    for (const family of process.env.QOPENBB_REFERENCE_AREA_ONLY === "1"
      ? ["Radar Area"]
      : ["Radar Line", "Radar Area"]) {
      await chartMenu(page, widget, "Chart settings");
      await page.getByRole("tab", { name: "Chart", exact: true }).click();
      await page.getByRole("button", { name: family, exact: true }).click();
      await page.getByRole("tab", { name: "Set Up", exact: true }).click();
      const categories = widget.locator("#categoriesGroup");
      await categories.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Category", exact: true }).click();
      await categories
        .getByRole("checkbox", { name: "Aggregate", exact: true })
        .uncheck();
      const series = widget.locator("#seriesGroup");
      const remove = series.locator(".ag-column-drop-cell-button");
      while (await remove.count()) await remove.first().click();
      for (const field of ["Primary", "Secondary"]) {
        await series.getByRole("combobox").click();
        await page.getByRole("option", { name: field, exact: true }).click();
      }
      const setup = await widget.ariaSnapshot();
      await page.getByRole("tab", { name: "Customize", exact: true }).click();
      const controls: Record<string, string> = { initial: await widget.ariaSnapshot() };
      for (const label of ["Series", "Polar Axis", "Navigator"]) {
        const heading = widget
          .getByText(label, { exact: true })
          .filter({ visible: true });
        if ((await heading.count()) === 1) {
          await heading.click();
          controls[label] = await widget.ariaSnapshot();
        }
      }
      await chartMenu(page, widget, "Chart settings");
      const drawing = await capture(family.replaceAll(" ", "-").toLowerCase());
      const id = new URL(page.url()).pathname.split("/").at(-1)!;
      const model = chartModel((await saveDashboard(page)).items[id]);
      const tooltips: any[] = [];
      const canvas = await widget.locator("canvas").first().boundingBox();
      const lineColor = family === "Radar Line" ? "#5090dc" : "#74a8e6";
      const hitPoints = drawing.paths
        .filter((p: any) => p.method === "stroke" && p.color === lineColor)
        .flatMap((p: any) => p.points)
        .slice(0, 3);
      for (const point of hitPoints) {
        await page.mouse.move(canvas!.x + point.x, canvas!.y + point.y);
        const tip = page.locator(".ag-charts-tooltip").filter({ visible: true }).last();
        await expect(tip).toBeVisible();
        if (family === "Radar Line")
          await expect
            .poll(() => tip.innerText())
            .toContain(["10", "-5", "0"][tooltips.length]);
        else
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
        tooltips.push(await tip.innerText());
      }
      await page.mouse.move(0, 0);
      await chartMenu(page, widget, "Quick actions");
      const quickActions = await page.getByRole("menu").last().ariaSnapshot();
      await page.getByRole("menuitem", { name: "Show navigator", exact: true }).click();
      const navigatorDrawing = await capture(
        family.replaceAll(" ", "-").toLowerCase() + "-navigator",
      );
      const navigatorWidget = await widget.ariaSnapshot();
      const navigatorModel = chartModel((await saveDashboard(page)).items[id]);
      await chartMenu(page, widget, "Quick actions");
      const miniAction = page.getByRole("menuitem", {
        name: "Show mini chart",
        exact: true,
      });
      const navigation: any = {
        quickActions,
        navigatorDrawing,
        navigatorWidget,
        navigatorModel,
      };
      if (await miniAction.count()) {
        await miniAction.click();
        navigation.enabledDrawing = await capture(
          family.replaceAll(" ", "-").toLowerCase() + "-mini",
        );
        navigation.widget = await widget.ariaSnapshot();
        navigation.sliderCount = await widget.getByRole("slider").count();
        navigation.toolbarCount = await widget
          .getByRole("toolbar", { name: "Navigator", exact: true })
          .count();
        navigation.model = chartModel((await saveDashboard(page)).items[id]);
        await chartMenu(page, widget, "Quick actions");
        const hide = page.getByRole("menuitem", {
          name: "Hide mini chart",
          exact: true,
        });
        if (await hide.count()) await hide.click();
        else await page.keyboard.press("Escape");
      } else await page.keyboard.press("Escape");
      await chartMenu(page, widget, "Chart settings");
      await page.getByRole("tab", { name: "Customize", exact: true }).click();
      const axis = widget
        .getByText("Polar Axis", { exact: true })
        .filter({ visible: true });
      if (
        !(await widget
          .getByRole("combobox", { name: "Orientation", exact: true })
          .count())
      )
        await axis.click();
      const thickness = widget.getByRole("spinbutton").first();
      await thickness.fill("3");
      await thickness.press("Tab");
      const thicknessModel = chartModel((await saveDashboard(page)).items[id]);
      await chartMenu(page, widget, "Chart settings");
      const thicknessDrawing = await capture(
        family.replaceAll(" ", "-").toLowerCase() + "-axis-thickness3",
      );
      records.push({
        family,
        setup,
        controls,
        model,
        drawing,
        tooltips,
        navigation,
        thicknessModel,
        thicknessDrawing,
      });
      await chartMenu(page, widget, "Chart settings");
      await widget.getByRole("spinbutton").first().fill("1");
      await widget.getByRole("spinbutton").first().press("Tab");
      await chartMenu(page, widget, "Chart settings");
      await writeFile(
        info.outputPath("observations.json"),
        JSON.stringify({ csv, records, diagnostics }, null, 2),
      );
    }
  } finally {
    await writeFile(
      info.outputPath("observations.json"),
      JSON.stringify({ csv, records, diagnostics }, null, 2),
    );
  }
});

test("original retained AAPL Radar light/dark financial comparison", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  expect(process.env.QOPENBB_REFERENCE_SOURCE).toBe(
    "38dffc33389aca0e4a87e0e88d42f7067aa220df",
  );
  const source = retainedRadarFixture();
  await observeOriginalRadar(page);
  await loginDisposableWorkspace(page);
  await radarOriginalUpload(page);
  const diagnostics = await observeApplication(page);
  const { widget } = await importOrdinaryTable(page, {
    csv: source.csv,
    name: "AAPL quarterly revenue, fiscal years, raw USD",
    expectedValue: "Q1",
  });
  await widget.locator("#chart-view-button").click();
  await growPieWidget(page, widget, info);
  const observations = [];
  try {
    for (const [family, area] of [
      ["Radar Line", false],
      ["Radar Area", true],
    ] as const) {
      await chartMenu(page, widget, "Chart settings");
      await page.getByRole("tab", { name: "Chart", exact: true }).click();
      await page.getByRole("button", { name: family, exact: true }).click();
      await page.getByRole("tab", { name: "Set Up", exact: true }).click();
      const categories = widget.locator("#categoriesGroup");
      await categories.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Quarter", exact: true }).click();
      await categories
        .getByRole("checkbox", { name: "Aggregate", exact: true })
        .uncheck();
      const series = widget.locator("#seriesGroup");
      const remove = series.locator(".ag-column-drop-cell-button");
      while (await remove.count()) await remove.first().click();
      for (const field of fields.slice(0, 3)) {
        await series.getByRole("combobox").click();
        await page.getByRole("option", { name: field, exact: true }).click();
      }
      await chartMenu(page, widget, "Chart settings");
      for (const dark of [false, true]) {
        await setTheme(page, dark);
        const paint = await radarFinancialPaint(
          page,
          widget,
          source.series.slice(0, 3),
          area,
        );
        await widget.screenshot({
          path: info.outputPath(
            `original-${area ? "radar-area" : "radar-line"}-widget-${dark ? "dark" : "light"}.png`,
          ),
        });
        observations.push({
          family,
          theme: dark ? "dark" : "light",
          matches: paint.matches,
        });
      }
    }
  } finally {
    await writeFile(
      info.outputPath("original-fmp-comparison.json"),
      JSON.stringify(
        {
          source: process.env.QOPENBB_REFERENCE_SOURCE,
          hashes: source.hashes,
          observations,
          diagnostics,
          limitations:
            "Existing mixed characterization retains stale Area-tooltip and CSV transport failures. This comparison records original diagnostics without asserting they are clean; no provider request was made.",
        },
        null,
        2,
      ),
    );
  }
});
