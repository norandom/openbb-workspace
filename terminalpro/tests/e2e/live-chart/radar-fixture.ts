import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expect, test } from "./fixtures";
import { stablePie } from "./pie-observer";
export { observeOriginalRadar as observeRadar } from "./radar-original-observer";

const hashes = {
  raw: "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b",
  csv: "41aafd16de1e0b9b759ddff959389268efefc41b26206b5d49d5289ad2a4159f",
  json: "00b049c00bc96beb35d213faf4f2a217fa25565873afb12b37a8126610a04a24",
};
export const fields = [
  "FY 2023",
  "FY 2024",
  "FY 2025",
  "FY 2026 (partial: 3/4 quarters)",
];
const expected = [
  [117154000000, 94836000000, 81797000000, 89498000000],
  [119575000000, 90753000000, 85777000000, 94930000000],
  [124300000000, 95359000000, 94036000000, 102466000000],
  [143756000000, 111184000000, 109417000000, null],
];
export function retainedRadarFixture() {
  const directory = (name: string) => {
    const value = process.env[name];
    if (!value || !isAbsolute(value))
      throw Error(`Absolute retained evidence directory required: ${name}`);
    return value;
  };
  const raw = readFileSync(join(directory("QOPENBB_BOX_FMP_EVIDENCE"), "raw.json"));
  const root = directory("QOPENBB_RADAR_FMP_EVIDENCE");
  const csv = readFileSync(join(root, "revenue.csv"));
  const json = readFileSync(join(root, "revenue.json"));
  for (const [key, bytes] of Object.entries({ raw, csv, json }))
    expect(
      createHash("sha256").update(bytes).digest("hex"),
      `${key} exact retained bytes`,
    ).toBe(hashes[key as keyof typeof hashes]);
  const provenance = JSON.parse(json.toString("utf8"));
  expect(provenance).toMatchObject({
    symbol: "AAPL",
    field: "revenue",
    currency: "USD",
    sourceRawSha256: hashes.raw,
    spokes: ["Q1", "Q2", "Q3", "Q4"],
  });
  const records = JSON.parse(raw.toString("utf8")) as Record<string, unknown>[];
  const relevant = records.filter(
    (r) =>
      r.symbol === "AAPL" &&
      ["2023", "2024", "2025", "2026"].includes(String(r.fiscalYear)),
  );
  expect(relevant).toHaveLength(15);
  const keys = relevant.map((r) => `${r.fiscalYear}:${r.period}`);
  expect(new Set(keys).size, "duplicate fiscal year/quarter records are rejected").toBe(
    15,
  );
  const series = expected.map((values, yearIndex) => {
    const fiscalYear = String(2023 + yearIndex);
    values.forEach((value, quarterIndex) => {
      const period = `Q${quarterIndex + 1}`;
      const found = relevant.filter(
        (r) => String(r.fiscalYear) === fiscalYear && r.period === period,
      );
      if (value === null) expect(found).toHaveLength(0);
      else {
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ reportedCurrency: "USD", revenue: value });
        expect(Number.isSafeInteger(found[0].revenue)).toBe(true);
        expect(BigInt(found[0].revenue as number)).toBe(BigInt(value));
      }
    });
    expect(provenance.series[yearIndex]).toMatchObject({ fiscalYear, values });
    return { label: fields[yearIndex], values };
  });
  const quote = (value: string | number | null) => (value === null ? "" : `"${value}"`);
  expect(csv.toString("utf8").replaceAll("\r\n", "\n")).toBe(
    `${["Quarter", ...fields].map(quote).join(",")}\n${[0, 1, 2, 3].map((q) => [`Q${q + 1}`, ...expected.map((values) => values[q])].map(quote).join(",")).join("\n")}\n`,
  );
  return { csv: csv.toString("utf8"), series, provenance, hashes };
}
export type RadarPoint = { x: number; y: number };
export type RadarPaint = {
  paths: {
    method: string;
    points: RadarPoint[];
    closed: boolean;
    color: string;
    width: number;
    alpha: number;
  }[];
  arcs: (RadarPoint & { radius: number })[];
  text: (RadarPoint & { text: string })[];
};
export async function radarDrawing(page: Page, widget: Locator) {
  const viewport = page.viewportSize();
  if (!viewport) throw Error("Fixed isolated viewport required");
  await page.evaluate(() => {
    (window as unknown as { radarPaint: RadarPaint }).radarPaint = {
      paths: [],
      arcs: [],
      text: [],
    };
  });
  // A real viewport resize forces a current native frame, excluding earlier family/control paint.
  await page.setViewportSize({ ...viewport, width: viewport.width + 2 });
  await stablePie(page, widget);
  await page.setViewportSize(viewport);
  await stablePie(page, widget);
  return page.evaluate(
    () => (window as unknown as { radarPaint: RadarPaint }).radarPaint,
  );
}
/** Four cardinal spokes give a geometry-derived center and an independent raw-USD scale. */
function radarCandidates(
  drawing: RadarPaint,
  values: readonly (number | null)[],
  area = false,
) {
  const candidates = drawing.paths.filter(
    (path) =>
      path.method === (area ? "fill" : "stroke") &&
      path.alpha > 0 &&
      path.points.length >= 3 &&
      path.points.length <= 5,
  );
  // Replacement Line paints individual public line segments; original paints a joined path.
  if (!area) {
    const edges = drawing.paths.filter(
      (path) => path.method === "stroke" && path.alpha > 0 && path.points.length === 2,
    );
    for (const first of edges) {
      const used = new Set([first]);
      const points = [...first.points];
      while (points.length < 5) {
        const last = points.at(-1)!;
        const next = edges.find(
          (edge) =>
            !used.has(edge) &&
            edge.color === first.color &&
            edge.width === first.width &&
            Math.hypot(edge.points[0].x - last.x, edge.points[0].y - last.y) < 0.1,
        );
        if (!next) break;
        used.add(next);
        points.push(next.points[1]);
      }
      if (points.length >= 3) candidates.push({ ...first, points });
    }
  }
  const matches = [];
  for (const path of candidates) {
    const points = path.points.slice(0, 4);
    if (points.length < 3) continue;
    const center = { x: points[0].x, y: points[1].y };
    if (
      Math.abs(points[2].x - center.x) > 1.1 ||
      points[0].y >= center.y ||
      points[1].x <= center.x ||
      points[2].y <= center.y
    )
      continue;
    const scale = (center.y - points[0].y) / (values[0] as number);
    if (!(scale > 0)) continue;
    const expectedPoints = values.map((value, i) => {
      const radius = (value ?? 0) * scale;
      return {
        x: center.x + [0, 1, 0, -1][i] * radius,
        y: center.y + [-1, 0, 1, 0][i] * radius,
      };
    });
    // Line's absent final spoke leaves only the three observed vertices; Area paints the center.
    const required = values[3] === null && !area ? 3 : 4;
    if (
      points.length < required ||
      (values[3] === null && !area && path.points.length !== 3)
    )
      continue;
    if (
      expectedPoints
        .slice(0, required)
        .every(
          (point, i) => Math.hypot(points[i].x - point.x, points[i].y - point.y) < 1.1,
        )
    )
      matches.push({
        ...path,
        points: points.slice(0, required),
        center,
        scale,
        key: JSON.stringify([path.method, path.color, points.slice(0, required)]),
        error: expectedPoints
          .slice(0, required)
          .reduce(
            (sum, point, i) =>
              sum + Math.hypot(points[i].x - point.x, points[i].y - point.y),
            0,
          ),
      });
  }
  return [...new Map(matches.map((match) => [match.key, match])).values()].sort(
    (a, b) => a.error - b.error,
  );
}
export function matchRadar(
  drawing: RadarPaint,
  values: readonly (number | null)[],
  area = false,
) {
  const best = radarCandidates(drawing, values, area)[0];
  if (!best)
    throw Error(`No native Radar paint matches retained raw-USD values ${values}`);
  return best;
}
/** Similar fiscal years must use distinct public paths on one common radial scale. */
export function matchRadarSeries(
  drawing: RadarPaint,
  series: ReturnType<typeof retainedRadarFixture>["series"],
  area = false,
) {
  const choices = series.map((s) => radarCandidates(drawing, s.values, area));
  type Match = ReturnType<typeof radarCandidates>[number];
  function assign(index: number, chosen: Match[]): Match[] | undefined {
    if (index === choices.length) return chosen;
    for (const next of choices[index]) {
      const first = chosen[0];
      if (chosen.some((value) => value.key === next.key)) continue;
      if (
        first &&
        (Math.hypot(first.center.x - next.center.x, first.center.y - next.center.y) >=
          1.1 ||
          Math.abs(next.scale / first.scale - 1) >= 0.01)
      )
        continue;
      const result = assign(index + 1, [...chosen, next]);
      if (result) return result;
    }
    return undefined;
  }
  const assigned = assign(0, []);
  if (!assigned)
    throw Error(
      "No distinct Radar financial paths share a common center and raw-USD scale",
    );
  return assigned.map((match, index) => ({
    label: series[index].label,
    values: series[index].values,
    ...match,
  }));
}
export async function radarFinancialPaint(
  page: Page,
  widget: Locator,
  series: ReturnType<typeof retainedRadarFixture>["series"],
  area = false,
) {
  const drawing = await radarDrawing(page, widget);
  try {
    expect(drawing.text.map((t) => t.text)).toEqual(
      expect.arrayContaining(["Q1", "Q2", "Q3", "Q4"]),
    );
    return { drawing, matches: matchRadarSeries(drawing, series, area) };
  } catch (error) {
    await test.info().attach("failed-current-radar-financial-paint", {
      body: JSON.stringify({ area, series, drawing }),
      contentType: "application/json",
    });
    throw error;
  }
}
type TooltipSeries = Pick<
  ReturnType<typeof matchRadarSeries>[number],
  "label" | "values" | "points"
