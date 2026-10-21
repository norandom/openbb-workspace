import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";
import { exportChart } from "./actions";

export type Arc = { x: number; y: number; radius: number; start: number; end: number; anticlockwise: boolean };
export type Sector = Arc & { inner: number; fill: string; stroke: string; alpha: number; lineWidth: number; shadowBlur: number };
export type Text = { text: string; x: number; y: number; width: number; font: string; fill: string;
  bounds: { x: number; y: number; width: number; height: number } };
export type Drawing = { sectors: Sector[]; text: Text[]; outlines: Arc[]; lines: { width: number; points: { x: number; y: number }[] }[] };
type Observed = Window & { pieDrawing: Drawing };

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const canvas = page.locator('[class*="widget-file-"] canvas').first();
  if (!(await canvas.count())) return;
  await info.attach("failed-public-pie-drawing", { body: JSON.stringify(await page.evaluate(() =>
    (window as unknown as Observed).pieDrawing)), contentType: "application/json" });
  await info.attach("failed-pie-canvas-dimensions", { body: JSON.stringify(await canvas.evaluate(c => ({
    width: (c as HTMLCanvasElement).width, height: (c as HTMLCanvasElement).height,
    css: c.getBoundingClientRect().toJSON(), dpr: window.devicePixelRatio,
  }))), contentType: "application/json" });
  await canvas.screenshot({ path: info.outputPath("failed-public-pie.png") });
});

