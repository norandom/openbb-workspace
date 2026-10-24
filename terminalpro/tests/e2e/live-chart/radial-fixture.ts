import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expect } from "./fixtures";
import {
  freshNightingale,
  labels,
  type retainedNightingale,
} from "./nightingale-fixture";
import { stablePie } from "./pie-observer";

export const families = [
  {
    label: "Radial Column",
    model: "radialColumn",
    key: "radial-column",
    axis: "radius-number",
  },
  {
    label: "Radial Bar",
    model: "radialBar",
    key: "radial-bar",
    axis: "radius-category",
  },
] as const;

export async function radialLegend(page: Page, widget: Locator, label: string) {
  const drawing = await freshNightingale(page, widget);
  const matches = drawing.text.filter((t) => t.text === label);
  expect(matches).toHaveLength(1);
  const canvas = await widget.locator("canvas").first().boundingBox();
  if (!canvas) throw Error("Visible native Radial legend required");
  const b = matches[0].bounds;
  expect(b.width).toBeGreaterThan(0);
  expect(b.height).toBeGreaterThan(0);
  await page.mouse.click(canvas.x + b.x + b.width / 2, canvas.y + b.y + b.height / 2);
}

// Both engines expose native tooltips at actual painted financial pixels. Column's
// constant-width paths cannot be inferred from the Nightingale sector observer.
export async function radialFinancialPaint(
  page: Page,
  widget: Locator,
  source: ReturnType<typeof retainedNightingale>,
  original = false,
  visible = [0, 1],
) {
  const drawing = await freshNightingale(page, widget);
  const circle = drawing.outlines
    .filter((a) => Math.abs(a.end - a.start) >= Math.PI * 2 - 0.001)
    .sort((a, b) => b.radius - a.radius)[0];
  if (!circle && !original)
    throw Error("Native outer circle required for plot-only financial evidence");
  await stablePie(page, widget);
  const canvas = widget.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw Error("Visible financial Radial canvas required");
  const sampled = await canvas.evaluate(
    (element, { circle, original }) => {
      const c = element as HTMLCanvasElement;
      const context = c.getContext("2d");
      if (!context) throw Error("Readable native canvas required");
      const rect = c.getBoundingClientRect();
      const bytes = context.getImageData(0, 0, c.width, c.height).data;
      const colors = new Map<string, { x: number; y: number; color: string }[]>();
      const mask: string[] = [];
      const stride = Math.max(3, Math.round((5 * c.width) / rect.width));
      for (let y = stride; y < c.height - stride; y += stride)
        for (let x = stride; x < c.width - stride; x += stride) {
          const index = (y * c.width + x) * 4;
          const rgb = [bytes[index], bytes[index + 1], bytes[index + 2]];
          if (bytes[index + 3] < 240 || Math.max(...rgb) - Math.min(...rgb) < 70)
            continue;
          const px = (x * rect.width) / c.width;
          const py = (y * rect.height) / c.height;
          if (
            !original &&
            circle &&
            Math.hypot(px - circle.x, py - circle.y) > circle.radius * 0.97
          )
            continue;
          const key = rgb.join(",");
          mask.push(`${x}:${y}:${key}`);
          const points = colors.get(key) ?? [];
          points.push({ x: px, y: py, color: key });
          colors.set(key, points);
        }
      const pixels = [...colors.values()]
        .sort((a, b) => b.length - a.length)
        .slice(0, 2)
        .flatMap((points) =>
          Array.from(
            { length: Math.min(240, points.length) },
            (_, i) =>
              points[Math.floor((i * points.length) / Math.min(240, points.length))],
          ),
        );
      return {
        pixels,
        mask: mask.join(";"),
        palette: [...colors].map(([color, points]) => ({
          color,
          count: points.length,
        })),
      };
    },
    { circle, original },
  );
  const pixels = sampled.pixels;
  expect(pixels.length, "financial colored paint exists").toBeGreaterThan(20);
  const expected = visible.flatMap((field) =>
    source.values[field].map((raw, q) => ({ field, raw, q })),
  );
  const seen: {
    field: number;
    raw: number;
    q: number;
    text: string;
    x: number;
    y: number;
    color: string;
  }[] = [];
  const observed: string[] = [];
  for (const point of pixels) {
    await page.mouse.move(0, 0);
    await page.mouse.move(box.x + point.x, box.y + point.y);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const tip = original
      ? page.locator(".ag-charts-tooltip").filter({ visible: true }).last()
      : widget
          .getByText(/^Q[1-4]\s*(?:Cost Of Revenue|Gross Profit)\s*\(USD\):/i)
          .filter({ visible: true })
          .last();
    if (!(await tip.count())) continue;
    const text = await tip.innerText();
    if (!observed.includes(text)) observed.push(text);
    for (const item of expected) {
      if (
        text.includes(`Q${item.q + 1}`) &&
        text.includes(labels[item.field]) &&
        text.includes(expectedBoxTooltipNumber(item.raw)) &&
        !seen.some((s) => s.field === item.field && s.q === item.q)
      ) {
        expect(text).toContain("USD");
        expect(text).not.toContain("%");
        seen.push({ ...item, text, ...point });
      }
    }
    if (visible.length === 2 && seen.length === expected.length) break;
  }
  if (!visible.includes(1))
    expect(
      observed.every((text) => !text.includes(labels[1])),
      "No gross-profit native hit target in exhaustive bounded plot scan",
    ).toBe(true);
  expect(
    seen.map((s) => `${s.q}:${s.field}`).sort(),
    "every retained fiscal observation has a native raw USD tooltip",
  ).toEqual(expected.map((s) => `${s.q}:${s.field}`).sort());
  await page.mouse.move(0, 0);
  return {
    seen,
    observed,
    plotHash: createHash("sha256").update(sampled.mask).digest("hex"),
    palette: sampled.palette,
    attemptedBound: pixels.length,
    method:
      "Painted-pixel native tooltip identity; geometry mathematics covered by renderer unit tests",
  };
}

