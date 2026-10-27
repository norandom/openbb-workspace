import { writeFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { candidateIdentity, expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { openEditor, saveDashboard, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { collapse } from "./hierarchy-controls";
import {
  center,
  drawing,
  hover,
  nativeTooltip,
  observeHierarchy,
  regexLiteral,
  visibleFill,
} from "./hierarchy-observer";
import { assertHistogramExport, type Rectangle } from "./histogram-observer";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";
import { growPieWidget, refreshPie, setTheme, stablePie } from "./pie-observer";
import { qualifiedRadialIdentity } from "./radial-fixture";
import { retainedSankey, sankeyColumns, sankeyRoot } from "./sankey-fixture";
import { chartModel } from "./xy-observer";

const metadata = {
  unit: "currency",
  currency: "USD",
  scale: 1,
  period: "AAPL FY2025",
  measure: "income-allocation",
};
const unspecified =
  "Units or allocation scope unspecified; numerical balance is not financial reconciliation";
type Source = ReturnType<typeof retainedSankey>;

async function mappings(editor: Locator) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  for (const [label, column] of [
    ["Source", "source"],
    ["Target", "target"],
    ["Value", "value"],
  ])
    await editor
      .getByRole("combobox", { name: label, exact: true })
      .selectOption(column);
}

async function declareMetadata(editor: Locator) {
  await editor.getByRole("button", { name: "Metadata", exact: true }).click();
  for (const [field, value] of Object.entries(metadata)) {
    const label = field[0].toUpperCase() + field.slice(1);
    const input = editor.getByRole(field === "scale" ? "spinbutton" : "textbox", {
      name: label,
      exact: true,
    });
    await input.fill(String(value));
    await input.blur();
  }
  await expect(editor.getByRole("status").filter({ hasText: unspecified })).toHaveCount(
    0,
  );
}

function expectMetadata(text: string) {
  for (const [field, value] of Object.entries(metadata))
    expect(text).toContain(`${field[0].toUpperCase() + field.slice(1)}: ${value}`);
  expect(text).toContain("Rows:");
  expect(text).toContain("Provenance (");
  expect(text).not.toContain(unspecified);
}

async function tooltip(page: Page, widget: Locator, point: { x: number; y: number }) {
  await hover(page, widget, point);
  const tip = nativeTooltip(widget).last();
  await expect(tip).toBeVisible();
  return tip.innerText();
}

async function financial(page: Page, widget: Locator, source: Source, edges = false) {
  const paint = await drawing(page, widget);
  const labels = [
    ...new Set(source.edges.flatMap((edge) => [edge.source, edge.target])),
  ];
  expect(paint.text.map((text) => text.text)).toEqual(expect.arrayContaining(labels));
  const nodes = paint.rectangles.filter(
    (r) => Math.abs(r.width - 20) < 0.1 && r.height > 1 && r.fillAlpha !== 0,
  );
  expect(
    nodes,
    "each retained source, internal allocation and shared sink is painted",
  ).toHaveLength(labels.length);
  const observed = [];
  for (const rectangle of nodes) {
    const text = await tooltip(page, widget, center(rectangle));
    const label = labels.find((label) =>
      text.startsWith(`${label} (string; identity `),
    );
    expect(label, "painted node has its own native typed identity").toBeDefined();
    expectMetadata(text);
    const incoming = source.edges
      .filter((edge) => edge.target === label)
      .reduce((sum, edge) => sum + edge.value, 0);
    const outgoing = source.edges
      .filter((edge) => edge.source === label)
      .reduce((sum, edge) => sum + edge.value, 0);
    if (incoming)
      expect(text).toContain(`Incoming: ${expectedBoxTooltipNumber(incoming)}`);
    if (outgoing)
      expect(text).toContain(`Outgoing: ${expectedBoxTooltipNumber(outgoing)}`);
    if (incoming && outgoing) {
      expect(text).toContain("Internal allocation");
      expect(text).toContain(`Residual: ${incoming - outgoing} (stored amount)`);
      expect(text).toContain(`Tolerance: ${Math.max(1e-9, 1e-12 * incoming)}`);
      expect(text).toContain(
        incoming === outgoing
          ? "Balanced within numerical tolerance"
          : "Incomplete or imbalanced flow",
      );
    } else expect(text).toContain(incoming ? "Sink" : "Source");
    observed.push({
      label: label!,
      incoming,
      outgoing,
      rectangle,
      text,
      rgba: await visibleFill(widget, rectangle),
    });
  }
  expect(new Set(observed.map((node) => node.label)).size).toBe(labels.length);
  const root = observed.find((node) => node.label === sankeyRoot)!;
  for (const node of observed)
    expect(
      Math.abs(
        node.rectangle.height / root.rectangle.height -
          Math.max(node.incoming, node.outgoing) / source.total,
      ),
      `${node.label} painted node height uses its economic amount once`,
    ).toBeLessThanOrEqual(2 / paint.dpr / root.rectangle.height);
  const links: { source: string; target: string; value: number; text: string }[] = [];
  if (edges)
    for (const quarter of source.provenance.quarters) {
      const r = observed.find((node) => node.label === quarter.quarter)!.rectangle;
      for (const point of [
        { x: r.x - 6, y: r.y + r.height / 2 },
        { x: r.x + r.width + 6, y: r.y + r.height * 0.2 },
        { x: r.x + r.width + 6, y: r.y + r.height * 0.8 },
      ]) {
        const text = await tooltip(page, widget, point);
        const edge = source.edges.find(
          (edge) =>
            text.startsWith(`Source: ${edge.source} (string; identity `) &&
            text.includes(`Target: ${edge.target} (string; identity `),
        );
        expect(
          edge,
          "painted link resolves to a retained source/target allocation",
        ).toBeDefined();
        expect(text).toContain(`Value: ${expectedBoxTooltipNumber(edge!.value)}`);
        expectMetadata(text);
        links.push({
          source: edge!.source,
          target: edge!.target,
          value: edge!.value,
          text,
        });
      }
    }
  if (edges)
    expect(new Set(links.map((edge) => `${edge.source}\0${edge.target}`)).size).toBe(
      12,
    );
  await stablePie(page, widget);
  return { nodes: observed, links, paint };
}

async function incompleteFlow(page: Page, widget: Locator, source: Source) {
  await widget.locator("#chart-view-button").click();
  await widget.getByRole("button", { name: "Filter Target", exact: true }).click();
  const filter = page.locator(".ag-popup .ag-filter");
  await filter.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Does not contain", exact: true }).click();
  await filter
    .getByRole("textbox", { name: "Filter Value", exact: true })
    .first()
    .fill("Cost of revenue");
  await filter.getByRole("button", { name: "Apply", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    widget.getByRole("gridcell", { name: "Cost of revenue", exact: true }),
  ).toHaveCount(0);
  await expect(
    widget.getByRole("gridcell", { name: "Gross profit", exact: true }).first(),
  ).toBeVisible();
  await widget.locator("#chart-view-button").click();
  const retained = {
    ...source,
    edges: source.edges.filter((edge) => edge.target !== "Cost of revenue"),
  };
  const measured = await financial(page, widget, retained);
  expect(
    measured.nodes.filter(
      (node) => node.incoming && node.outgoing && node.incoming !== node.outgoing,
    ),
  ).toHaveLength(4);
  await expect(
    widget
      .getByRole("status")
      .filter({ hasText: /imbalanced|residual/i })
      .first(),
  ).toBeVisible();
  await widget.locator("#chart-view-button").click();
  await widget
    .getByRole("button", { name: "Clear Target filter", exact: true })
    .click();
  await expect(
    widget.getByRole("gridcell", { name: "Cost of revenue", exact: true }).first(),
  ).toBeVisible();
  await widget.locator("#chart-view-button").click();
  return measured;
}

function expectSaved(
  content: Parameters<typeof chartModel>[0],
  records: unknown[],
  stage: string,
) {
  const file = content.data.widgets.find((widget: { widgetId: string }) =>
    widget.widgetId.startsWith("file-"),
  );
  records.push({
    stage,
    chartType: chartModel(content).chartType,
    cellRange: file.storage.default.sankey.cellRange,
    sankeySetup: file.storage.default.sankey.sankeySetup,
  });
  expect(chartModel(content).chartType).toBe("sankey");
  expect(file.storage.default.sankey.cellRange).toMatchObject({
    columns: [...sankeyColumns],
  });
  expect(file.storage.default.sankey.sankeySetup).toEqual({
    version: 1,
    sourceColumnId: "source",
    targetColumnId: "target",
    valueColumnId: "value",
    metadata,
    metadataColumnIds: {},
  });
}

test("Sankey retained FMP allocation mapping recovery theme refresh PNG and fresh reopen", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  const diagnostics = await observeApplication(page);
  await observeHierarchy(page);
  const source = retainedSankey();
  const evidence: Record<string, unknown> = {
    source,
    diagnostics,
    records: [],
    limitations:
      "Reported FMP amounts in a derived income allocation, not cash flows or independently reported annual revenue. Ordinary capture provenance contains row/mapping identity; provider provenance is retained externally. The incomplete-flow check filters out cost allocations through the ordinary Table UI, retaining original reported amounts.",
  };
  const records = evidence.records as unknown[];
  const reopenedDiagnostics: Awaited<ReturnType<typeof observeApplication>>[] = [];
  evidence.reopenedDiagnostics = reopenedDiagnostics;
  let fileURL = "";
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      /\/api\/pro\/files\/[^/]+\.csv$/.test(new URL(response.url()).pathname)
    )
      fileURL = response.url();
  });
  try {
    evidence.identity = { ...candidateIdentity(), runtime: qualifiedRadialIdentity() };
    await loginDisposableWorkspace(page);
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      csv: source.csv,
      name: "AAPL FY2025 derived income allocation (USD)",
      expectedValue: regexLiteral(expectedBoxTooltipNumber(source.edges[0].value)),
    });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    let editor = await openEditor(page, widget);
    await selectFamily(editor, "Sankey");
    await mappings(editor);
    await expect(
      editor.getByRole("status").filter({ hasText: unspecified }),
    ).toBeVisible();
    await declareMetadata(editor);
    await collapse(editor);
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      const measured = await financial(page, widget, source, !dark);
      records.push({ stage: dark ? "dark" : "light", measured });
      await widget.screenshot({
        path: info.outputPath(dark ? "fmp-sankey-dark.png" : "fmp-sankey-light.png"),
      });
    }
    editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor
      .getByRole("combobox", { name: "Target", exact: true })
      .selectOption("source");
    await expect(editor.getByRole("alert").first()).toBeVisible();
    await expect(
      editor.getByRole("combobox", { name: "Target", exact: true }),
    ).toHaveValue("source");
    await expect(widget.locator("canvas").first()).toBeHidden();
    records.push({ stage: "invalid-mapping", accessible: await widget.ariaSnapshot() });
    await editor
      .getByRole("combobox", { name: "Target", exact: true })
      .selectOption("target");
    await expect(editor.getByRole("alert")).toHaveCount(0);
    await collapse(editor);
    records.push({
      stage: "recovered",
      measured: await financial(page, widget, source),
    });
    records.push({
      stage: "filtered-incomplete-flow",
      measured: await incompleteFlow(page, widget, source),
    });
    records.push({
      stage: "filter-cleared",
      measured: await financial(page, widget, source),
    });
    expect(fileURL, "ordinary File endpoint captured before refresh").not.toBe("");
    await refreshPie(page, widget, fileURL, source.csv);
    const refreshed = await financial(page, widget, source);
    records.push({ stage: "refreshed", measured: refreshed });
    const labels: Rectangle[] = refreshed.paint.text.map((text) => ({
      ...refreshed.nodes[0].rectangle,
      ...text.bounds,
    }));
    await assertHistogramExport(page, widget, info, [
      ...refreshed.nodes.map((node) => node.rectangle),
      ...labels,
    ]);
    const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    expectSaved((await saveDashboard(page)).items[id], records, "saved-state");
    const reopened = await reopenSavedDashboard(
      browser,
      dashboardUrl,
      async (fresh) => {
        reopenedDiagnostics.push(await observeApplication(fresh));
        await observeHierarchy(fresh);
      },
    );
    reopenedDiagnostics.push(reopened.diagnostics);
    try {
      expectSaved(reopened.content, records, "fresh-reopened-state");
      records.push({
        stage: "fresh-reopen",
        measured: await financial(reopened.page, reopened.widget, source),
      });
      await reopened.widget.screenshot({
        path: info.outputPath("fmp-sankey-fresh-reopen.png"),
      });
    } finally {
      await reopened.context.close();
    }
  } finally {
    // Retain every diagnostic array before an assertion can mask another failure.
    await writeFile(
      info.outputPath("sankey-journey.json"),
      JSON.stringify(evidence, null, 2),
    );
  }
  expectApplicationDiagnostics(diagnostics);
  for (const fresh of reopenedDiagnostics) expectApplicationDiagnostics(fresh);
});