// Public drawing calls expose hit targets and visible paint; no chart engine state is inspected.
export async function observePie(page: Page) {
  const install = () => {
    const target = window as unknown as Observed;
    target.pieDrawing = { sectors: [], text: [], outlines: [], lines: [] };
    const owned = (c: CanvasRenderingContext2D) => c.canvas.closest('[class*="widget-file-"]')?.querySelector("canvas") === c.canvas;
    const point = (c: CanvasRenderingContext2D, x: number, y: number) => {
      const p = c.getTransform().transformPoint(new DOMPoint(x, y));
      const scale = c.canvas.getBoundingClientRect().width / c.canvas.width;
      return { x: p.x * scale, y: p.y * scale };
    };
    const paths = new WeakMap<CanvasRenderingContext2D, Arc[]>();
    const lines = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }[]>();
    const closed = new WeakSet<CanvasRenderingContext2D>();
    const curved = new WeakSet<CanvasRenderingContext2D>();
    const legendMarker = (context: CanvasRenderingContext2D, arc: Arc) => {
      const canvas = context.canvas.getBoundingClientRect();
      const controls = context.canvas.closest('[class*="widget-file-"]')
        ?.querySelectorAll('[role="group"][aria-label="Chart legend"] [role="switch"]') ?? [];
      return [...controls].some(control => {
        const box = control.getBoundingClientRect(), x = canvas.x + arc.x, y = canvas.y + arc.y;
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      });
    };
    const p = CanvasRenderingContext2D.prototype;
    const begin = p.beginPath, arc = p.arc, fill = p.fill, stroke = p.stroke, text = p.fillText, clear = p.clearRect;
    const move = p.moveTo, line = p.lineTo, close = p.closePath, bezier = p.bezierCurveTo, quadratic = p.quadraticCurveTo;
    p.beginPath = function () { paths.set(this, []); lines.set(this, []); closed.delete(this); curved.delete(this); return Reflect.apply(begin, this, []); };
    p.closePath = function () { closed.add(this); return Reflect.apply(close, this, []); };
    p.bezierCurveTo = function (...args) { curved.add(this); return Reflect.apply(bezier, this, args); };
    p.quadraticCurveTo = function (...args) { curved.add(this); return Reflect.apply(quadratic, this, args); };
    p.moveTo = function (...args) { lines.set(this, [point(this, ...args)]); return Reflect.apply(move, this, args); };
    p.lineTo = function (...args) { lines.get(this)?.push(point(this, ...args)); return Reflect.apply(line, this, args); };
    p.arc = function (x, y, radius, start, end, anticlockwise = false) {
      if (owned(this)) {
        const scale = this.canvas.getBoundingClientRect().width / this.canvas.width;
        const transform = this.getTransform();
        const arcs = paths.get(this) ?? [];
        arcs.push({ ...point(this, x, y), radius: radius * Math.hypot(transform.a, transform.b) * scale, start, end, anticlockwise });
        paths.set(this, arcs);
      }
      return Reflect.apply(arc, this, [x, y, radius, start, end, anticlockwise]);
    };
    p.fill = function (...args: [fillRule?: CanvasFillRule] | [path: Path2D, fillRule?: CanvasFillRule]) {
      const arcs = paths.get(this) ?? [];
      const outer = [...arcs].sort((a, b) => b.radius - a.radius)[0];
      const color = String(this.fillStyle);
      // A closed sector uses concentric arcs and straight radial edges. Marker
      // size cannot distinguish it: a valid inner ring can be smaller than 15px.
      const sectorPath = outer && closed.has(this) && !curved.has(this) &&
        arcs.every(a => Math.hypot(a.x - outer.x, a.y - outer.y) < 0.01);
      if (owned(this) && outer && outer.radius > 0 && sectorPath && !legendMarker(this, outer) && this.globalAlpha > 0 && color !== "transparent" && !/rgba\([^)]*,\s*0\s*\)/.test(color)) {
        target.pieDrawing.sectors.push({ ...outer, inner: Math.min(outer.radius, ...arcs.filter(a => a !== outer).map(a => a.radius), ...(arcs.length === 1 ? [0] : [])),
          fill: color, stroke: String(this.strokeStyle), alpha: this.globalAlpha, lineWidth: this.lineWidth, shadowBlur: this.shadowBlur });
      }
      return Reflect.apply(fill, this, args);
    };
    p.stroke = function (...args: [] | [path: Path2D]) {
      if (owned(this)) {
        const arcs = paths.get(this) ?? [];
        for (const a of arcs) {
          const sector = target.pieDrawing.sectors.findLast(s => Math.abs(s.radius - a.radius) < 0.01 && s.start === a.start && s.end === a.end);
          if (sector) { sector.stroke = String(this.strokeStyle); sector.lineWidth = this.lineWidth; }
          else if (a.radius > 0 && !legendMarker(this, a)) target.pieDrawing.outlines.push(a);
        }
        const points = lines.get(this) ?? [];
        if (!arcs.length && points.length > 1) target.pieDrawing.lines.push({ width: this.lineWidth, points: [...points] });
      }
      return Reflect.apply(stroke, this, args);
    };
    p.fillText = function (...args) {
      if (owned(this)) {
        const metrics = this.measureText(String(args[0]));
        const top = point(this, args[1] - metrics.actualBoundingBoxLeft, args[2] - metrics.actualBoundingBoxAscent);
        const bottom = point(this, args[1] + metrics.actualBoundingBoxRight, args[2] + metrics.actualBoundingBoxDescent);
        target.pieDrawing.text.push({ ...point(this, args[1], args[2]), text: String(args[0]),
          width: metrics.width, font: this.font, fill: String(this.fillStyle),
          bounds: { ...top, width: bottom.x - top.x, height: bottom.y - top.y } });
      }
      return Reflect.apply(text, this, args);
    };
    p.clearRect = function (...args) {
      if (owned(this) && args[2] >= this.canvas.width && args[3] >= this.canvas.height)
        target.pieDrawing = { sectors: [], text: [], outlines: [], lines: [] };
      return Reflect.apply(clear, this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

export async function currentPie(page: Page, _widget: Locator, requested: (drawing: Drawing) => boolean = () => true) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let previous = "";
  await expect.poll(async () => {
    const d = await page.evaluate(() => (window as unknown as Observed).pieDrawing);
    const state = JSON.stringify(d), stable = requested(d) && state === previous && (d.sectors.length + d.text.length + d.outlines.length > 0);
    previous = state; return stable;
  }, { intervals: [250, 500, 750] }).toBe(true);
  return page.evaluate(() => (window as unknown as Observed).pieDrawing);
}

export function rings(drawing: Drawing) {
  const distinct = new Map<string, Sector>();
  for (const s of drawing.sectors) if (Math.abs(s.end - s.start) > 1e-5)
    distinct.set([s.radius, s.start, s.end, s.inner].map(n => n.toFixed(4)).join(":"), s);
  const grouped = new Map<string, Sector[]>();
  for (const s of distinct.values()) {
    const key = [s.radius, s.inner].map(n => n.toFixed(3)).join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), s]);
  }
  const fromTop = (start: number) => {
    const angle = Math.atan2(Math.sin(start + Math.PI / 2), Math.cos(start + Math.PI / 2));
    return angle < -1e-6 ? angle + Math.PI * 2 : Math.max(0, angle);
  };
  return [...grouped.values()].sort((a, b) => b[0].radius - a[0].radius).map(group => group.sort((a, b) => fromTop(a.start) - fromTop(b.start)));
}

