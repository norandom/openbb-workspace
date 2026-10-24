import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The original reference transport keeps the disposable bearer in memory only.
export async function radarOriginalUpload(page: Page) {
  const origin = process.env.WORKSPACE_FRONTEND_ORIGIN!;
  const runtime = JSON.parse(readFileSync(process.env.WORKSPACE_RUNTIME_PRIVATE!, "utf8"));
  await page.context().route("**/api/pro/files", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const [uploaded] = await response.json();
    const file = new URL(uploaded.url);
    if (![runtime.origin, runtime.public_origin, origin].includes(file.origin) || !file.pathname.endsWith(".csv")) throw Error("Owned CSV required");
    const authorization = route.request().headers().authorization;
    if (!authorization) throw Error("Disposable bearer required");
    await page.context().route(file.href, request => request.continue({
      url: origin + file.pathname + file.search,
      headers: { ...request.request().headers(), authorization },
    }));
    await route.fulfill({ response });
  });
}

// Observe public canvas calls in the ordinary widget; never inspect or alter engine data.
export async function observeOriginalRadar(page: Page) {
  const install = () => {
    const target = window as any;
    target.radarPaint = { paths: [], arcs: [], text: [] };
    const paths = new WeakMap<object, any[]>();
    const owned = (c: CanvasRenderingContext2D) => c.canvas.closest('[class*="widget-file-"]')?.querySelector("canvas") === c.canvas;
    const point = (c: CanvasRenderingContext2D, x: number, y: number) => {
      const p = c.getTransform().transformPoint(new DOMPoint(x, y));
      const scale = c.canvas.getBoundingClientRect().width / c.canvas.width;
      return { x: p.x * scale, y: p.y * scale };
    };
    for (const proto of [CanvasRenderingContext2D.prototype, Path2D.prototype] as any[]) {
      const begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, close = proto.closePath;
      if (begin) proto.beginPath = function (...args: any[]) { paths.set(this, []); return Reflect.apply(begin, this, args); };
      proto.moveTo = function (x: number, y: number) {
        const p = this instanceof CanvasRenderingContext2D ? point(this, x, y) : { x, y };
        const values = paths.get(this) ?? []; values.push({ points: [p], closed: false }); paths.set(this, values);
        return Reflect.apply(move, this, [x, y]);
      };
      proto.lineTo = function (x: number, y: number) {
        paths.get(this)?.at(-1)?.points.push(this instanceof CanvasRenderingContext2D ? point(this, x, y) : { x, y });
        return Reflect.apply(line, this, [x, y]);
      };
      proto.closePath = function (...args: any[]) { const p = paths.get(this)?.at(-1); if (p) p.closed = true; return Reflect.apply(close, this, args); };
    }
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of ["stroke", "fill"] as const) {
      const previous = proto[method];
      (proto as any)[method] = function (...args: any[]) {
        if (owned(this)) for (const path of paths.get(args[0] instanceof Path2D ? args[0] : this) ?? []) {
          const points = args[0] instanceof Path2D ? path.points.map((p: any) => point(this, p.x, p.y)) : path.points;
          if (points.length > 1) target.radarPaint.paths.push({ method, points, closed: path.closed, color: String(method === "stroke" ? this.strokeStyle : this.fillStyle), width: this.lineWidth, alpha: this.globalAlpha });
        }
        return Reflect.apply(previous, this, args);
      };
    }
    const arc = proto.arc, text = proto.fillText, clear = proto.clearRect;
    proto.arc = function (x, y, radius, start, end, anticlockwise) {
      if (owned(this)) target.radarPaint.arcs.push({ ...point(this, x, y), radius, start, end });
      return Reflect.apply(arc, this, [x, y, radius, start, end, anticlockwise]);
    };
    proto.fillText = function (value, x, y, ...args) {
      if (owned(this)) target.radarPaint.text.push({ text: String(value), ...point(this, x, y) });
      return Reflect.apply(text, this, [value, x, y, ...args]);
    };
    proto.clearRect = function (...args) {
      if (owned(this) && args[2] >= this.canvas.width && args[3] >= this.canvas.height) target.radarPaint = { paths: [], arcs: [], text: [] };
      return Reflect.apply(clear, this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}
