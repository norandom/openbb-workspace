import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { exportChart } from "./actions";
import { candidateIdentity, expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { directionEffect, dropOffEffect, shadowEffect } from "./funnel-control-effects";
import { collapse, reorder } from "./hierarchy-controls";
import { nativeTooltip } from "./hierarchy-observer";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";
import { currentPie, growPieWidget, observePie, setTheme, stablePie, toggle } from "./pie-observer";
import { chartModel } from "./xy-observer";

const stages = ["Revenue", "Gross profit", "Operating income", "Pretax income", "Net income"];
const amounts = [111184000000, 54781000000, 35885000000, 35833000000, 29578000000];
const variants = ["Funnel", "Cone Funnel", "Pyramid"] as const;
const fieldLabels: Record<string, string> = { LevelUSD: "Level USD", InvalidUSD: "Invalid USD", ValidUSD: "Valid USD" };

async function retained() {
  const path = "artifacts/chart-funnel/fmp/levels.csv";
  const csv = await readFile(path, "utf8");
  const provenance = JSON.parse(await readFile("artifacts/chart-funnel/fmp/provenance.json", "utf8"));
  expect(csv.trim().split(/\r?\n/).slice(1).map(row => row.split(",")))
    .toEqual(stages.map((stage, i) => [stage, String(amounts[i])]));
  const sha256 = createHash("sha256").update(csv).digest("hex");
  expect(sha256).toBe(provenance.csv_sha256);
  expect(provenance.record).toMatchObject({ symbol: "AAPL", date: "2026-03-28", reportedCurrency: "USD" });
  return { path, csv, sha256, provenance };
}

async function setup(editor: Locator, fields: string[]) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption("Stage");
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  for (const field of fields) {
    const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
    // Setup options expose an index value and a prettified label, not raw IDs.
    expect(fieldLabels[field], `known fixture display label for ${field}`).toBeDefined();
    await add.selectOption({ label: fieldLabels[field] });
  }
  await toggle(editor, "Aggregate", false);
  await expect(editor.getByRole("switch", { name: "Switch Category / Series", exact: true })).toHaveCount(0);
}

async function saved(page: Page) {
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  return chartModel((await saveDashboard(page)).items[id]);
}

// Default recovery fixtures have no title and a plain background. Inspect every
// plot canvas pixel, including filled polygons which the shared text observer
// does not record. Transparent RGB bytes do not contribute visible paint.
async function canvasPaint(widget: Locator) {
  return widget.locator("canvas").evaluateAll(elements => elements.map(element => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Recovery pixel check requires a readable 2D canvas");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const background = [...data.slice(0, 4)];
    let nonUniformPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alphaDiffers = data[i + 3] !== background[3];
      const colorDiffers = data[i + 3] > 0 &&
        (data[i] !== background[0] || data[i + 1] !== background[1] || data[i + 2] !== background[2]);
      if (alphaDiffers || colorDiffers) nonUniformPixels++;
    }
    return { width: canvas.width, height: canvas.height, background, nonUniformPixels };
  }));
}

type TooltipPoint = { x: number; y: number; text: string };

async function validTooltipPoint(page: Page, widget: Locator): Promise<TooltipPoint> {
  const box = await widget.locator("canvas").first().boundingBox();
  expect(box).not.toBeNull();
  for (const y of [0.2, 0.35, 0.5, 0.65, 0.8, 0.9]) for (const x of [0.4, 0.5, 0.6]) {
    await page.mouse.move(0, 0);
    await page.mouse.move(box!.x + box!.width * x, box!.y + box!.height * y);
    const tip = nativeTooltip(widget).last();
    try {
      await tip.waitFor({ state: "visible", timeout: 300 });
      const text = await tip.innerText();
      const rows = [["First", 100], ["Missing", 80], ["Negative", 60], ["Last", 40]] as const;
      if (rows.some(([stage, value]) => text.includes(stage) && text.includes(expectedBoxTooltipNumber(value))) &&
        text.includes("Valid USD")) return { x, y, text };
    } catch { /* Keep the bounded scan until an actual valid-stage hit is found. */ }
  }
  throw new Error("No actual valid Pyramid tooltip hit point found");
}

async function blankPlot(page: Page, widget: Locator, priorHit: TooltipPoint) {
  await page.mouse.move(0, 0);
  await expect(widget.locator("canvas").first()).toBeVisible();
  await expect.poll(async () => {
    const paint = await canvasPaint(widget);
    return paint.length > 0 && paint.every(canvas =>
      canvas.width > 100 && canvas.height > 100 && canvas.nonUniformPixels === 0);
  }, { intervals: [100, 250, 500] }).toBe(true);
  const box = await widget.locator("canvas").first().boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * priorHit.x, box!.y + box!.height * priorHit.y);
  // Give the former real hit point time to expose a delayed stale tooltip.
  await page.waitForTimeout(600);
  await expect(nativeTooltip(widget)).toHaveCount(0);
  await page.mouse.move(0, 0);
  return canvasPaint(widget);
}

