import type { Locator, Page } from "@playwright/test";
import { expectedBoxTooltipNumber } from "./box-plot-fixture";
import { observeDrawnText } from "./diagnostics";
import { expect } from "./fixtures";
import { observeHistogram, type Rectangle } from "./histogram-observer";
import type { HierarchyFamily, retainedHierarchy } from "./hierarchy-fixture";
import {
  type Drawing,
  observePie,
  rings,
  type Sector,
  stablePie,
} from "./pie-observer";

export type Point = { x: number; y: number };
type Bounds = Point & { width: number; height: number };
type Gradient = Bounds & { stops: { offset: number; color: string }[] };
type Graphics = { gradients: Gradient[]; triangles: Point[][] };
type Observed = Window & {
  pieDrawing: Drawing;
  histogramDrawing: { rectangles: Rectangle[] };
  hierarchyGraphics: Graphics;
};
export const regexLiteral = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const area = (r: Bounds) => r.width * r.height;
export const center = (r: Bounds): Point => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});
export const inside = (a: Bounds, b: Bounds, epsilon = 0.1) =>
  b.x >= a.x - epsilon &&
  b.y >= a.y - epsilon &&
  b.x + b.width <= a.x + a.width + epsilon &&
  b.y + b.height <= a.y + a.height + epsilon;
export function sectorPoint(sector: Sector): Point {
  const angle = (sector.start + sector.end) / 2;
  const radius = (sector.radius + sector.inner) / 2;
  return {
    x: sector.x + Math.cos(angle) * radius,
    y: sector.y + Math.sin(angle) * radius,
  };
}