export async function verifyRings(page: Page, widget: Locator, expected: { field: string; categories: string[]; values: number[] }[]) {
  const drawing = await currentPie(page, widget, drawing => {
    const rendered = rings(drawing);
    return rendered.length === expected.length && expected.every((ring, index) => {
      const total = ring.values.reduce((sum, value) => sum + Math.max(0, value), 0);
      return rendered[index].length === ring.values.length && rendered[index].every((s, i) =>
        Math.abs(Math.abs(s.end - s.start) / (Math.PI * 2) - ring.values[i] / total) < 1e-5);
    });
  }), rendered = rings(drawing);
  expect(rendered, "visible rings follow selected numeric field order").toHaveLength(expected.length);
  for (const [index, ring] of expected.entries()) {
    const sectors = rendered[index];
    expect(sectors).toHaveLength(ring.values.length);
    const total = ring.values.reduce((sum, value) => sum + Math.max(0, value), 0);
    for (const [i, sector] of sectors.entries()) {
      expect(Math.abs(sector.end - sector.start) / (Math.PI * 2), `${ring.field} uses its own positive total`).toBeCloseTo(ring.values[i] / total, 5);
      await hoverSector(page, widget, sector);
      const tooltip = page.getByText(new RegExp(`${ring.field}:\\s`)).last();
      await expect(tooltip).toContainText(ring.categories[i]);
      await expect(tooltip).toContainText(`${ring.field}: ${ring.values[i].toLocaleString("en-US")}`);
      for (const other of expected.filter(r => r.field !== ring.field)) await expect(tooltip).not.toContainText(`${other.field}:`);
    }
  }
  await page.mouse.move(0, 0);
  return drawing;
}

export async function hoverSector(page: Page, widget: Locator, sector: Sector) {
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Visible pie canvas required");
  const angle = (sector.start + sector.end) / 2, radius = (sector.radius + sector.inner) / 2;
  await page.mouse.move(box.x + sector.x + Math.cos(angle) * radius, box.y + sector.y + Math.sin(angle) * radius);
}

async function clickCanvasControl(page: Page, widget: Locator, control: Locator) {
  const target = await control.boundingBox();
  const canvas = await widget.locator("canvas").first().boundingBox();
  if (!target || !canvas) throw new Error("Visible native canvas control bounds required");
  const x = target.x + target.width / 2, y = target.y + target.height / 2;
  expect(x).toBeGreaterThanOrEqual(canvas.x); expect(x).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(y).toBeGreaterThanOrEqual(canvas.y); expect(y).toBeLessThanOrEqual(canvas.y + canvas.height);
  await page.mouse.click(x, y);
}

export async function clickLegend(page: Page, widget: Locator, label: string, occurrence = 0, activation: "keyboard" | "canvas" = "keyboard") {
  const control = widget.getByRole("group", { name: "Chart legend", exact: true })
    .getByRole("switch", { name: label, exact: true }).nth(occurrence);
  const checked = await control.isChecked();
  // Focus exposes an off-page item's native page; the keyboard proxy forwards
  // activation once, while canvas paint and tooltips prove the actual effect.
  if (activation === "keyboard") {
    await control.focus();
    await expect(control).toBeFocused();
    await currentPie(page, widget, d => d.text.some(t => t.text === label));
    await control.press("Enter");
  } else {
    await currentPie(page, widget, d => d.text.some(t => t.text === label));
    await clickCanvasControl(page, widget, control);
  }
  if (checked) await expect(control).not.toBeChecked();
  else await expect(control).toBeChecked();
  await control.blur();
}

export async function firstLegendPage(widget: Locator) {
  const previous = widget.getByRole("button", { name: "Previous legend page", exact: true });
  if (!(await previous.count())) return;
  for (let step = 0; step < 16 && await previous.isEnabled(); step++) {
    await previous.focus(); await previous.press("Enter");
  }
  await expect(previous).toBeDisabled();
  await expect(widget.getByRole("status").filter({ hasText: /^Legend page / })).toHaveText(/^Legend page 1 of \d+$/);
  await previous.blur();
}

export async function nextLegendPage(page: Page, widget: Locator, activation: "keyboard" | "canvas" = "keyboard") {
  const status = widget.getByRole("status").filter({ hasText: /^Legend page / });
  const before = await status.innerText();
  const next = widget.getByRole("button", { name: "Next legend page", exact: true });
  await expect(next).toBeEnabled();
  if (activation === "keyboard") { await next.focus(); await next.press("Enter"); }
  else await clickCanvasControl(page, widget, next);
  await expect(status).not.toHaveText(before);
  await next.blur();
}

