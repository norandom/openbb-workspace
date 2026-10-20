import { readFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "./fixtures";
import { exportChart } from "./actions";

export type Point = { x: number; y: number; diameter: number };
type Anchor = { x: number; y: number; text: string };
type Segment = { x1: number; y1: number; x2: number; y2: number };
type Drawing = Window & { xyCircles: Point[]; xyTicks: Anchor[]; xySegments: Segment[] };

// Public canvas calls preserve renderer independence and never modify chart state.
export async function observeXy(page: Page) {
  const install = () => {
    const target = window as unknown as Drawing;
    target.xyCircles = [];
    target.xyTicks = [];
    target.xySegments = [];
    const owned = (context: CanvasRenderingContext2D) => context.canvas.closest('[class*="widget-file-"]')?.querySelector("canvas") === context.canvas;
    const position = (context: CanvasRenderingContext2D, x: number, y: number) => {
      const point = context.getTransform().transformPoint(new DOMPoint(x, y));
      const scale = context.canvas.getBoundingClientRect().width / context.canvas.width;
      return { x: point.x * scale, y: point.y * scale };
    };
    const prototype = CanvasRenderingContext2D.prototype;
    const text = prototype.fillText;
    prototype.fillText = function (...args) {
      if (owned(this) && /^[-−+]?[\d,.]+(?:\s?[KMBTkmbt])?$/.test(String(args[0]))) target.xyTicks.push({ ...position(this, args[1], args[2]), text: String(args[0]) });
      return Reflect.apply(text, this, args);
    };
    const moves = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }>();
    const move = prototype.moveTo;
    prototype.moveTo = function (...args) { moves.set(this, position(this, ...args)); return Reflect.apply(move, this, args); };
    const line = prototype.lineTo;
    prototype.lineTo = function (...args) {
      const start = moves.get(this), end = position(this, ...args);
      if (owned(this) && start && Math.abs(end.y - start.y) < 0.1 && Math.abs(end.x - start.x) > 100) {
        target.xySegments.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
      }
      moves.set(this, end);
      return Reflect.apply(line, this, args);
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (owned(this) && args[2] >= this.canvas.width && args[3] >= this.canvas.height) {
        target.xyCircles = []; target.xyTicks = []; target.xySegments = [];
      }
      return Reflect.apply(clear, this, args);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (owned(this) && Math.abs(args[4] - args[3]) >= Math.PI * 1.99) {
        const transform = this.getTransform();
        const point = transform.transformPoint(new DOMPoint(args[0], args[1]));
        const scale = this.canvas.getBoundingClientRect().width / this.canvas.width;
        target.xyCircles.push({ x: point.x * scale, y: point.y * scale,
          diameter: args[2] * 2 * Math.hypot(transform.a, transform.b) * scale });
        if (target.xyCircles.length > 3000) target.xyCircles.splice(0, 1500);
      }
      return Reflect.apply(arc, this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

export async function currentCircles(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Isolated viewport required");
  await page.evaluate(() => { (window as unknown as Drawing).xyCircles = []; });
  await page.setViewportSize({ ...viewport, width: viewport.width + 1 });
  let previous = "";
  await expect.poll(async () => {
    const circles = await page.evaluate(() => (window as unknown as Drawing).xyCircles);
    const state = JSON.stringify(circles.map(p => [p.x, p.y, p.diameter].map(v => Math.round(v * 100) / 100)));
    const stable = circles.length > 0 && state === previous;
    previous = state;
    return stable;
  }).toBe(true);
  const { circles, ticks, segments } = await page.evaluate(() => {
    const drawing = window as unknown as Drawing;
    return { circles: drawing.xyCircles, ticks: drawing.xyTicks, segments: drawing.xySegments };
  });
  const grouped = (axis: "x" | "y") => {
    const groups = new Map<number, Anchor[]>();
    for (const tick of ticks) { const key = Math.round(tick[axis]); groups.set(key, [...(groups.get(key) ?? []), tick]); }
    return [...groups.values()];
  };
  // Numeric X labels identify the upper/main axis; the overview's numeric labels sit below it.
  const horizontal = grouped("y").filter(group => new Set(group.map(tick => tick.x)).size >= 2 && Math.max(...group.map(tick => tick.x)) - Math.min(...group.map(tick => tick.x)) > 100)
    .sort((a, b) => a[0].y - b[0].y)[0];
  expect(horizontal, "main numeric X tick row must be observable").toBeDefined();
  const vertical = grouped("x").filter(group => group.length >= 2 && Math.max(...group.map(tick => tick.y)) < horizontal[0].y + 4 &&
    Math.max(...group.map(tick => tick.y)) - Math.min(...group.map(tick => tick.y)) > 40)
    .sort((a, b) => (Math.max(...b.map(tick => tick.y)) - Math.min(...b.map(tick => tick.y))) - (Math.max(...a.map(tick => tick.y)) - Math.min(...a.map(tick => tick.y))))[0];
  expect(vertical, "main numeric Y tick column must be observable").toBeDefined();
  const top = Math.min(...vertical.map(tick => tick.y)) - 12, bottom = horizontal[0].y - 2;
  const lines = segments.filter(segment => segment.y1 >= top && segment.y1 <= bottom);
  expect(lines.length, "public main-grid line endpoints must bound the numeric plot").toBeGreaterThan(0);
  const left = Math.min(...lines.flatMap(segment => [segment.x1, segment.x2]));
  const right = Math.max(...lines.flatMap(segment => [segment.x1, segment.x2]));
  const mainCircles = circles.filter(point => point.x >= left - 0.2 && point.x <= right + 0.2 && point.y >= top && point.y <= bottom);
  const unique = new Map<string, Point>();
  for (const point of mainCircles) unique.set([point.x, point.y, point.diameter].map(value => Math.round(value * 1000)).join(":"), point);
  return [...unique.values()];
}

// Distinct diameters identify observations; affine coordinate checks reject row-index spacing.
export function matchCoordinates(circles: Point[], rows: { x: number; y: number; size: number | null }[], min: number, max: number, domain?: [number, number]) {
  expect(circles, "complete main-plot marker set, excluding legend and overview").toHaveLength(rows.length);
  const sizes = rows.flatMap(row => row.size === null ? [] : [row.size]);
  const [low, high] = domain ?? [Math.min(...sizes), Math.max(...sizes)];
  const diameter = (size: number | null) => size === null ? min : low === high ? (min + max) / 2 : min + (max - min) * (size - low) / (high - low);
  const candidates = rows.map(row => circles.filter(point => Math.abs(point.diameter - diameter(row.size)) < 0.15));
  const a = 0;
  const b = rows.findIndex(row => row.x !== rows[a].x && row.y !== rows[a].y);
  expect(b).toBeGreaterThan(0);
  for (const first of candidates[a]) for (const last of candidates[b]) {
    const sx = (last.x - first.x) / (rows[b].x - rows[a].x);
    const sy = (last.y - first.y) / (rows[b].y - rows[a].y);
    if (!(sx > 0 && sy < 0)) continue;
    const matched = rows.map((row, i) => candidates[i].find(point =>
      Math.abs(point.x - first.x - (row.x - rows[a].x) * sx) < 0.8 &&
      Math.abs(point.y - first.y - (row.y - rows[a].y) * sy) < 0.8));
    if (matched.every(Boolean) && new Set(matched).size === rows.length) return matched as Point[];
  }
  throw new Error("No rendered point set matches raw numeric X/Y and linear bubble diameters");
}

export async function assertXyExport(page: Page, widget: Locator, info: TestInfo, points: Point[]) {
  await page.mouse.move(0, 0);
  const source = await widget.locator("canvas").first().evaluate(canvas => ({
    url: (canvas as HTMLCanvasElement).toDataURL("image/png"),
    width: (canvas as HTMLCanvasElement).width, height: (canvas as HTMLCanvasElement).height,
    cssWidth: canvas.getBoundingClientRect().width,
  }));
  await exportChart(page, widget, info);
  const bytes = await readFile(info.outputPath("saved-ordinary-observations.png"));
  const results = await page.evaluate(async ({ source, exported, points }) => {
    const decode = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0, source.width, source.height);
      return context.getImageData(0, 0, source.width, source.height).data;
    };
    const [original, image] = await Promise.all([decode(source.url), decode(exported)]);
    const scale = source.width / source.cssWidth;
    return points.map(point => {
      const x = point.x * scale, y = point.y * scale, radius = (point.diameter / 2 + 3) * scale;
      let compared = 0, matching = 0;
      for (let row = Math.max(0, Math.floor(y - radius)); row <= Math.min(source.height - 1, Math.ceil(y + radius)); row++) {
        for (let col = Math.max(0, Math.floor(x - radius)); col <= Math.min(source.width - 1, Math.ceil(x + radius)); col++) {
          const index = (row * source.width + col) * 4;
          // Transparent source pixels have no observable RGB; compare their alpha instead.
          const channels = original[index + 3] === 0 ? [3] : [0, 1, 2, 3];
          matching += Number(channels.every(channel => Math.abs(original[index + channel] - image[index + channel]) <= 6));
          compared++;
        }
      }
      return { compared, fraction: matching / compared };
    });
  }, { source, exported: `data:image/png;base64,${bytes.toString("base64")}`, points });
  for (const result of results) {
    expect(result.compared).toBeGreaterThan(20);
    expect(result.fraction, "exported point interior, border and surrounding pixels retain configured geometry").toBeGreaterThan(0.97);
  }
}

export async function hoverPoint(page: Page, widget: Locator, point: Point) {
  const bounds = await widget.locator("canvas").first().boundingBox();
  if (!bounds) throw new Error("Visible XY canvas required");
  await page.mouse.move(bounds.x + point.x, bounds.y + point.y);
}

export async function numberControl(editor: Locator, label: string, value: number) {
  const input = editor.getByRole("spinbutton", { name: `${label} value`, exact: true });
  await input.fill(String(value));
  await input.blur();
  await expect(input).toHaveValue(String(value));
}

export function chartModel(content: any) {
  return content.data.widgets.find((widget: any) => widget.widgetId.startsWith("file-")).storage.default.chartModel;
}
