import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

const root = resolve(import.meta.dirname, "../../../../../..");
export const gallery = JSON.parse(readFileSync(resolve(root, "contracts/gallery/catalog.json"), "utf8")).apps[0];
export const contract = JSON.parse(readFileSync(resolve(root, "contracts/gallery/chart-state.json"), "utf8"));
export const snapshot = JSON.parse(readFileSync(resolve(root, "contracts/gallery/data.json"), "utf8"));
export type Paint = { text: string[]; points: { x: number; y: number }[]; dates: { text: string; x: number }[] };

// Record public drawing calls per canvas. The observer never reads or changes
// renderer internals, table state, data, options, or the saved dashboard.
export async function observeGalleryPaint(page: Page) {
  const install = () => {
    const records = new WeakMap<HTMLCanvasElement, Paint>();
    const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }[]>();
    const owned = (context: CanvasRenderingContext2D) => context.canvas.closest('[class*="widget-qopenbb_gallery_"]')?.querySelector("canvas") === context.canvas;
    const record = (context: CanvasRenderingContext2D) => {
      let value = records.get(context.canvas);
      if (!value) { value = { text: [], points: [], dates: [] }; records.set(context.canvas, value); }
      return value;
    };
    const point = (context: CanvasRenderingContext2D, x: number, y: number) => {
      const p = context.getTransform().transformPoint(new DOMPoint(x, y));
      const scale = context.canvas.getBoundingClientRect().width / context.canvas.width;
      return { x: p.x * scale, y: p.y * scale };
    };
    const p = CanvasRenderingContext2D.prototype;
    const begin = p.beginPath;
    const move = p.moveTo;
    const line = p.lineTo;
    const rect = p.rect;
    const arc = p.arc;
    const fill = p.fill;
    const stroke = p.stroke;
    const text = p.fillText;
    const clear = p.clearRect;
    p.beginPath = function () { paths.set(this, []); return Reflect.apply(begin, this, []); };
    p.moveTo = function (...args) { paths.get(this)?.push(point(this, ...args)); return Reflect.apply(move, this, args); };
    p.lineTo = function (...args) { paths.get(this)?.push(point(this, ...args)); return Reflect.apply(line, this, args); };
    p.rect = function (x, y, w, h) {
      paths.get(this)?.push(point(this, x + w / 2, y + h / 2));
      return Reflect.apply(rect, this, [x, y, w, h]);
    };
    p.arc = function (x, y, r, start, end, anticlockwise) {
      const angle = (start + end) / 2;
      paths.get(this)?.push(point(this, x + Math.cos(angle) * r * 0.7, y + Math.sin(angle) * r * 0.7));
      return Reflect.apply(arc, this, [x, y, r, start, end, anticlockwise]);
    };
    const retain = (context: CanvasRenderingContext2D) => {
      if (!owned(context)) return;
      const vertices = paths.get(context) ?? [];
      const current = record(context);
      if (vertices.length) {
        current.points.push({ x: vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length,
          y: vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length });
        current.points.push(...vertices.slice(0, 12));
      }
      if (current.points.length > 4000) current.points.splice(0, 2000);
    };
    p.fill = function (...args: [fillRule?: CanvasFillRule] | [path: Path2D, fillRule?: CanvasFillRule]) { retain(this); return Reflect.apply(fill, this, args); };
    p.stroke = function (...args: [] | [path: Path2D]) { retain(this); return Reflect.apply(stroke, this, args); };
    p.fillText = function (...args) {
      if (owned(this)) {
        const label = String(args[0]);
        record(this).text.push(label);
        if (/^\d{4}-\d{2}-\d{2}$/.test(label)) record(this).dates.push({ text: label, x: point(this, args[1], args[2]).x });
      }
      return Reflect.apply(text, this, args);
    };
    p.clearRect = function (...args) {
      if (owned(this) && args[2] >= this.canvas.width && args[3] >= this.canvas.height)
        records.set(this.canvas, { text: [], points: [], dates: [] });
      return Reflect.apply(clear, this, args);
    };
    (window as unknown as { galleryPaint: typeof records }).galleryPaint = records;
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

export function chartWidget(page: Page, type: string) {
  return page.locator(`.widget-qopenbb_gallery_${type}`).filter({ visible: true }).last();
}

export async function paint(widget: Locator): Promise<Paint> {
  return widget.locator("canvas").first().evaluate((canvas) =>
    (window as unknown as { galleryPaint: WeakMap<HTMLCanvasElement, Paint> }).galleryPaint.get(canvas as HTMLCanvasElement) ?? { text: [], points: [], dates: [] });
}

export function verifyLineDates(measured: Paint) {
  const dates: string[] = snapshot.datasets["january-prices"].results.map((row: { date: string }) => row.date);
  const labels = [...new Map(measured.dates.map((label) => [label.text, label])).values()]
    .map((label) => ({ ...label, session: dates.indexOf(label.text) })).filter((label) => label.session >= 0)
    .sort((a, b) => a.session - b.session);
  expect(labels.length, "Line axis paints actual ISO trading dates").toBeGreaterThanOrEqual(3);
  const gaps = labels.slice(1).map((label, index) => ({
    sessions: label.session - labels[index].session,
    calendarDays: (Date.parse(label.text) - Date.parse(labels[index].text)) / 86400000,
  }));
  expect(new Set(gaps.map((gap) => gap.calendarDays / gap.sessions)).size,
    "Painted dates distinguish trading-session spacing from calendar-time spacing").toBeGreaterThan(1);
  const first = labels[0];
  const last = labels.at(-1)!;
  const pixelsPerSession = (last.x - first.x) / (last.session - first.session);
  expect(pixelsPerSession, "Trading-session category axis runs chronologically").toBeGreaterThan(0);
  for (const label of labels)
    expect(Math.abs(label.x - first.x - (label.session - first.session) * pixelsPerSession), "Trading sessions have equal spacing across calendar gaps").toBeLessThan(1);
  return { labels, gaps, pixelsPerSession };
}

export async function settle(page: Page, widget: Locator) {
  await expect(widget.locator("canvas").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(0, 0);
  let previous = "";
  let repeats = 0;
  // Several unchanged samples span ECharts' initial animation. One matching
  // frame immediately after hydration is insufficient evidence of settled data.
  await expect.poll(async () => {
    const next = (await widget.locator("canvas").first().screenshot()).toString("base64");
    repeats = next === previous ? repeats + 1 : 0;
    previous = next;
    return repeats;
  }, { intervals: [350], timeout: 20000 }).toBeGreaterThanOrEqual(4);
  return paint(widget);
}

export async function chooseTab(page: Page, name: string) {
  await page.locator("main").getByRole("button", { name, exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("tab") === name);
}

export async function galleryCard(page: Page) {
  await page.getByRole("link", { name: "Apps", exact: true }).click();
  const card = page.getByRole("button").filter({ has: page.getByText(gallery.name, { exact: true }) });
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page).toHaveURL(/\/app\/[^/?]+/);
}

export async function connectGallery(page: Page) {
  await page.getByRole("link", { name: "Apps", exact: true }).click();
  const existing = page.getByRole("button").filter({ has: page.getByText(gallery.name, { exact: true }) });
  const available = await existing.waitFor({ state: "visible", timeout: 15000 }).then(() => true, (error) => {
    if (error.name === "TimeoutError") return false;
    throw error;
  });
  if (available) {
    await existing.click();
    await expect(chartWidget(page, "line")).toBeVisible();
    return;
  }
  await page.goto("/app/connections");
  await page.getByRole("button", { name: "Connect Backend", exact: true }).first().click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Connect backend", exact: true }) });
  await dialog.getByPlaceholder("OpenBB App").fill("Installed QOpenBB historical snapshots");
  await dialog.getByPlaceholder("http://127.0.0.1:5056").fill(`${process.env.WORKSPACE_FRONTEND_ORIGIN}/data`);
  const discovery = page.waitForResponse((r) => new URL(r.url()).pathname === "/data/apps.json");
  await dialog.getByRole("button", { name: "Test", exact: true }).click();
  const response = await discovery;
  expect(response.status()).toBe(200);
  expect(await response.json()).toContainEqual(gallery);
  await expect(dialog.getByText("Test successful", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /^add$/i }).click();
  await expect(dialog).not.toBeVisible();
  // The success toast opens every app, including live-provider starters. Choose
  // this template's ordinary AppCard so snapshot verification stays offline.
  await galleryCard(page);
  await expect(chartWidget(page, "line")).toBeVisible();
}

export async function resizeChart(page: Page, widget: Locator) {
  await widget.scrollIntoViewIfNeeded();
  const before = await widget.boundingBox();
  const handle = page.locator(".react-grid-item").filter({ has: widget }).locator(".react-resizable-handle-se");
  const grip = await handle.boundingBox();
  if (!before || !grip) throw Error("Native gallery resize handle required");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 125, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await widget.boundingBox())?.height ?? 0).toBeGreaterThan(before.height + 75);
  return { before, after: await widget.boundingBox() };
}