export async function reachableLegend(page: Page, widget: Locator, labels: readonly string[],
  inspect: (drawing: Drawing, visible: Text[]) => void = () => undefined) {
  const group = widget.getByRole("group", { name: "Chart legend", exact: true });
  await expect(group).toBeVisible();
  await expect(group.getByRole("switch")).toHaveCount(labels.length);
  for (const label of labels) await expect(group.getByRole("switch", { name: label, exact: true })).toHaveCount(1);
  await firstLegendPage(widget);
  const pages: string[][] = [];
  const next = widget.getByRole("button", { name: "Next legend page", exact: true });
  let preceding: string[] | undefined;
  for (let count = 0; count < labels.length; count++) {
    const drawing = await currentPie(page, widget, d => {
      const visible = d.text.filter(t => labels.includes(t.text)).map(t => t.text);
      return visible.length > 0 && (preceding === undefined || JSON.stringify(visible) !== JSON.stringify(preceding));
    });
    const visible = drawing.text.filter(t => labels.includes(t.text));
    inspect(drawing, visible); pages.push(visible.map(t => t.text));
    if (!(await next.count()) || await next.isDisabled()) break;
    preceding = pages.at(-1); await nextLegendPage(page, widget);
  }
  expect(pages.flat(), "every native legend item is reachable exactly once through paging").toEqual([...labels]);
  if (await next.count()) await expect(next).toBeDisabled();
  await firstLegendPage(widget);
  await currentPie(page, widget, d => JSON.stringify(d.text.filter(t => labels.includes(t.text)).map(t => t.text)) === JSON.stringify(pages[0]));
  return pages;
}

export async function toggle(scope: Locator, name: string, enabled: boolean) {
  const control = scope.getByRole("switch", { name, exact: true });
  if ((await control.getAttribute("aria-checked") === "true") !== enabled) await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(enabled));
}

export async function setupPie(editor: Locator, category: string, fields: string[]) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: category });
  await toggle(editor, "Aggregate", false);
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  for (const field of fields) await editor.getByRole("combobox", { name: "Add a series", exact: true }).selectOption({ label: field });
}

export async function setTheme(page: Page, dark: boolean) {
  if (((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false) === dark) return;
  const canvas = page.locator('[class*="widget-file-"] canvas').first();
  const before = await canvas.screenshot();
  const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/pro/display-settings");
  await page.keyboard.press("Control+m");
  expect((await response).ok()).toBe(true);
  await expect.poll(async () => (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false).toBe(dark);
  await expect.poll(async () => (await canvas.screenshot()).equals(before), { intervals: [250, 500, 750] }).toBe(false);
}

export async function stablePie(page: Page, widget: Locator) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  let previous: Buffer = Buffer.alloc(0);
  await expect.poll(async () => {
    const next = await widget.locator("canvas").first().screenshot();
    const stable = next.equals(previous); previous = next; return stable;
  }, { intervals: [250, 500, 750], timeout: 15000 }).toBe(true);
  return previous;
}

export async function capturePie(page: Page, widget: Locator, info: TestInfo, name: string) {
  const bytes = await stablePie(page, widget);
  await info.attach(name, { body: bytes, contentType: "image/png" });
  await widget.locator("canvas").first().screenshot({ path: info.outputPath(`${name}.png`) });
  const dimensions = await widget.locator("canvas").first().evaluate(c => ({ width: (c as HTMLCanvasElement).width,
    height: (c as HTMLCanvasElement).height, css: c.getBoundingClientRect().toJSON(), dpr: window.devicePixelRatio }));
  const identity = JSON.stringify({ dimensions, sha256: createHash("sha256").update(bytes).digest("hex"),
    source: process.env.QOPENBB_CANDIDATE_SOURCE, image: process.env.QOPENBB_CANDIDATE_IMAGE, origin: new URL(page.url()).origin });
  await writeFile(info.outputPath(`${name}-identity.json`), identity);
  await info.attach(`${name}-identity`, { body: identity, contentType: "application/json" });
}

export async function growPieWidget(page: Page, widget: Locator, info: TestInfo) {
  const canvas = widget.locator("canvas").first();
  const before = await canvas.evaluate(c => ({ width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height }));
  const handle = page.locator(".react-grid-item").filter({ has: page.locator("#chart-view-button") }).last().locator(".react-resizable-handle-se");
  const grip = await handle.boundingBox();
  if (!grip) throw new Error("Owned widget's native resize handle required");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 300, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => canvas.evaluate(c => c.getBoundingClientRect().height)).toBeGreaterThan(before.height + 250);
  const after = await canvas.evaluate(c => ({ width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height }));
  expect(after.width).toBe(before.width);
  expect(Math.abs(after.height - before.height - 300), "native grid snapping stays within one row of the requested growth").toBeLessThanOrEqual(35);
  await info.attach("styled-widget-resize", { body: JSON.stringify({ before, after, requested_height_growth: 300,
    action: "native grid handle drag after the four matched default captures; styled view uses the larger saved layout" }), contentType: "application/json" });
  return after.height;
}

