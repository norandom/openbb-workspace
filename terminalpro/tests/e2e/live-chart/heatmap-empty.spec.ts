import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { candidateIdentity } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { openEditor, saveDashboard, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { collapse } from "./hierarchy-controls";
import {
  gradientState,
  hover,
  nativeTooltip,
  observeHierarchy,
} from "./hierarchy-observer";
import { currentHistogram } from "./histogram-observer";
import { importOrdinaryTable } from "./journey";
import { currentPie, growPieWidget, stablePie, toggle } from "./pie-observer";
import { qualifiedRadialIdentity } from "./radial-fixture";
import { chartModel } from "./xy-observer";

const csv = "Group,Missing,Companion\nDrop,5,9\nKeep,,10\nKeep\n";

async function select(editor: Locator, field: string) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Group");
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  await editor
    .getByRole("combobox", { name: "Add a series", exact: true })
    .selectOption({ label: field });
  await toggle(editor, "Aggregate", false);
}

async function model(page: Page) {
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  return chartModel((await saveDashboard(page)).items[id]);
}

test("Heatmap actual File all-missing selected domain recovers finite observations", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const identity = { ...candidateIdentity(), runtime: qualifiedRadialIdentity() };
  await observeHierarchy(page);
  const diagnostics = await observeApplication(page);
  const evidence: any = {
    identity,
    diagnostics,
    fixture: { csv, sha256: createHash("sha256").update(csv).digest("hex") },
    limitations:
      "Actual CSV blanks are retained; original parser removes the one-field truncated row. Public table text does not assert typed GridApi values.",
  };
  const persist = () =>
    writeFile(
      info.outputPath("missing-recovery.json"),
      JSON.stringify(evidence, null, 2),
    );
  try {
    await loginDisposableWorkspace(page);
    const { widget } = await importOrdinaryTable(page, {
      csv,
      name: "Heatmap actual blank and truncated cells",
      expectedValue: "10",
    });
    evidence.unfilteredTable = await widget.ariaSnapshot();
    await expect(
      widget.getByRole("gridcell", { name: "Keep", exact: true }),
    ).toHaveCount(1);
    await widget.getByRole("button", { name: "Filter Group", exact: true }).click();
    await page.getByRole("textbox", { name: "Filter Value", exact: true }).fill("Keep");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(
      widget.getByRole("gridcell", { name: "Drop", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    evidence.filteredTable = await widget.ariaSnapshot();
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    let editor = await openEditor(page, widget);
    await selectFamily(editor, "Heatmap");
    await select(editor, "Missing");
    evidence.missingSetup = await editor.ariaSnapshot();
    await collapse(editor);
    const painted = await currentHistogram(page, widget);
    const labels = await currentPie(page, widget);
    const gradients = await gradientState(page);
    const saved = await model(page);
    evidence.missing = {
      model: saved,
      painted,
      labels,
      gradients,
      controls: await widget.ariaSnapshot(),
    };
    await persist();
    expect(saved.cellRange.columns).toEqual(["Group", "Missing"]);
    expect(labels.text.map((t) => t.text)).toEqual(
      expect.arrayContaining(["Keep", "Missing"]),
    );
    expect(labels.text.filter((t) => /^-?\d[\d,.]*$/.test(t.text))).toHaveLength(0);
    expect(gradients.gradients).toHaveLength(0);
    const colored = painted.rectangles.filter(
      (r) =>
        r.width > 50 &&
        r.height > 50 &&
        r.alpha > 0 &&
        r.fill !== "transparent" &&
        !/^rgba\([^)]*,\s*0\s*\)$/.test(r.fill) &&
        !["#151518", "#ffffff", "#fff", "#000000"].includes(r.fill.toLowerCase()),
    );
    expect(
      colored,
      "selected missing observations have no finite cell fill",
    ).toHaveLength(0);
    await expect(widget.getByText(/No data available to be charted/)).toHaveCount(0);
    const x = labels.text.find((t) => t.text === "Missing")!;
    const y = labels.text.find((t) => t.text === "Keep")!;
    await hover(page, widget, {
      x: x.bounds.x + x.bounds.width / 2,
      y: y.bounds.y + y.bounds.height / 2,
    });
    await expect(nativeTooltip(widget)).toHaveCount(0);
    await stablePie(page, widget);
    await widget.screenshot({
      path: info.outputPath("all-missing-selected-domain.png"),
    });
    editor = await openEditor(page, widget);
    await select(editor, "Companion");
    await collapse(editor);
    const finite = await currentHistogram(page, widget);
    const finiteLabels = await currentPie(page, widget);
    expect(finiteLabels.text.map((t) => t.text)).toContain("10");
    const fx = finiteLabels.text.find((t) => t.text === "Companion")!;
    const fy = finiteLabels.text.find((t) => t.text === "Keep")!;
    await hover(page, widget, {
      x: fx.bounds.x + fx.bounds.width / 2,
      y: fy.bounds.y + fy.bounds.height / 2,
    });
    const tooltip = nativeTooltip(widget).last();
    await expect(tooltip).toHaveText(/Keep\s*Companion:\s*10/);
    const recoveredModel = await model(page);
    expect(recoveredModel.cellRange.columns).toEqual(["Group", "Companion"]);
    evidence.recovered = {
      model: recoveredModel,
      finite,
      labels: finiteLabels,
      tooltip: await tooltip.innerText(),
    };
    await stablePie(page, widget);
    await widget.screenshot({ path: info.outputPath("recovered-finite-10.png") });
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await persist();
  }
});