>;
/** Default/reset markers have a five-pixel native hit radius; avoid overlapping years. */
export function radarTooltipTargets(matches: readonly TooltipSeries[]) {
  return matches.map((row, index) => {
    const others = matches.flatMap((other, otherIndex) =>
      otherIndex === index
        ? []
        : other.points.filter((_, quarter) => other.values[quarter] !== null),
    );
    const choices = row.points
      .flatMap((point, quarter) =>
        row.values[quarter] === null
          ? []
          : [
              {
                point,
                quarter,
                clearance: Math.min(
                  ...others.map((other) =>
                    Math.hypot(point.x - other.x, point.y - other.y),
                  ),
                ),
              },
            ],
      )
      .sort((a, b) => b.clearance - a.clearance);
    const target = choices[0];
    if (!target || target.clearance <= 5.5)
      throw Error(`No separated native tooltip vertex for ${row.label}`);
    return { ...target, row };
  });
}
export async function radarTooltips(
  page: Page,
  widget: Locator,
  matches: Awaited<ReturnType<typeof radarFinancialPaint>>["matches"],
) {
  const bounds = await widget.locator("canvas").first().boundingBox();
  if (!bounds) throw Error("Visible Radar canvas required");
  const observed = [];
  // One distinct financial point per series is enough to distinguish series ownership and raw values.
  for (const { row, quarter, point, clearance } of radarTooltipTargets(matches)) {
    await page.mouse.move(0, 0);
    await page.mouse.move(bounds.x + point.x, bounds.y + point.y);
    const escaped = row.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Native ECharts HTML has no tooltip role; select its actual datum text inside this widget.
    const tip = widget.getByText(new RegExp(`^Q${quarter + 1}\\s*${escaped}:`, "i"));
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(new RegExp(`${escaped}:`, "i"));
    await expect(tip).toContainText(`Q${quarter + 1}`);
    await expect(tip).toContainText(
      expectedBoxTooltipNumber(row.values[quarter] as number),
    );
    observed.push({
      series: row.label,
      quarter: `Q${quarter + 1}`,
      usd: row.values[quarter],
      clearance,
      text: await tip.innerText(),
    });
  }
  await page.mouse.move(0, 0);
  return observed;
}