export async function financialTooltip(page: Page, widget: Locator, type: string) {
  const spec = contract.charts[type];
  const sourceRows = snapshot.datasets[spec.datasetId].results as Record<string, unknown>[];
  const symbol = spec.state.filterModel?.default?.symbol?.filter;
  const rows = symbol ? sourceRows.filter((row) => row.symbol === symbol) : sourceRows;
  const model = spec.state.chartModel ?? spec.state.storage?.default?.chartModel;
  const flow = type === "sankey" ? spec.state.storage.default.sankey.sankeySetup : undefined;
  const fields = (flow ? [flow.sourceColumnId, flow.targetColumnId, flow.valueColumnId] : model.cellRange.columns) as string[];
  const values = rows.flatMap((row) => fields.map((field) => row[field])).filter((v): v is number => typeof v === "number");
  const candidates = new Set(values.flatMap((v) => [v.toLocaleString("en-US"), v.toFixed(2), Number(v.toFixed(2)).toLocaleString("en-US")]));
  const canvas = widget.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw Error("Gallery canvas bounds required");
  const points = (await paint(widget)).points;
  const unique = [...new Map(points.map((p) => [`${Math.round(p.x)}:${Math.round(p.y)}`, p])).values()];
  const tooltip = widget.locator('div[style*="z-index: 9999999"][style*="pointer-events: none"]').filter({ visible: true }).last();
  const observed = new Set<string>();
  for (const p of unique.slice(0, 350)) {
    if (p.x < 5 || p.y < 25 || p.x >= box.width - 5 || p.y >= box.height - 5) continue;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    if (!(await tooltip.count())) continue;
    const text = await tooltip.innerText();
    observed.add(text);
    if (type === "line") {
      const row = rows.find((candidate) => text.split(/\r?\n/).includes(String(candidate.date)));
      if (!row) continue;
      const matchedField = fields.slice(1).find((field) => {
        const label = snapshot.datasets[spec.datasetId].metadata.columns.find((column: { field: string }) => column.field === field)?.label;
        const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${label}: `));
        if (!line) return false;
        const displayed = Number(line.slice(label.length + 2).replaceAll(",", ""));
        return Number.isFinite(displayed) && Math.abs(displayed - Number(row[field])) < 0.00051;
      });
      if (matchedField) return { text, source: spec.datasetId, fields, tradingDate: row.date, matchedField, price: row[matchedField], unit: "USD/share" };
      continue;
    }
    if (flow) {
      const amount = (label: string, value: number) => [String(value), value.toFixed(2), Number(value.toFixed(2)).toLocaleString("en-US")]
        .some((number) => text.split(/\r?\n/).includes(`${label}: ${number}`));
      const edge = rows.find((row) => text.startsWith(`Source: ${row[flow.sourceColumnId]} (string; identity `) &&
        text.includes(`Target: ${row[flow.targetColumnId]} (string; identity `) && amount("Value", Number(row[flow.valueColumnId])));
      const identities = [...new Set(rows.flatMap((row) => [row[flow.sourceColumnId], row[flow.targetColumnId]]))];
      const node = identities.find((label) => text.startsWith(`${label} (string; identity `));
      const incoming = rows.filter((row) => row[flow.targetColumnId] === node).reduce((sum, row) => sum + Number(row[flow.valueColumnId]), 0);
      const outgoing = rows.filter((row) => row[flow.sourceColumnId] === node).reduce((sum, row) => sum + Number(row[flow.valueColumnId]), 0);
      if (!edge && !(node && (!incoming || amount("Incoming", incoming)) && (!outgoing || amount("Outgoing", outgoing)))) continue;
      for (const [field, value] of Object.entries(flow.metadata))
        expect(text).toContain(`${field[0].toUpperCase() + field.slice(1)}: ${value}`);
      expect(text).toContain("Rows:");
      expect(text).toContain("Provenance (");
      expect(text).not.toContain("Units or allocation scope unspecified");
      return { text, source: spec.datasetId, fields, flow, edge, node, incoming, outgoing };
    }
    if (["boxPlot", "rangeBar", "rangeArea"].includes(type)) {
      const group = [...new Set(rows.map((row) => String(row[fields[0]])))].find((label) => text.includes(label));
      if (!group) continue;
      const sorted = rows.filter((row) => String(row[fields[0]]) === group).map((row) => Number(row[fields[1]])).sort((a, b) => a - b);
      const quantile = (p: number) => {
        const position = (sorted.length - 1) * p;
        const lower = Math.floor(position);
        return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
      };
      const summary = { Min: sorted[0], Q1: quantile(0.25), Median: quantile(0.5), Q3: quantile(0.75), Max: sorted.at(-1)! };
      const selected = type === "boxPlot" ? Object.entries(summary) : [["Min", summary.Min], ["Max", summary.Max]] as [string, number][];
      const matches = selected.every(([label, value]) => [String(value), value.toFixed(2), Number(value.toFixed(2)).toLocaleString("en-US")]
        .some((number) => text.includes(type === "boxPlot" ? `${label}: ${number}` : number)));
      if (matches) return { text, group, summary, observations: sorted.length, source: spec.datasetId, fields, symbolFilter: symbol };
      continue;
    }
    if (type === "histogram") {
      const bins: [number, number][] = model.chartOptions.histogram.series.bins;
      const frequencies = bins.map(([lower, upper], index) => values.filter((v) => v >= lower && (v < upper || (index === bins.length - 1 && v <= upper))).length);
      expect(frequencies.reduce((sum, n) => sum + n, 0)).toBe(values.length);
      const index = bins.findIndex(([lower, upper], i) => text.includes(`: ${lower} - ${upper}`) && text.includes(`Frequency: ${frequencies[i]}`));
      if (index >= 0) return { text, source: spec.datasetId, fields, bins, frequencies, includedObservations: values.length };
      continue;
    }
    const number = [...candidates].find((value) => {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return value.length > 1 && new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(text);
    });
    if (number) return { text, matchedSourceNumber: number, source: spec.datasetId, fields, symbolFilter: symbol };
  }
  throw Error(`${type}: no native tooltip reconciles to selected snapshot fields; observed=${JSON.stringify([...observed].slice(0, 8))}`);
}

export function verifySaved(content: any, edited = false) {
  const widgets = content.data.widgets.filter((w: any) => w.widgetId.startsWith("qopenbb_gallery_"));
  expect(new Set(widgets.map((w: any) => w.widgetId)).size).toBe(36);
  for (const widget of widgets) {
    const type = widget.widgetId.replace("qopenbb_gallery_", "");
    const state = contract.charts[type].state;
    const model = widget.storage.default.chartModel;
    expect(widget.storage.chartView).toMatchObject(state.chartView);
    const expected = structuredClone(state.chartModel ?? state.storage?.default?.chartModel);
    if (edited && type === "customCombo") expected.seriesChartTypes[1].chartType = "area";
    expect(model).toMatchObject(expected);
    if (["columnLineCombo", "areaColumnCombo"].includes(type)) expect(model.seriesChartTypes ?? []).toEqual([]);
    if (state.filterModel) expect(widget.data.table.filterModel).toEqual(state.filterModel);
    if (state.storage) expect(widget.storage.default.sankey).toEqual(state.storage.default.sankey);
  }
  return widgets.length;
}