export async function refreshPie(page: Page, widget: Locator, url: string, csv?: string) {
  const box = await widget.boundingBox();
  if (!box) throw new Error("Visible File widget required");
  await page.mouse.click(box.x + 12, box.y + box.height + 24, { button: "right" });
  const response = page.waitForResponse(r => r.request().method() === "GET" && r.url() === url);
  await page.getByRole("menuitem", { name: "Refresh data", exact: true }).click();
  const read = await response;
  expect(read.ok()).toBe(true); expect(await read.finished()).toBeNull();
  if (csv !== undefined) expect((await read.text()).replaceAll("\r\n", "\n")).toBe(csv.replaceAll("\r\n", "\n"));
}

export async function assertPieExport(page: Page, widget: Locator, info: TestInfo, drawing: Drawing) {
  const legend = widget.getByRole("group", { name: "Chart legend", exact: true });
  const allLabels = await legend.getByRole("switch").evaluateAll(items => items.map(item => item.getAttribute("aria-label")));
  const visibleLegend = drawing.text.filter(t => allLabels.includes(t.text)).map(t => t.text);
  expect(visibleLegend.length, "export includes the currently drawn legend page").toBeGreaterThan(0);
  await info.attach("export-visible-legend-page", { body: JSON.stringify({ labels: visibleLegend,
    status: await widget.getByRole("status").filter({ hasText: /^Legend page / }).allTextContents() }), contentType: "application/json" });
  await stablePie(page, widget);
  const source = await widget.locator("canvas").first().evaluate(c => ({ url: (c as HTMLCanvasElement).toDataURL(),
    width: (c as HTMLCanvasElement).width, height: (c as HTMLCanvasElement).height, cssWidth: c.getBoundingClientRect().width }));
  await exportChart(page, widget, info);
  const bytes = await readFile(info.outputPath("saved-ordinary-observations.png"));
  const outer = rings(drawing)[0][0];
  const regions = [
    { kind: "sector and hole", x: outer.x - outer.radius - 3, y: outer.y - outer.radius - 3, width: outer.radius * 2 + 6, height: outer.radius * 2 + 6 },
    ...drawing.text.map(t => ({ kind: `visible text ${t.text}`, x: t.bounds.x - 1, y: t.bounds.y - 1,
      width: t.bounds.width + 2, height: t.bounds.height + 2 })),
  ];
  expect(regions.length, "export includes visible legend and enabled labels").toBeGreaterThan(5);
  const results = await page.evaluate(async ({ source, exported, regions }) => {
    const decode = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
      const c = canvas.getContext("2d")!; c.drawImage(image, 0, 0, source.width, source.height);
      return c.getImageData(0, 0, source.width, source.height).data;
    };
    const [a, b] = await Promise.all([decode(source.url), decode(exported)]), scale = source.width / source.cssWidth;
    return regions.map(r => {
      let count = 0, same = 0, visible = 0;
      for (let y = Math.max(0, Math.floor(r.y * scale)); y < Math.min(source.height, (r.y + r.height) * scale); y++)
        for (let x = Math.max(0, Math.floor(r.x * scale)); x < Math.min(source.width, (r.x + r.width) * scale); x++) {
          const i = (y * source.width + x) * 4;
          const channels = a[i + 3] === 0 ? [3] : [0, 1, 2, 3];
          same += Number(channels.every(c => Math.abs(a[i + c] - b[i + c]) <= 6)); count++; visible += Number(a[i + 3] > 0);
        }
      return { kind: r.kind, count, visible, fraction: same / count };
    });
  }, { source, exported: `data:image/png;base64,${bytes.toString("base64")}`, regions });
  for (const r of results) { expect(r.count, r.kind).toBeGreaterThan(20); expect(r.visible, r.kind).toBeGreaterThan(0); expect(r.fraction, r.kind).toBeGreaterThan(0.97); }
}
