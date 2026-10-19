import type { Page } from "@playwright/test";
import { expect } from "./toolchain";

export async function observeApplication(page: Page) {
  const errors: string[] = [];
  const failures: { path: string; status: number }[] = [];
  const consoleErrors: { message: string; path?: string }[] = [];
  const requestFailures: { path: string; reason: string }[] = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({ path: new URL(request.url()).pathname, reason: request.failure()?.errorText ?? "unknown" });
  });
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error") consoleErrors.push({ message: entry.text, path: entry.url ? new URL(entry.url).pathname : undefined });
  });
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type === "error") consoleErrors.push({ message: args.map((arg) => arg.type === "string" ? String(arg.value) : `[${arg.type}]`).join(" ") });
  });
  return { errors, failures, consoleErrors, requestFailures };
}

export function expectApplicationDiagnostics(
  diagnostics: Awaited<ReturnType<typeof observeApplication>>,
  injectedSaveFailures = 0,
) {
  const savePath = "/api/pro/dash/sync";
  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.requestFailures).toEqual([]);
  expect(diagnostics.failures.filter(({ path, status }) =>
    !(path === savePath && status === 500),
  )).toEqual([]);
  expect(diagnostics.failures.filter(({ path, status }) => path === savePath && status === 500)).toHaveLength(injectedSaveFailures);
  expect(diagnostics.consoleErrors.filter(({ message, path }) =>
    !(injectedSaveFailures > 0 && path === savePath && /Failed to load resource.*500/.test(message)),
  )).toEqual([]);
}

// Observe public canvas drawing without changing chart data or renderer options.
export async function observeDrawnText(page: Page) {
  const install = () => {
    const target = window as typeof window & { chartDrawnText: string[]; chartDrawnAngles: Record<string, number>; chartDrawnAnchors: Record<string, { x: number; y: number }>; chartCategoryAnchors: { text: string; x: number; y: number }[] };
    target.chartDrawnText = [];
    target.chartDrawnAngles = {};
    target.chartDrawnAnchors = {};
    target.chartCategoryAnchors = [];
    const strokes = window as typeof window & { chartDrawnStrokeWidths: number[] };
    strokes.chartDrawnStrokeWidths = [];
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...args: [] | [Path2D]) {
      if (this.canvas.closest('[class*="widget-file-"]')) {
        strokes.chartDrawnStrokeWidths.push(this.lineWidth);
        if (strokes.chartDrawnStrokeWidths.length > 3000) strokes.chartDrawnStrokeWidths.splice(0, 1000);
      }
      return Reflect.apply(stroke, this, args);
    };
    const draw = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      if (this.canvas.closest('[class*="widget-file-"]')) {
        const text = String(args[0]);
        target.chartDrawnText.push(text);
        const anchor = this.getTransform().transformPoint(new DOMPoint(args[1], args[2]));
        target.chartDrawnAnchors[text] = { x: anchor.x, y: anchor.y };
        if (Object.keys(target.chartDrawnAnchors).length > 3000) target.chartDrawnAnchors = { [text]: { x: anchor.x, y: anchor.y } };
        if (["A", "B", "C"].includes(text)) {
          target.chartCategoryAnchors.push({ text, x: anchor.x, y: anchor.y });
          if (target.chartCategoryAnchors.length > 300) target.chartCategoryAnchors.splice(0, 150);
          const { a, b } = this.getTransform();
          target.chartDrawnAngles[text] = Math.atan2(b, a) * 180 / Math.PI;
        }
      }
      if (target.chartDrawnText.length > 3000) target.chartDrawnText.splice(0, 1000);
      return draw.apply(this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

export async function drawnText(page: Page) {
  return page.evaluate(
    () => (window as typeof window & { chartDrawnText: string[] }).chartDrawnText,
  );
}

export async function resetDrawnText(page: Page) {
  await page.evaluate(() => {
    (window as typeof window & { chartDrawnText: string[] }).chartDrawnText = [];
    (window as typeof window & { chartDrawnAngles: Record<string, number> }).chartDrawnAngles = {};
    (window as typeof window & { chartDrawnAnchors: Record<string, { x: number; y: number }> }).chartDrawnAnchors = {};
    (window as typeof window & { chartDrawnStrokeWidths: number[] }).chartDrawnStrokeWidths = [];
  });
}

export async function expectVerticalAxisStroke(page: Page, width: number) {
  await expect.poll(() => page.evaluate((width) =>
    (window as typeof window & { chartDrawnStrokeWidths: number[] }).chartDrawnStrokeWidths.includes(width), width,
  )).toBe(true);
}

export async function expectCategoryBelowLegend(page: Page, category: string, legend: string) {
  await expect.poll(() => page.evaluate(({ category, legend }) => {
    const anchors = (window as typeof window & { chartDrawnAnchors: Record<string, { x: number; y: number }> }).chartDrawnAnchors;
    return anchors[category] !== undefined && anchors[legend] !== undefined &&
      anchors[category].y > anchors[legend].y;
  }, { category, legend })).toBe(true);
}

export async function expectManualCategoryRotation(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const angles = (window as typeof window & { chartDrawnAngles: Record<string, number> }).chartDrawnAngles;
    return ["A", "B", "C"].every((label) => Math.abs(angles[label] - 45) < 0.1);
  })).toBe(true);
}