// Bounded public hit testing requires every expected retained stage/value pair.
// A visible canvas or saved configuration alone cannot satisfy this assertion.
async function financial(page: Page, widget: Locator) {
  await stablePie(page, widget);
  const canvas = await widget.locator("canvas").first().boundingBox();
  expect(canvas).not.toBeNull();
  const tooltips = new Set<string>();
  for (let row = 0; row < 15; row++) {
    for (const fraction of [0.4, 0.5, 0.6]) {
      await page.mouse.move(canvas!.x + canvas!.width * fraction, canvas!.y + canvas!.height * (row + 0.5) / 15);
      const tip = nativeTooltip(widget).last();
      try {
        await tip.waitFor({ state: "visible", timeout: 120 });
        tooltips.add(await tip.innerText());
      } catch { /* Empty plot locations are expected; coverage is asserted below. */ }
    }
  }
  for (const [i, stage] of stages.entries()) {
    expect([...tooltips].some(text => text.includes(stage) && /Level\s*USD/i.test(text) &&
      text.includes(expectedBoxTooltipNumber(amounts[i]))), `${stage}: formatted retained USD tooltip`).toBe(true);
  }
  await page.mouse.move(0, 0);
  return [...tooltips];
}

for (const variant of variants) test(`Funnel candidate ${variant} retained USD defaults`, async ({ page }, info) => {
  test.setTimeout(180000);
  const source = await retained();
  const identity = candidateIdentity();
  const diagnostics = await observeApplication(page);
  await observePie(page);
  const records: unknown[] = [];
  try {
    await loginDisposableWorkspace(page);
    const { widget } = await importOrdinaryTable(page, { csv: source.csv, name: `AAPL FY2026 Q2 ${variant} USD`, expectedValue: "Net income" });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    const editor = await openEditor(page, widget);
    await selectFamily(editor, variant);
    await setup(editor, ["LevelUSD"]);
    await collapse(editor);
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      records.push({ dark, tooltips: await financial(page, widget), drawing: await currentPie(page, widget) });
      await widget.screenshot({ path: info.outputPath(dark ? "default-dark.png" : "default-light.png") });
    }
    expect((await saved(page)).cellRange.columns).toEqual(["Stage", "LevelUSD"]);
    await exportChart(page, widget, info);
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await writeFile(info.outputPath("defaults.json"), JSON.stringify({ identity, source, records, diagnostics }, null, 2));
  }
});

test("Funnel candidate controls expose direction and persist final Pyramid numeric-label mode", async ({ page, browser }, info) => {
  test.setTimeout(240000);
  const source = await retained();
  const identity = candidateIdentity();
  const diagnostics = await observeApplication(page);
  await observePie(page);
  const effects: unknown[] = [];
  try {
    await loginDisposableWorkspace(page);
    const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv: source.csv, name: "Funnel controls USD", expectedValue: "Net income" });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    let editor = await openEditor(page, widget);
    for (const variant of variants) {
      await selectFamily(editor, variant);
      await setup(editor, ["LevelUSD"]);
      const direction = editor.getByRole("combobox", { name: "Direction", exact: true });
      await direction.selectOption("horizontal");
      await expect(direction).toHaveValue("horizontal");
      await collapse(editor);
      const horizontal = await directionEffect(page, widget, "horizontal");
      editor = await openEditor(page, widget);
      await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
      await editor.getByRole("combobox", { name: "Direction", exact: true }).selectOption("vertical");
      await collapse(editor);
      const vertical = await directionEffect(page, widget, "vertical");
      editor = await openEditor(page, widget);
      await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
      await toggle(editor, "Aggregate", true);
      await toggle(editor, "Aggregate", false);
      await editor.getByRole("tab", { name: "Customize", exact: true }).click();
      await expect(editor.getByRole("combobox", { name: "Direction", exact: true })).toHaveCount(0);
      await expand(editor, "Series");
      await expect(editor.getByRole("group", { name: "Drop-Off", exact: true })).toHaveCount(variant === "Funnel" ? 1 : 0);
      await expect(editor.getByRole("group", { name: "Shadow", exact: true })).toHaveCount(variant === "Cone Funnel" ? 0 : 1);
      if (variant === "Funnel") await toggle(editor, "Drop-Off", false);
      if (variant !== "Cone Funnel") await toggle(editor, "Shadow", true);
      await toggle(editor, "Labels", false);
      await toggle(editor, "Stage Labels", true);
      await collapse(editor);
      let drawing = await currentPie(page, widget);
      expect(drawing.text.map(t => t.text)).toEqual(expect.arrayContaining(stages));
      const effect: Record<string, unknown> = { variant, horizontal, vertical };
      effects.push(effect);
      if (variant === "Funnel") effect.dropOff = await dropOffEffect(page, widget);
      if (variant !== "Cone Funnel") effect.shadow = await shadowEffect(page, widget, vertical["Gross profit"]);
      await widget.screenshot({ path: info.outputPath(`${variant}-stage-only.png`) });
      editor = await openEditor(page, widget);
      await editor.getByRole("tab", { name: "Customize", exact: true }).click();
      await expand(editor, "Series");
      await toggle(editor, "Labels", true);
      await toggle(editor, "Stage Labels", false);
      await collapse(editor);
      drawing = await currentPie(page, widget);
      expect(drawing.text.some(t => stages.includes(t.text))).toBe(false);
      expect(drawing.text.some(t => /\d/.test(t.text))).toBe(true);
      editor = await openEditor(page, widget);
    }
    await collapse(editor);
    await saved(page);
    await page.reload();
    await expect(widget.locator("canvas").first()).toBeVisible();
    expect((await currentPie(page, widget)).text.some(t => stages.includes(t.text))).toBe(false);
    const reopened = await reopenSavedDashboard(browser, dashboardUrl, observePie);
    try {
      const drawing = await currentPie(reopened.page, reopened.widget);
      expect(drawing.text.some(t => stages.includes(t.text))).toBe(false);
      expect(drawing.text.some(t => /\d/.test(t.text))).toBe(true);
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally { await reopened.context.close(); }
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await writeFile(info.outputPath("controls.json"), JSON.stringify({ identity, source, diagnostics, effects }, null, 2));
  }
});