// Shared observers own rectangles, sectors and labels. This adds only missing
// continuous-gradient fills and the public three-point hover indicator.
export async function observeHierarchy(page: Page, captions = true) {
  await observePie(page);
  await observeHistogram(page);
  if (captions) await observeDrawnText(page);
  const install = () => {
    const target = window as unknown as Observed;
    target.hierarchyGraphics = { gradients: [], triangles: [] };
    const owned = (c: CanvasRenderingContext2D) =>
      c.canvas.closest('[class*="widget-file-"]')?.querySelector("canvas") === c.canvas;
    const point = (c: CanvasRenderingContext2D, x: number, y: number) => {
      const p = c.getTransform().transformPoint(new DOMPoint(x, y));
      const scale = c.canvas.getBoundingClientRect().width / c.canvas.width;
      return { x: p.x * scale, y: p.y * scale };
    };
    const paths = new WeakMap<
      CanvasRenderingContext2D,
      { points: Point[]; rects: Bounds[]; curved: boolean }
    >();
    const stops = new WeakMap<CanvasGradient, { offset: number; color: string }[]>();
    const p = CanvasRenderingContext2D.prototype;
    const linear = p.createLinearGradient;
    p.createLinearGradient = function (...args) {
      const gradient = Reflect.apply(linear, this, args);
      stops.set(gradient, []);
      return gradient;
    };
    const add = CanvasGradient.prototype.addColorStop;
    CanvasGradient.prototype.addColorStop = function (offset, color) {
      stops.get(this)?.push({ offset, color });
      return Reflect.apply(add, this, [offset, color]);
    };
    const begin = p.beginPath;
    const move = p.moveTo;
    const line = p.lineTo;
    const rect = p.rect;
    const arc = p.arc;
    const bezier = p.bezierCurveTo;
    p.beginPath = function () {
      paths.set(this, { points: [], rects: [], curved: false });
      return Reflect.apply(begin, this, []);
    };
    p.moveTo = function (x, y) {
      paths.get(this)?.points.push(point(this, x, y));
      return Reflect.apply(move, this, [x, y]);
    };
    p.lineTo = function (x, y) {
      paths.get(this)?.points.push(point(this, x, y));
      return Reflect.apply(line, this, [x, y]);
    };
    p.arc = function (...args) {
      const path = paths.get(this);
      if (path) path.curved = true;
      return Reflect.apply(arc, this, args);
    };
    p.bezierCurveTo = function (...args) {
      const path = paths.get(this);
      if (path) path.curved = true;
      return Reflect.apply(bezier, this, args);
    };
    p.rect = function (x, y, width, height) {
      const a = point(this, x, y);
      const b = point(this, x + width, y + height);
      paths
        .get(this)
        ?.rects.push({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
      return Reflect.apply(rect, this, [x, y, width, height]);
    };
    const fill = p.fill;
    p.fill = function (...args: Parameters<CanvasRenderingContext2D["fill"]>) {
      if (owned(this) && this.globalAlpha > 0) {
        const path = paths.get(this);
        if (this.fillStyle instanceof CanvasGradient)
          for (const bounds of path?.rects ?? [])
            target.hierarchyGraphics.gradients.push({
              ...bounds,
              stops: stops.get(this.fillStyle) ?? [],
            });
        if (path && !path.curved) {
          const unique = [
            ...new Map(path.points.map((p) => [`${p.x}:${p.y}`, p])).values(),
          ];
          if (
            unique.length === 3 &&
            Math.max(...unique.map((p) => p.x)) - Math.min(...unique.map((p) => p.x)) <=
              40 &&
            Math.max(...unique.map((p) => p.y)) - Math.min(...unique.map((p) => p.y)) <=
              40
          )
            target.hierarchyGraphics.triangles.push(unique);
        }
      }
      return Reflect.apply(fill, this, args);
    };
    const clear = p.clearRect;
    p.clearRect = function (...args) {
      if (owned(this) && args[2] >= this.canvas.width && args[3] >= this.canvas.height)
        target.hierarchyGraphics = { gradients: [], triangles: [] };
      return Reflect.apply(clear, this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

export async function drawing(page: Page, widget: Locator, fresh = true) {
  await page.mouse.move(0, 0);
  const viewport = page.viewportSize();
  if (!viewport) throw Error("Fixed isolated viewport required");
  const canvas = widget.locator("canvas").first();
  const width = await canvas.evaluate((c) => (c as HTMLCanvasElement).width);
  if (fresh) {
    await page.setViewportSize({ ...viewport, width: viewport.width + 64 });
    await expect
      .poll(() => canvas.evaluate((c) => (c as HTMLCanvasElement).width))
      .not.toBe(width);
    await page.evaluate(() => {
      const w = window as unknown as Observed;
      w.pieDrawing = { sectors: [], text: [], outlines: [], lines: [] };
      w.histogramDrawing = {
        rectangles: [],
        text: [],
      } as unknown as Observed["histogramDrawing"];
      w.hierarchyGraphics = { gradients: [], triangles: [] };
    });
    await page.setViewportSize(viewport);
    await expect
      .poll(() => canvas.evaluate((c) => (c as HTMLCanvasElement).width))
      .toBe(width);
  }
  await stablePie(page, widget);
  const result = await page.evaluate(() => {
    const w = window as unknown as Observed;
    const color = document.createElement("canvas").getContext("2d")!;
    const fillAlpha = (fill: string) => {
      if (!CSS.supports("color", fill)) return null;
      color.fillStyle = fill;
      const parsed = String(color.fillStyle);
      const rgba = /^rgba\([^)]*,\s*([\d.]+)\s*\)$/.exec(parsed);
      if (rgba) return Number(rgba[1]);
      const modern = /\/\s*([\d.]+)(%)?\s*\)$/.exec(parsed);
      if (modern) return Number(modern[1]) / (modern[2] ? 100 : 1);
      return /^#[\da-f]{8}$/i.test(parsed)
        ? Number.parseInt(parsed.slice(-2), 16) / 255
        : 1;
    };
    return {
      ...w.pieDrawing,
      ...w.hierarchyGraphics,
      rectangles: w.histogramDrawing.rectangles.map((r) => ({
        ...r,
        fillAlpha: fillAlpha(r.fill),
      })),
      dpr: window.devicePixelRatio,
    };
  });
  const distinct = <T>(items: T[], key: (item: T) => string) => [
    ...new Map(items.map((item) => [key(item), item])).values(),
  ];
  return {
    ...result,
    rectangles: distinct(
      result.rectangles.filter((r) => r.width > 1 && r.height > 1 && r.alpha > 0),
      (r) => JSON.stringify([r.x, r.y, r.width, r.height]),
    ),
    sectors: distinct(result.sectors, (r) =>
      JSON.stringify([r.x, r.y, r.radius, r.inner, r.start, r.end]),
    ),
    text: distinct(result.text, (t) => JSON.stringify([t.text, t.x, t.y])),
  };
}
export type HierarchyDrawing = Awaited<ReturnType<typeof drawing>>;
export async function hover(page: Page, widget: Locator, point: Point) {
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw Error("Visible hierarchy canvas required");
  await page.mouse.move(0, 0);
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
export async function tipAt(page: Page, widget: Locator, point: Point, label: string) {
  await hover(page, widget, point);
  const tip = nativeTooltip(widget).last();
  await expect(tip).toBeVisible();
  await expect
    .poll(() => tip.innerText())
    .toMatch(new RegExp(`^${regexLiteral(label)}(?:\\s|$)`, "i"));
  return tip.innerText();
}
// The retained grid stays DOM-visible behind the chart. Scope hover assertions
// to the observed public HTML tooltip instead of matching retained cell text.
export function nativeTooltip(widget: Locator) {
  return widget
    .locator('div[style*="z-index: 9999999"][style*="pointer-events: none"]')
    .filter({ visible: true });
}
export async function paintedPoint(_page: Page, widget: Locator, point: Point) {
  const color = await widget
    .locator("canvas")
    .first()
    .evaluate((element, point) => {
      const canvas = element as HTMLCanvasElement;
      const box = canvas.getBoundingClientRect();
      const pixels = canvas
        .getContext("2d")!
        .getImageData(
          Math.floor((point.x * canvas.width) / box.width),
          Math.floor((point.y * canvas.height) / box.height),
          1,
          1,
        ).data;
      return [...pixels];
    }, point);
  expect(color[3], "financial interior has visible paint").toBeGreaterThan(0);
  return color;
}
function expectAmount(text: string, label: string, usd: number) {
  expect(text.toLowerCase()).toContain(label.toLowerCase());
  expect(text).toContain("Amount (USD):");
  expect(text).toContain(expectedBoxTooltipNumber(usd));
  expect(text).not.toContain("%");
}
export async function visibleFill(widget: Locator, shape: Rectangle | Sector) {
  // Native tooltip hits activate an emphasis fill. Compare the settled ordinary
  // paint to the ordinary public drawing snapshot, after retaining tooltip text.
  await stablePie(widget.page(), widget);
  const points =
    "radius" in shape
      ? [0.25, 0.75].flatMap((r) =>
          [0.25, 0.75].map((a) => {
            const radius = shape.inner + (shape.radius - shape.inner) * r;
            const angle = shape.start + (shape.end - shape.start) * a;
            return {
              x: shape.x + Math.cos(angle) * radius,
              y: shape.y + Math.sin(angle) * radius,
            };
          }),
        )
      : [0.2, 0.8].flatMap((x) =>
          [0.2, 0.8].map((y) => ({
            x: shape.x + shape.width * x,
            y: shape.y + shape.height * y,
          })),
        );
  const sampled = await widget
    .locator("canvas")
    .first()
    .evaluate(
      (element, { points, fill }) => {
        const canvas = element as HTMLCanvasElement;
        const box = canvas.getBoundingClientRect();
        const reference = document.createElement("canvas");
        reference.width = reference.height = 1;
        const c = reference.getContext("2d")!;
        c.fillStyle = fill;
        c.fillRect(0, 0, 1, 1);
        const expected = [...c.getImageData(0, 0, 1, 1).data];
        return {
          expected,
          pixels: points.map((point) => ({
            point,
            rgba: [
              ...canvas
                .getContext("2d")!
                .getImageData(
                  Math.round((point.x * canvas.width) / box.width),
                  Math.round((point.y * canvas.height) / box.height),
                  1,
                  1,
                ).data,
            ],
          })),
        };
      },
      { points, fill: shape.fill },
    );
  const matching = sampled.pixels.find(
    (p) =>
      p.rgba[3] > 0 &&
      sampled.expected.every((channel, i) => Math.abs(channel - p.rgba[i]) <= 2),
  );
  expect(matching, `native leaf has visible interior fill ${shape.fill}`).toBeDefined();
  return matching!.rgba;
}
function ratio(actual: number, expected: number, tolerance: number, label: string) {
  const residual = actual - expected;
  expect(
    Math.abs(residual),
    `${label}: measured=${actual}, expected=${expected}, residual=${residual}, tolerance=${tolerance}`,
  ).toBeLessThanOrEqual(tolerance);
  return { actual, expected, residual, tolerance };
}
function areaRatioTolerance(
  numerator: Bounds,
  denominator: number,
  rects: Bounds[],
  dpr: number,
) {
  const edge = 2 / dpr;
  const error = (r: Bounds) => 2 * edge * (r.width + r.height) + 4 * edge * edge;
  return (
    (error(numerator) +
      (area(numerator) / denominator) * rects.reduce((sum, r) => sum + error(r), 0)) /
    denominator
  );
}

export async function financialPaint(
  page: Page,
  widget: Locator,
  family: HierarchyFamily,
  source: ReturnType<typeof retainedHierarchy>,
  measure = true,
) {
  const paint = await drawing(page, widget);
  const leaves: {
    quarter: string;
    component: string;
    usd: number;
    text: string;
    point: Point;
    region: Bounds;
    shape: Bounds | Sector;
    rgba: number[];
  }[] = [];
  const parents: {
    quarter: string;
    shape: Bounds | Sector;
    text: string;
    ratio?: ReturnType<typeof ratio>;
    children?: ReturnType<typeof ratio>[];
  }[] = [];
  if (family === "Treemap") {
    const terminals = leafRectangles(paint);
    expect(
      terminals,
      "exactly eight terminal painted financial allocations, with no revenue leaf",
    ).toHaveLength(8);
    for (let q = 0; q < 4; q++) {
      const quarter = `FY2025 Q${q + 1}`;
      const label = paint.text.find((t) => t.text === quarter);
      expect(label, `painted parent ${quarter}`).toBeDefined();
      const parent = paint.rectangles
        .filter((r) => inside(r, { ...center(label!.bounds), width: 0, height: 0 }))
        .sort((a, b) => area(a) - area(b))[0];
      expect(parent, `public parent rectangle ${quarter}`).toBeDefined();
      const text = await tipAt(page, widget, center(label!.bounds), quarter);
      expect(text.trim()).toBe(quarter);
      const candidates = terminals.filter((r) => inside(parent, r));
      expect(
        candidates,
        `${quarter} contains exactly two terminal component allocations`,
      ).toHaveLength(2);
      const found: Rectangle[] = [];
      for (const leaf of source.leaves.filter((l) => l.quarter === quarter)) {
        const targets = candidates.filter((r) => !found.includes(r));
        let match: { shape: Rectangle; text: string } | undefined;
        for (const shape of targets) {
          await hover(page, widget, center(shape));
          const tip = nativeTooltip(widget)
            .filter({
              hasText: new RegExp(
                `^${regexLiteral(leaf.component)}\\s*Amount \\(USD\\):`,
                "i",
              ),
            })
            .last();
          if (await tip.count()) {
            const content = await tip.innerText();
            if (content.includes(expectedBoxTooltipNumber(leaf.usd))) {
              match = { shape, text: content };
              break;
            }
          }
        }
        expect(
          match,
          `${quarter}/${leaf.component} has its own painted native USD hit`,
        ).toBeDefined();
        expectAmount(match!.text, leaf.component, leaf.usd);
        found.push(match!.shape);
        const point = center(match!.shape);
        leaves.push({
          ...leaf,
          text: match!.text,
          shape: match!.shape,
          point,
          region: match!.shape,
          rgba: await visibleFill(widget, match!.shape),
        });
      }
      const totalArea = found.reduce((sum, r) => sum + area(r), 0);
      expect(new Set(found)).toEqual(new Set(candidates));
      if (measure) {
        const edge = 2 / paint.dpr;
        const [a, b] = candidates;
        const xOverlap = Math.max(
          0,
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
        );
        const yOverlap = Math.max(
          0,
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
        );
        expect(
          Math.min(xOverlap, yOverlap),
          `${quarter} children do not overlap beyond two physical edge pixels`,
        ).toBeLessThanOrEqual(edge);
        const horizontal =
          Math.abs(a.y - b.y) <= edge && Math.abs(a.height - b.height) <= edge;
        const vertical =
          Math.abs(a.x - b.x) <= edge && Math.abs(a.width - b.width) <= edge;
        expect(
          horizontal || vertical,
          `${quarter} children cover one rectangular allocation strip`,
        ).toBe(true);
        const ordered = [...candidates].sort((a, b) =>
          horizontal ? a.x - b.x : a.y - b.y,
        );
        const gap = horizontal
          ? ordered[1].x - ordered[0].x - ordered[0].width
          : ordered[1].y - ordered[0].y - ordered[0].height;
        expect(
          Math.abs(gap),
          `${quarter} zero Tile Spacing leaves no unmatched interior allocation`,
        ).toBeLessThanOrEqual(edge);
        const allocation = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
          height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
        };
        const coverage = ratio(
          totalArea / area(allocation),
          1,
          areaRatioTolerance(allocation, area(allocation), candidates, paint.dpr),
          `${quarter} full child allocation after observed header/border deductions`,
        );
        Object.assign(parent, {
          allocationEvidence: {
            allocation,
            gap,
            coverage,
            deductions: {
              left: allocation.x - parent.x,
              top: allocation.y - parent.y,
              right: parent.x + parent.width - allocation.x - allocation.width,
              bottom: parent.y + parent.height - allocation.y - allocation.height,
            },
          },
        });
      }
      const children = measure
        ? found.map((r, i) =>
            ratio(
              area(r) / totalArea,
              source.leaves.filter((l) => l.quarter === quarter)[i].usd /
                source.revenues[q],
              areaRatioTolerance(r, totalArea, found, paint.dpr),
              `${quarter} child ${i}`,
            ),
          )
        : undefined;
      parents.push({ quarter, shape: parent, text, children });
    }
    expect(new Set(leaves.map((l) => JSON.stringify(l.shape))).size).toBe(8);
    expect(new Set(leaves.map((l) => l.shape))).toEqual(new Set(terminals));
    if (measure) {
      const shapes = parents.map((p) => p.shape as Bounds);
      const totalArea = shapes.reduce((sum, r) => sum + area(r), 0);
      parents.forEach((parent, q) => {
        parent.ratio = ratio(
          area(shapes[q]) / totalArea,
          source.revenues[q] / source.total,
          areaRatioTolerance(shapes[q], totalArea, shapes, paint.dpr),
          `${parent.quarter} root allocation`,
        );
      });
    }
  } else {
    const grouped = rings(paint);
    expect(grouped, "exactly two visible hierarchy levels").toHaveLength(2);
    const outer = grouped[0];
    const inner = grouped[1];
    expect(inner).toHaveLength(4);
    expect(outer).toHaveLength(8);
    const span = (s: Sector) => Math.abs(s.end - s.start);
    for (const level of [inner, outer]) {
      const ordered = [...level].sort((a, b) => a.start - b.start);
      for (let i = 1; i < ordered.length; i++)
        expect(
          ordered[i].start,
          "adjacent native sectors cover the ring without overlap or holes",
        ).toBeCloseTo(ordered[i - 1].end, 5);
      expect(ordered.at(-1)!.end - ordered[0].start).toBeCloseTo(Math.PI * 2, 5);
    }
    expect(inner.reduce((sum, s) => sum + span(s), 0)).toBeCloseTo(Math.PI * 2, 5);
    expect(outer.reduce((sum, s) => sum + span(s), 0)).toBeCloseTo(Math.PI * 2, 5);
    for (const parent of inner) {
      expect(parent.x).toBeCloseTo(inner[0].x, 5);
      expect(parent.y).toBeCloseTo(inner[0].y, 5);
      await hover(page, widget, sectorPoint(parent));
      const native = nativeTooltip(widget)
        .filter({ hasText: /^FY2025 Q([1-4])\s*FY2025 Q\1$/ })
        .last();
      await expect(native).toBeVisible();
      const text = await native.innerText();
      const quarter = text.match(/FY2025 Q[1-4]/)![0];
      const q = Number(quarter.at(-1)) - 1;
      const children = outer.filter(
        (s) => s.start >= parent.start - 1e-6 && s.end <= parent.end + 1e-6,
      );
      expect(children).toHaveLength(2);
      const childRatios = [];
      for (const child of children) {
        expect(child.x).toBeCloseTo(parent.x, 5);
        expect(child.y).toBeCloseTo(parent.y, 5);
        expect(child.inner).toBeCloseTo(parent.radius, 5);
        await hover(page, widget, sectorPoint(child));
        const native = nativeTooltip(widget)
          .filter({ hasText: /^(?:Cost of revenue|Gross profit)\s*Amount \(USD\):/i })
          .last();
        await expect(native).toBeVisible();
        const content = await native.innerText();
        const leaf = source.leaves.find(
          (l) =>
            l.quarter === quarter &&
            content.toLowerCase().startsWith(l.component.toLowerCase()),
        );
        expect(leaf).toBeDefined();
        expectAmount(content, leaf!.component, leaf!.usd);
        const point = sectorPoint(child);
        leaves.push({
          ...leaf!,
          text: content,
          point,
          shape: child,
          region: { x: point.x - 6, y: point.y - 6, width: 12, height: 12 },
          rgba: await visibleFill(widget, child),
        });
        childRatios.push(
          ratio(
            span(child) / span(parent),
            leaf!.usd / source.revenues[q],
            1e-5,
            `${quarter}/${leaf!.component} angular allocation`,
          ),
        );
      }
      parents.push({
        quarter,
        shape: parent,
        text,
        ratio: ratio(
          span(parent) / (Math.PI * 2),
          source.revenues[q] / source.total,
          1e-5,
          `${quarter} angular allocation`,
        ),
        children: childRatios,
      });
    }
  }
  expect(leaves).toHaveLength(8);
  expect(new Set(leaves.map((l) => `${l.quarter}/${l.component}`)).size).toBe(8);
  await page.mouse.move(0, 0);
  return {
    family,
    dpr: paint.dpr,
    parents,
    leaves,
    paint,
    geometryMeasured: family === "Sunburst" || measure,
  };
}

export function leafRectangles(paint: HierarchyDrawing) {
  const visible = paint.rectangles.filter((r) => r.fillAlpha !== 0);
  return visible.filter(
    (r) =>
      !paint.gradients.some(
        (g) =>
          Math.abs(g.x - r.x) < 0.1 &&
          Math.abs(g.y - r.y) < 0.1 &&
          Math.abs(g.width - r.width) < 0.1 &&
          Math.abs(g.height - r.height) < 0.1,
      ) &&
      !visible.some(
        (other) => other !== r && inside(r, other) && area(other) < area(r) - 1,
      ),
  );
}
export async function gradientState(page: Page) {
  return page.evaluate(() => (window as unknown as Observed).hierarchyGraphics);
}
export async function gradientEndpoints(
  page: Page,
  widget: Locator,
  gradient: Gradient,
) {
  const horizontal = gradient.width > gradient.height;
  return Promise.all(
    [0.005, 0.995].map((fraction) =>
      paintedPoint(page, widget, {
        x: gradient.x + gradient.width * (horizontal ? fraction : 0.5),
        y: gradient.y + gradient.height * (horizontal ? 0.5 : fraction),
      }),
    ),
  );
}
