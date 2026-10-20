import { readFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";
import { exportChart } from "./actions";

export type Interval = readonly [number, number];
type Anchor = { x: number; y: number; text: string };
export type Rectangle = { x: number; y: number; width: number; height: number;
  fill: string; stroke: string; alpha: number; strokeAlpha?: number; lineWidth: number; dash: number[]; shadowBlur: number };
type Drawing = { rectangles: Rectangle[]; text: Anchor[] };
type ObservedWindow = Window & { histogramDrawing: Drawing };

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const canvas = page.locator('[class*="widget-file-"] canvas').first();
  if (!(await canvas.count())) return;
  await info.attach("failed-public-histogram-drawing", { body: JSON.stringify(await page.evaluate(() =>
    (window as unknown as ObservedWindow).histogramDrawing)), contentType: "application/json" });
  await canvas.screenshot({ path: info.outputPath("failed-public-histogram.png") });
});

// Observe public canvas geometry, never ECharts internals or the production bin calculator.
export async function observeHistogram(page: Page) {
  const install = () => {
    const target = window as unknown as ObservedWindow;
    target.histogramDrawing = { rectangles: [], text: [] };
    const owned = (context: CanvasRenderingContext2D) =>
      context.canvas.closest('[class*="widget-file-"]')?.querySelector("canvas") === context.canvas;
    const point = (context: CanvasRenderingContext2D, x: number, y: number) => {
      const transformed = context.getTransform().transformPoint(new DOMPoint(x, y));
      const scale = context.canvas.getBoundingClientRect().width / context.canvas.width;
      return { x: transformed.x * scale, y: transformed.y * scale };
    };
    const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number; width: number; height: number }[]>();
    const prototype = CanvasRenderingContext2D.prototype;
    const begin = prototype.beginPath;
    prototype.beginPath = function () { paths.set(this, []); return Reflect.apply(begin, this, []); };
    const rect = prototype.rect;
    prototype.rect = function (x, y, width, height) {
      if (owned(this)) {
        const first = point(this, x, y), last = point(this, x + width, y + height);
        const path = paths.get(this) ?? [];
        path.push({ x: Math.min(first.x, last.x), y: Math.min(first.y, last.y),
          width: Math.abs(last.x - first.x), height: Math.abs(last.y - first.y) });
        paths.set(this, path);
      }
      return Reflect.apply(rect, this, [x, y, width, height]);
    };
    const fill = prototype.fill;
    prototype.fill = function (...args: Parameters<CanvasRenderingContext2D["fill"]>) {
      if (owned(this)) for (const rectangle of paths.get(this) ?? []) {
        target.histogramDrawing.rectangles.push({ ...rectangle, fill: String(this.fillStyle), stroke: String(this.strokeStyle),
          alpha: this.globalAlpha, lineWidth: this.lineWidth, dash: this.getLineDash(), shadowBlur: this.shadowBlur });
      }
      return Reflect.apply(fill, this, args);
    };
    const stroke = prototype.stroke;
    prototype.stroke = function (...args: Parameters<CanvasRenderingContext2D["stroke"]>) {
      if (owned(this)) for (const rectangle of paths.get(this) ?? []) {
        const filled = target.histogramDrawing.rectangles.findLast(item => item.x === rectangle.x && item.y === rectangle.y &&
          item.width === rectangle.width && item.height === rectangle.height);
        if (filled) { filled.stroke = String(this.strokeStyle); filled.strokeAlpha = this.globalAlpha; }
      }
      return Reflect.apply(stroke, this, args);
    };
    const text = prototype.fillText;
    prototype.fillText = function (...args) {
      if (owned(this)) target.histogramDrawing.text.push({ ...point(this, args[1], args[2]), text: String(args[0]) });
      return Reflect.apply(text, this, args);
    };
    const clear = prototype.clearRect;
    prototype.clearRect = function (...args) {
      if (owned(this) && args[2] >= this.canvas.width && args[3] >= this.canvas.height)
        target.histogramDrawing = { rectangles: [], text: [] };
      return Reflect.apply(clear, this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

export async function currentHistogram(page: Page, widget: Locator) {
  await page.mouse.move(0, 0);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Explicit isolated viewport required");
  const canvas = widget.locator("canvas").first();
  const width = await canvas.evaluate(element => (element as HTMLCanvasElement).width);
  await page.setViewportSize({ ...viewport, width: viewport.width + 64 });
  await expect.poll(() => canvas.evaluate(element => (element as HTMLCanvasElement).width)).not.toBe(width);
  await page.evaluate(() => { (window as unknown as ObservedWindow).histogramDrawing = { rectangles: [], text: [] }; });
  await page.setViewportSize(viewport);
  await expect.poll(() => canvas.evaluate(element => (element as HTMLCanvasElement).width)).toBe(width);
  let previous = "";
  await expect.poll(async () => {
    const drawing = await page.evaluate(() => (window as unknown as ObservedWindow).histogramDrawing);
    const state = JSON.stringify(drawing);
    const stable = drawing.text.length > 0 && state === previous;
    previous = state;
    return stable;
  }).toBe(true);
  return page.evaluate(() => (window as unknown as ObservedWindow).histogramDrawing);
}

export function frequencyOracle(values: readonly (number | null)[], intervals: readonly Interval[]) {
  const frequencies = intervals.map(() => 0);
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    // Retained compatibility includes the final-bin catch-all; this is deliberately not a density histogram.
    const index = intervals.findIndex(([lower, upper], index) => value >= lower && value < upper ||
      index === intervals.length - 1 && value <= upper);
    if (index >= 0) frequencies[index]++;
  }
  return intervals.flatMap((interval, index) => frequencies[index] ? [{ interval, frequency: frequencies[index] }] : []);
}

function numeric(text: string) {
  const match = text.replaceAll(",", "").replaceAll("−", "-").trim().match(/^([-+]?\d*\.?\d+)\s*([KMBT])?$/i);
  const magnitudes: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return match ? Number(match[1]) * (magnitudes[match[2]?.toLowerCase()] ?? 1) : NaN;
}

export function histogramAxes(drawing: Drawing) {
  const ticks = drawing.text.filter(anchor => Number.isFinite(numeric(anchor.text)));
  const groups = (axis: "x" | "y") => {
    const groups = new Map<number, Anchor[]>();
    for (const tick of ticks) { const key = Math.round(tick[axis]); groups.set(key, [...(groups.get(key) ?? []), tick]); }
    return [...groups.values()];
  };
  const distinct = (group: Anchor[]) => [...new Map(group.map(tick => [numeric(tick.text), tick])).values()];
  const rectangles = [...new Map(drawing.rectangles.filter(rect => rect.width > 1 && rect.height > 1)
    .map(rect => [JSON.stringify([rect.x, rect.y, rect.width, rect.height]), rect])).values()];
  const baselines = new Map<number, Rectangle[]>();
  for (const rect of rectangles) {
    const bottom = Math.round((rect.y + rect.height) * 10) / 10;
    baselines.set(bottom, [...(baselines.get(bottom) ?? []), rect]);
  }
  // Positive frequencies share one zero baseline; an overview has a later baseline.
  const main = [...baselines.values()].sort((a, b) => b.length - a.length ||
    a[0].y + a[0].height - b[0].y - b[0].height)[0] ?? [];
  const top = Math.min(...main.map(rect => rect.y)), bottom = Math.max(...main.map(rect => rect.y + rect.height));
  const x = groups("y").map(distinct).filter(group => group.length >= 2 &&
    Math.max(...group.map(tick => tick.x)) - Math.min(...group.map(tick => tick.x)) > 40 &&
    group.every(tick => tick.y < top - 2 || tick.y > bottom + 2))
    .sort((a, b) => a[0].y - b[0].y)[0];
  expect(x, "numeric X ticks must expose the raw value scale").toBeDefined();
  const zero = (group: Anchor[]) => {
    const sorted = [...group].sort((a, b) => numeric(a.text) - numeric(b.text));
    const first = sorted[0], last = sorted.at(-1)!;
    return first.y - numeric(first.text) * (last.y - first.y) / (numeric(last.text) - numeric(first.text));
  };
  // Count labels and overview X ticks can share a column; only a count axis maps zero to a bar baseline.
  const y = groups("x").map(distinct).filter(group => group.length >= 2 &&
    Math.max(...group.map(tick => tick.y)) - Math.min(...group.map(tick => tick.y)) > 40 &&
    [...baselines.keys()].some(baseline => Math.abs(zero(group) - baseline) < 2))
    .sort((a, b) => zero(a) - zero(b) || (Math.max(...b.map(p => p.y)) - Math.min(...b.map(p => p.y))) -
      (Math.max(...a.map(p => p.y)) - Math.min(...a.map(p => p.y))))[0];
  expect(y, "dimensionless Frequency ticks must expose the count scale").toBeDefined();
  const mapping = (anchors: Anchor[], axis: "x" | "y") => {
    const sorted = [...anchors].sort((a, b) => numeric(a.text) - numeric(b.text));
    const first = sorted[0], last = sorted.at(-1)!;
    const scale = (last[axis] - first[axis]) / (numeric(last.text) - numeric(first.text));
    const position = (value: number) => first[axis] + (value - numeric(first.text)) * scale;
    for (const tick of sorted) expect(Math.abs(position(numeric(tick.text)) - tick[axis])).toBeLessThan(2);
    return { scale, position, ticks: sorted };
  };
  return { x: mapping(x, "x"), y: mapping(y, "y") };
}

export function matchHistogram(drawing: Drawing, values: readonly (number | null)[], intervals: readonly Interval[]) {
  const expected = frequencyOracle(values, intervals), axes = histogramAxes(drawing);
  expect(axes.x.scale).toBeGreaterThan(0);
  expect(axes.y.scale).toBeLessThan(0);
  const candidates = drawing.rectangles.filter(rect => rect.width > 1 && rect.height > 1 &&
    Math.abs(rect.y + rect.height - axes.y.position(0)) < 8);
  const unique = [...new Map(candidates.map(rect => [[rect.x, rect.y, rect.width, rect.height].map(v => Math.round(v * 100)).join(":"), rect])).values()];
  expect(unique, "only occupied intervals create main-plot rectangles").toHaveLength(expected.length);
  const matches = expected.map(bin => {
    const lower = axes.x.position(bin.interval[0]), upper = axes.x.position(bin.interval[1]);
    const matched = unique.find(rect => Math.abs(rect.x - lower) < 2 && Math.abs(rect.x + rect.width - upper) < 2);
    expect(matched, `raw interval ${bin.interval.join(" to ")} must retain its numeric width`).toBeDefined();
    expect(Math.abs(matched!.height + axes.y.scale * bin.frequency), `frequency ${bin.frequency} controls rectangle height`).toBeLessThan(2);
    return { ...bin, rectangle: matched! };
  });
  expect(new Set(matches.map(match => match.rectangle)).size).toBe(expected.length);
  return { matches, axes };
}

export async function hoverHistogram(page: Page, widget: Locator, rectangle: Rectangle) {
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Visible histogram canvas required");
  await page.mouse.move(box.x + rectangle.x + rectangle.width / 2, box.y + rectangle.y + rectangle.height / 2);
}

export async function assertHistogramExport(page: Page, widget: Locator, info: TestInfo, rectangles: Rectangle[]) {
  await page.mouse.move(0, 0);
  const source = await widget.locator("canvas").first().evaluate(canvas => ({
    url: (canvas as HTMLCanvasElement).toDataURL("image/png"), width: (canvas as HTMLCanvasElement).width,
    height: (canvas as HTMLCanvasElement).height, cssWidth: canvas.getBoundingClientRect().width,
  }));
  await exportChart(page, widget, info);
  const bytes = await readFile(info.outputPath("saved-ordinary-observations.png"));
  const results = await page.evaluate(async ({ source, exported, rectangles }) => {
    const decode = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0, source.width, source.height);
      return context.getImageData(0, 0, source.width, source.height).data;
    };
    const [original, image] = await Promise.all([decode(source.url), decode(exported)]);
    const scale = source.width / source.cssWidth;
    return rectangles.map(rect => {
      let matching = 0, compared = 0;
      for (let y = Math.max(0, Math.floor((rect.y - 3) * scale)); y < Math.min(source.height, (rect.y + rect.height + 3) * scale); y += 2) {
        for (let x = Math.max(0, Math.floor((rect.x - 3) * scale)); x < Math.min(source.width, (rect.x + rect.width + 3) * scale); x += 2) {
          const index = (y * source.width + x) * 4, channels = original[index + 3] === 0 ? [3] : [0, 1, 2, 3];
          matching += Number(channels.every(channel => Math.abs(original[index + channel] - image[index + channel]) <= 6));
          compared++;
        }
      }
      return { compared, fraction: matching / compared };
    });
  }, { source, exported: `data:image/png;base64,${bytes.toString("base64")}`, rectangles });
  for (const result of results) {
    expect(result.compared).toBeGreaterThan(20);
    expect(result.fraction, "PNG retains each independently verified bin interior and border").toBeGreaterThan(0.97);
  }
}