test("Funnel candidate Pyramid invalid and no-series recover through ordinary setup", async ({ page }, info) => {
  test.setTimeout(180000);
  const csv = "Stage,InvalidUSD,ValidUSD\nFirst,120,100\nMissing,,80\nNegative,-20,60\nLast,30,40\n";
  const identity = candidateIdentity();
  const diagnostics = await observeApplication(page);
  await observePie(page);
  const records: unknown[] = [];
  try {
    await loginDisposableWorkspace(page);
    const { widget } = await importOrdinaryTable(page, { csv, name: "Pyramid signed USD recovery", expectedValue: "Last" });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    let editor = await openEditor(page, widget);
    await selectFamily(editor, "Pyramid");
    await setup(editor, ["ValidUSD", "InvalidUSD"]);
    await collapse(editor);
    expect((await currentPie(page, widget)).text.map(t => t.text)).toEqual(expect.arrayContaining(["First", "Last"]));
    const validPaint = await canvasPaint(widget);
    expect(validPaint.some(canvas => canvas.nonUniformPixels > 100), "baseline contains visible plot paint").toBe(true);
    const priorHit = await validTooltipPoint(page, widget);
    records.push({ validBeforeInvalid: validPaint, priorHit });
    editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await reorder(editor, "Invalid USD", "ArrowUp");
    await collapse(editor);
    await expect(widget.getByRole("status").filter({ hasText: /negative/i })).toBeVisible();
    records.push({ invalid: await widget.ariaSnapshot(), pixels: await blankPlot(page, widget, priorHit) });
    await widget.screenshot({ path: info.outputPath("pyramid-invalid-cleared.png") });
    editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("button", { name: "Remove Invalid USD", exact: true }).click();
    await collapse(editor);
    await expect(widget.getByRole("status").filter({ hasText: /negative/i })).toHaveCount(0);
    expect((await currentPie(page, widget)).text.map(t => t.text)).toEqual(expect.arrayContaining(["First", "Last"]));
    editor = await openEditor(page, widget);
    await setup(editor, []);
    await collapse(editor);
    await expect(widget.getByRole("status")).toContainText(/series|numeric|field/i);
    records.push({ noSeries: await widget.ariaSnapshot(), pixels: await blankPlot(page, widget, priorHit) });
    editor = await openEditor(page, widget);
    await setup(editor, ["ValidUSD"]);
    await collapse(editor);
    expect((await currentPie(page, widget)).text.map(t => t.text)).toEqual(expect.arrayContaining(["First", "Last"]));
    await widget.screenshot({ path: info.outputPath("pyramid-recovered.png") });
    expect((await saved(page)).cellRange.columns).toEqual(["Stage", "ValidUSD"]);
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await writeFile(info.outputPath("recovery.json"), JSON.stringify({ identity, csv, records, diagnostics }, null, 2));
  }
});
