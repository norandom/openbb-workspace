import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { candidateIdentity } from "./box-plot-fixture";
import { observeApplication } from "./diagnostics";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import {
  focusPoint,
  mode,
  observePreviewTitle,
  openCharts,
  otherThemes,
  parameter,
  pointGeometry,
  pointerPoint,
  previewPaint,
  saveTheme,
  section,
  setParameter,
  titleGeometry,
} from "./theme-preview-helpers";

test("Theme Settings native preview geometry interactions and saved drafts", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  const diagnostics = [
    { phase: "initial", data: await observeApplication(page) },
  ];
  const evidence: Record<string, unknown> = {
    identity: candidateIdentity(),
    diagnostics,
    sample:
      "Synthetic Dolphin Interaction Data; no financial units or provider provenance.",
    limitations:
      "Representative preview controls only. Separate funnel-palette journey owns retained FMP paint and PNG checks.",
  };
  await observePreviewTitle(page);
  let cleanupPage: Page = page;
  let fresh: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let edited = false;
  let mayReset = false;
  let saves = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === "/api/admin/theme-settings"
    )
      saves++;
  });
  try {
    await loginDisposableWorkspace(page);
    const ui = await openCharts(page);
    evidence.initial = ui.settings;
    for (const value of ["light", "dark"] as const)
      expect(
        ui.settings[value]?.chartTheme ?? null,
        "requires disposable default chart themes",
      ).toBeNull();
    mayReset = true;
    const retainedOtherThemes = otherThemes(ui.settings);
    for (const value of ["light", "dark"] as const) {
      await mode(ui.charts, value);
      await expect(ui.preview.getByRole("switch")).toHaveCount(10);
      await expect(
        ui.preview.getByRole("button", { name: "Next legend page" }),
      ).toBeHidden();
      await expect
        .poll(async () => (await previewPaint(ui.preview, [])).background)
        .toEqual(value === "light" ? [255, 255, 255, 255] : [21, 21, 24, 255]);
      await page.screenshot({
        path: info.outputPath(`default-${value}.png`),
      });
    }
    await mode(ui.charts, "light");
    const plot = await focusPoint(
      ui.preview,
      "Peter, Number of Looks (TM), 60",
    );
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await expect(plot).toHaveAccessibleName(
      "Dolphin Interaction Data: Peter, Number of Looks (TM), 60",
    );
    await page.keyboard.press("ArrowRight");
    await focusPoint(ui.preview, "Mary, Number of Looks (TM), 57");
    await page.keyboard.press("ArrowRight");
    await focusPoint(ui.preview, "Mercutio, Number of Looks (TM), 238");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await focusPoint(ui.preview, "Ada, Number of Looks (TM), 237");
    await page.keyboard.press("ArrowLeft");
    await focusPoint(ui.preview, "Mercutio, Number of Looks (TM), 238");
    for (const [series, value] of [
      ["Number of Looks (YM)", 217],
      ["Interaction Duration (TM)", 140],
      ["Interaction Duration (YM)", 145],
    ] as const) {
      await page.keyboard.press("ArrowDown");
      await focusPoint(ui.preview, `Mercutio, ${series}, ${value}`);
    }
    const unchangedPoint = await plot.getAttribute("aria-label");
    for (const key of ["Enter", "Space", "Escape"]) {
      await page.keyboard.press(key);
      await expect(plot).toHaveAccessibleName(unchangedPoint!);
      await expect(
        ui.preview.locator("[data-chart-theme-tooltip]"),
      ).toBeVisible();
    }
    expect(saves, "plot actions must not submit the form").toBe(0);
    await page.keyboard.press("Tab");
    const first = ui.preview.getByRole("switch", {
      name: "Number of Looks (TM)",
      exact: true,
    });
    await expect(first).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      ui.charts.getByRole("button", { name: "Save Theme", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(plot).toBeFocused();

    await first.click();
    await expect(first).toHaveAttribute("aria-checked", "false");
    await plot.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowUp");
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
    await focusPoint(ui.preview, "Peter, Number of Looks (YM), 64");
    await first.click();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    const second = ui.preview.getByRole("switch", {
      name: "Number of Looks (YM)",
      exact: true,
    });
    await expect(second).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const third = ui.preview.getByRole("switch", {
      name: "Interaction Duration (TM)",
      exact: true,
    });
    await expect(third).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(third).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(third).toBeFocused();
    await expect(third).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Space");
    await expect(third).toHaveAttribute("aria-checked", "true");
    await first.dblclick();
    await expect(
      ui.preview.locator('[role="switch"][aria-checked="true"]'),
    ).toHaveCount(1);
    await first.dblclick();
    await expect(
      ui.preview.locator('[role="switch"][aria-checked="true"]'),
    ).toHaveCount(10);

    await page.setViewportSize({ width: 820, height: 500 });
    const next = ui.preview.getByRole("button", { name: "Next legend page" });
    const previous = ui.preview.getByRole("button", {
      name: "Previous legend page",
    });
    await expect(
      next,
      "actual narrow layout must have more than one page",
    ).toBeVisible();
    await expect(previous).toBeDisabled();
    await next.click();
    await expect(previous).toBeEnabled();
    const legend = ui.preview.getByRole("group", {
      name: "Chart legend",
      exact: true,
    });
    await expect(legend.getByRole("status")).not.toHaveText(
      "Legend page 1 of 1",
    );
    await first.focus();
    await expect(previous).toBeDisabled();
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
    const last = ui.preview.getByRole("switch", {
      name: "Series 10",
      exact: true,
    });
    await expect(last).toBeFocused();
    await expect(next).toBeDisabled();
    evidence.narrow = {
      page: await legend.getByRole("status").innerText(),
      last: await last.getAttribute("aria-label"),
    };
    await ui.preview.screenshot({ path: info.outputPath("narrow-paged.png") });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(next).toBeHidden();
    await expect(ui.preview.getByRole("switch")).toHaveCount(10);

    edited = true;
    await setParameter(ui.charts, "Core Settings", "Padding", "0");
    await plot.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowUp");
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
    await focusPoint(ui.preview, "Peter, Number of Looks (TM), 60");
    const zero = {
      title: await titleGeometry(page),
      bar: await pointGeometry(ui.preview),
    };
    expect(zero.title.font).toContain("17px");
    expect(zero.title.font).toContain("Verdana");
    await ui.preview.screenshot({ path: info.outputPath("padding-0.png") });
    await setParameter(ui.charts, "Core Settings", "Padding", "40");
    await focusPoint(ui.preview, "Peter, Number of Looks (TM), 60");
    const forty = {
      title: await titleGeometry(page),
      bar: await pointGeometry(ui.preview),
    };
    evidence.padding = { zero, forty };
    expect(forty.title.y - zero.title.y).toBeCloseTo(40, 0);
    expect(forty.bar.x).toBeGreaterThan(zero.bar.x + 20);
    expect(forty.bar.height).toBeLessThan(zero.bar.height);
    await ui.preview.screenshot({ path: info.outputPath("padding-40.png") });
    await setParameter(ui.charts, "Core Settings", "Padding", "-1");
    await expect(ui.preview.getByRole("alert")).toContainText(
      "Chart preview unavailable",
    );
    await expect(ui.preview.locator("canvas")).toHaveCount(0);
    await expect(
      await parameter(ui.charts, "Core Settings", "Padding"),
    ).toHaveValue("-1");
    await expect(
      ui.charts.getByRole("button", { name: "Save Theme", exact: true }),
    ).toBeEnabled();
    await setParameter(ui.charts, "Core Settings", "Padding", "40");
    await expect(ui.preview.getByRole("alert")).toHaveCount(0);
    await expect(ui.preview.locator("canvas")).toHaveCount(1);
    await setParameter(ui.charts, "Core Settings", "Accent Color", "#FF00FF");
    await setParameter(ui.charts, "Core Settings", "Border Color", "#008800");
    await setParameter(
      ui.charts,
      "Chrome Settings",
      "Chrome Background",
      "#112233",
    );
    await setParameter(
      ui.charts,
      "Chrome Settings",
      "Chrome Text Color",
      "#FFEEDD",
    );
    await setParameter(ui.charts, "Chrome Settings", "Chrome Font Size", "19");
    const tooltip = await pointerPoint(
      ui.preview,
      "Peter, Number of Looks (TM), 60",
    );
    evidence.chrome = await tooltip.locator("..").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        color: style.color,
        border: style.borderColor,
        fontSize: style.fontSize,
        text: node.textContent,
      };
    });
    expect(evidence.chrome).toMatchObject({
      background: "rgb(17, 34, 51)",
      color: "rgb(255, 238, 221)",
      border: "rgb(0, 136, 0)",
      fontSize: "19px",
    });
    await focusPoint(ui.preview, "Peter, Number of Looks (TM), 60");
    await expect(
      ui.preview.locator('[data-chart-keyboard="outline"]'),
    ).toHaveCSS("outline-color", "rgb(255, 0, 255)");
    await ui.preview.screenshot({
      path: info.outputPath("custom-tooltip-focus.png"),
    });

    const palette = await section(ui.charts, "Palette");
    const hex = palette.getByRole("textbox", {
      name: "Hex color",
      exact: true,
    });
    const initialPairs = await hex.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
    const remove = palette.getByRole("button", {
      name: /^Remove palette color /,
    });
    while (await remove.count()) await remove.last().click();
    await expect(
      palette.getByRole("textbox", { name: "Hex color", exact: true }),
    ).toHaveCount(2);
    await expect(ui.preview.getByRole("switch")).toHaveCount(0);
    await focusPoint(ui.preview, "Peter, Number of Looks (TM), 60");
    const removedFills = initialPairs
      .filter((_, index) => index % 2 === 0)
      .slice(1);
    await expect
      .poll(async () => (await previewPaint(ui.preview, removedFills)).counts)
      .toEqual(removedFills.map(() => 0));
    expect(
      (await previewPaint(ui.preview, [initialPairs[0]])).counts[0],
    ).toBeGreaterThan(300);
    await page.keyboard.press("ArrowDown");
    await focusPoint(ui.preview, "Peter, Number of Looks (TM), 60");
    await ui.preview.screenshot({ path: info.outputPath("one-series.png") });
    await palette
      .getByRole("button", { name: "Add palette color", exact: true })
      .click();
    await expect(ui.preview.getByRole("switch")).toHaveCount(2);
    await expect(
      palette.getByRole("textbox", { name: "Hex color", exact: true }),
    ).toHaveCount(4);
    const savedPairs = await hex.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
    await mode(ui.charts, "dark");
    await setParameter(ui.charts, "Core Settings", "Padding", "12");
    await expect(ui.preview.getByRole("switch")).toHaveCount(10);
    await mode(ui.charts, "light");
    await expect(
      await parameter(ui.charts, "Core Settings", "Padding"),
    ).toHaveValue("40");
    await expect(ui.preview.getByRole("switch")).toHaveCount(2);
    expect(saves, "all edits remain draft-only before Save").toBe(0);
    const saved = await saveTheme(page, ui.charts);
    evidence.saved = saved;
    expect(saved.light?.chartTheme?.params).toMatchObject({
      padding: 40,
      chromeFontSize: 19,
      chromeBackgroundColor: "#112233",
    });
    expect(saved.light?.chartTheme?.palette.fills).toHaveLength(2);
    expect(saved.light?.chartTheme?.palette.strokes).toHaveLength(2);
    expect(
      saved.light?.chartTheme?.palette.fills.map((color) =>
        color.toUpperCase(),
      ),
    ).toEqual([savedPairs[0], savedPairs[2]]);
    expect(
      saved.light?.chartTheme?.palette.strokes.map((color) =>
        color.toUpperCase(),
      ),
    ).toEqual([savedPairs[1], savedPairs[3]]);
    expect(saved.dark?.chartTheme?.params.padding).toBe(12);
    expect(saved.dark?.chartTheme?.baseTheme).toBe("ag-default-dark");
    expect(otherThemes(saved)).toEqual(retainedOtherThemes);

    fresh = await browser.newContext({
      baseURL: process.env.WORKSPACE_FRONTEND_ORIGIN,
      viewport: { width: 1600, height: 1000 },
    });
    const reopened = await fresh.newPage();
    cleanupPage = reopened;
    diagnostics.push({
      phase: "fresh-reopen",
      data: await observeApplication(reopened),
    });
    await loginDisposableWorkspace(reopened);
    const read = await openCharts(reopened);
    evidence.reopened = read.settings;
    expect(read.settings.light?.chartTheme).toEqual(saved.light?.chartTheme);
    expect(read.settings.dark?.chartTheme).toEqual(saved.dark?.chartTheme);
    expect(otherThemes(read.settings)).toEqual(retainedOtherThemes);
    await mode(read.charts, "light");
    await expect(
      await parameter(read.charts, "Core Settings", "Padding"),
    ).toHaveValue("40");
    await expect(read.preview.getByRole("switch")).toHaveCount(2);
    await focusPoint(read.preview, "Peter, Number of Looks (TM), 60");
    await mode(read.charts, "dark");
    await expect(
      await parameter(read.charts, "Core Settings", "Padding"),
    ).toHaveValue("12");
    await expect(read.preview.getByRole("switch")).toHaveCount(10);
    await mode(read.charts, "light");
    await read.charts
      .getByRole("button", { name: "Reset", exact: true })
      .click();
    await expect(
      await parameter(read.charts, "Core Settings", "Padding"),
    ).toHaveValue("");
    await expect(read.preview.getByRole("switch")).toHaveCount(10);
    const reset = await saveTheme(reopened, read.charts);
    evidence.reset = reset;
    expect(reset.light?.chartTheme).toBeNull();
    expect(reset.dark?.chartTheme).toEqual(saved.dark?.chartTheme);
    expect(otherThemes(reset)).toEqual(retainedOtherThemes);
    const afterReset = await openCharts(reopened);
    expect(afterReset.settings.light?.chartTheme).toBeNull();
    expect(afterReset.settings.dark?.chartTheme).toEqual(
      saved.dark?.chartTheme,
    );
  } finally {
    try {
      if (mayReset && edited) {
        const restored = await openCharts(cleanupPage);
        for (const value of ["light", "dark"] as const) {
          await mode(restored.charts, value);
          await restored.charts
            .getByRole("button", { name: "Reset", exact: true })
            .click();
        }
        evidence.cleanup = await saveTheme(cleanupPage, restored.charts);
        const reread = await openCharts(cleanupPage);
        evidence.cleanupRead = reread.settings;
        expect(reread.settings.light?.chartTheme ?? null).toBeNull();
        expect(reread.settings.dark?.chartTheme ?? null).toBeNull();
      }
    } finally {
      // Preserve every diagnostic array even if a behavior or teardown assertion fails.
      const snapshot = diagnostics.map(({ phase, data }) => ({
        phase,
        data: {
          errors: [...data.errors],
          consoleErrors: [...data.consoleErrors],
          requestFailures: [...data.requestFailures],
          failures: [...data.failures],
        },
      }));
      evidence.diagnostics = snapshot;
      await writeFile(
        info.outputPath("theme-preview-journey.json"),
        JSON.stringify(evidence, null, 2),
      );
      await fresh?.close();
      for (const observed of snapshot) {
        expect
          .soft(observed.data.errors, `${observed.phase}: page errors`)
          .toEqual([]);
        expect
          .soft(
            observed.data.consoleErrors,
            `${observed.phase}: console errors`,
          )
          .toEqual([]);
        expect
          .soft(
            observed.data.requestFailures,
            `${observed.phase}: failed requests`,
          )
          .toEqual([]);
        expect
          .soft(observed.data.failures, `${observed.phase}: HTTP failures`)
          .toEqual([]);
      }
    }
  }
});