export function qualifiedRadialIdentity() {
  const python = process.env.WORKSPACE_RUNTIME_PYTHON;
  const descriptor = process.env.WORKSPACE_RUNTIME_PRIVATE;
  if (!python || !descriptor)
    throw Error("Owned runtime qualification inputs required");
  const script = `import json,os,subprocess,sys
from pathlib import Path
r=json.load(open(sys.argv[1]))
def inspect(*args):
 return json.loads(subprocess.run(['docker',*args],check=True,capture_output=True,text=True,timeout=15).stdout)[0]
assert r['name'].startswith('qopenbb-browser-') and r.get('packaged_image_only') is True and r.get('source_overlay') is None
c=inspect('inspect',r['name'])
assert c['Name']=='/'+r['name'] and c['Id']==r['container'] and c['State']['Running'] is True
assert c['Image']==r['image']==os.environ['QOPENBB_CANDIDATE_IMAGE']
b=c['NetworkSettings']['Ports']['3000/tcp']
assert len(b)==1 and b[0]['HostIp']=='127.0.0.1'
origin='http://127.0.0.1:'+b[0]['HostPort']
assert origin==r['origin']==r['public_origin']==os.environ['WORKSPACE_FRONTEND_ORIGIN']
m=c['Mounts']
assert len(m)==1 and m[0]['Destination']=='/data' and m[0]['Type']=='bind' and m[0]['RW'] is True
assert m[0]['Source']==r['state'] and Path(r['state']).name.startswith('qopenbb-browser-')
i=inspect('image','inspect',c['Image'])
source=i['Config']['Labels']['org.qopenbb.source.workspace']
assert source==os.environ['QOPENBB_CANDIDATE_SOURCE']
print(json.dumps({'name':r['name'],'image':i['Id'],'source':source,'origin':origin,'running':True,'onlyDisposableDataMount':True}))`;
  try {
    return JSON.parse(
      execFileSync(python, ["-c", script, descriptor], {
        timeout: 45000,
        windowsHide: true,
        stdio: "pipe",
        encoding: "utf8",
      }),
    );
  } catch {
    throw Error(
      "Actual packaged Radial runtime image/source/origin/mount qualification failed",
    );
  }
}
