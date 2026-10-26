import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { expectedBoxTooltipNumber } from "./box-plot-fixture";
import { observeApplication } from "./diagnostics";
import { chartMenu, saveDashboard } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { growPieWidget, setTheme, stablePie } from "./pie-observer";
import { observeOriginalRadar, radarOriginalUpload } from "./radar-original-observer";
import { chartModel } from "./xy-observer";

const source = "38dffc33389aca0e4a87e0e88d42f7067aa220df";
const image = "sha256:f48eb1c9b32e1f84d5199dafc943bc1fc10f3b1745ab29860975d002dc5c8a3f";
const overlay = "23b6323e40a2edaa7267e25f72d032da8e92ccef09cc09545cb749fe2d2a15de";
const rows = [
  ["Revenue", 111184000000], ["Gross profit", 54781000000],
  ["Operating income", 35885000000], ["Pretax income", 35833000000], ["Net income", 29578000000],
] as const;

async function fixture() {
  const path = "artifacts/chart-funnel/fmp/levels.csv";
  const csv = await readFile(path, "utf8");
  const provenance = JSON.parse(await readFile("artifacts/chart-funnel/fmp/provenance.json", "utf8"));
  expect(csv.trim().split(/\r?\n/).slice(1).map(row => row.split(",")))
    .toEqual(rows.map(([stage, value]) => [stage, String(value)]));
  const sha256 = createHash("sha256").update(csv).digest("hex");
  expect(sha256).toBe(provenance.csv_sha256);
  return { path, csv, sha256, provenance };
}

async function financialTooltips(page: Page, widget: Locator) {
  const box = await widget.locator("canvas").first().boundingBox();
  expect(box).not.toBeNull();
  const texts = new Set<string>();
  for (let row = 0; row < 15; row++) for (const x of [0.4, 0.5, 0.6]) {
    await page.mouse.move(box!.x + box!.width * x, box!.y + box!.height * (row + 0.5) / 15);
    const tooltip = page.locator(".ag-charts-tooltip").filter({ visible: true }).last();
    try {
      await tooltip.waitFor({ state: "visible", timeout: 180 });
      texts.add(await tooltip.innerText());
    } catch { /* Empty public hit locations are expected; every financial row is required below. */ }
  }
  for (const [stage, value] of rows)
    expect([...texts].some(text => text.includes(stage) &&
      text.includes(expectedBoxTooltipNumber(value))), `${stage}: retained USD tooltip`).toBe(true);
  await page.mouse.move(0, 0);
  return [...texts];
}

for (const variant of ["Funnel", "Cone Funnel", "Pyramid"]) test(`original ${variant} untouched visual reference light and dark`, async ({ page }, info) => {
  test.setTimeout(180000);
  expect(process.env.QOPENBB_REFERENCE_SOURCE).toBe(source);
  expect(process.env.QOPENBB_REFERENCE_IMAGE).toBe(image);
  expect(process.env.QOPENBB_REFERENCE_OVERLAY_SHA256).toBe(overlay);
  const retained = await fixture();
  const diagnostics = await observeApplication(page);
  const records: unknown[] = [];
  const evidence: Record<string, unknown> = {
    identity: { source, image, overlay }, variant, retained, diagnostics, records,
    limitations: "Original reference characterization. Existing runner qualifies actual image/source/overlay. Diagnostics retained without candidate-cleanliness claim. No Customize controls opened or changed; no direct chart-option injection.",
  };
  try {
    await observeOriginalRadar(page);
    await loginDisposableWorkspace(page);
    await radarOriginalUpload(page);
    const { widget } = await importOrdinaryTable(page, { csv: retained.csv,
      name: `AAPL FY2026 Q2 ${variant} USD`, expectedValue: "Net income" });
    evidence.table = await widget.ariaSnapshot();
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    await chartMenu(page, widget, "Chart settings");
    await page.getByRole("tab", { name: "Chart", exact: true }).click();
    await page.getByRole("button", { name: variant, exact: true }).click();
    await chartMenu(page, widget, "Chart settings");
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      await stablePie(page, widget);
      const dimensions = await widget.locator("canvas").first().evaluate(canvas => ({
        width: (canvas as HTMLCanvasElement).width, height: (canvas as HTMLCanvasElement).height,
        css: canvas.getBoundingClientRect().toJSON(), dpr: devicePixelRatio,
      }));
      const drawing = await page.evaluate(() => (window as any).radarPaint);
      await widget.screenshot({ path: info.outputPath(dark ? "default-dark.png" : "default-light.png") });
      records.push({ dark, dimensions, drawing, tooltips: await financialTooltips(page, widget) });
    }
    const dashboard = new URL(page.url()).pathname.split("/").at(-1)!;
    evidence.model = chartModel((await saveDashboard(page)).items[dashboard]);
  } catch (error) {
    evidence.failure = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    await writeFile(info.outputPath("visual-reference.json"), JSON.stringify(evidence, null, 2));
  }
});
