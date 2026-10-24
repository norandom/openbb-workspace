import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { nightingaleRevenueComponents as financial } from "../../unit/chart-compatibility/fixtures/nightingaleContract";
import { expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expect } from "./fixtures";
import { currentPie, type Drawing, hoverSector, stablePie } from "./pie-observer";

// CSV fields retain provider-derived spelling; Workspace projects readable headers
// through convertToReadableLabel (pinned original AgGridUtils.tsx).
export const sourceLabels = ["Cost of revenue (USD)", "Gross profit (USD)"] as const;
export const labels = ["Cost Of Revenue (USD)", "Gross Profit (USD)"] as const;
export type Mode = "grouped" | "stacked" | "normalized";
export function retainedNightingale() {
  const directory = (key: string) => {
    const value = process.env[key];
    if (!value || !isAbsolute(value))
      throw Error(`Absolute retained directory required: ${key}`);
    return value;
  };
  const raw = readFileSync(join(directory("QOPENBB_BOX_FMP_EVIDENCE"), "raw.json"));
  expect(createHash("sha256").update(raw).digest("hex")).toBe(financial.sourceSha256);
  const root = directory("QOPENBB_NIGHTINGALE_FMP_EVIDENCE");
  const csv = readFileSync(join(root, "fy2025-components.csv"), "utf8");
  const json = readFileSync(join(root, "fy2025-components.json"), "utf8");
  const provenance = JSON.parse(json);
  expect(provenance).toMatchObject({
    symbol: "AAPL",
    fiscalYear: "2025",
    currency: "USD",
    sourceRawSha256: financial.sourceSha256,
    selectedFields: ["costOfRevenue", "grossProfit"],
    referenceField: "revenue",
  });
  const records = (
    JSON.parse(raw.toString("utf8")) as Record<string, unknown>[]
  ).filter((r) => r.symbol === "AAPL" && String(r.fiscalYear) === "2025");
  expect(records).toHaveLength(4);
  const values = [financial.costOfRevenue, financial.grossProfit];
  for (const [q, period] of financial.quarters.entries()) {
    const matches = records.filter((r) => r.period === period);
    expect(matches).toHaveLength(1);
    const expected = {
      date: financial.dates[q],
      costOfRevenue: values[0][q],
      grossProfit: values[1][q],
      revenue: financial.revenue[q],
    };
    expect(matches[0]).toMatchObject({ ...expected, reportedCurrency: "USD" });
    expect(provenance.observations[q]).toMatchObject({
      ...expected,
      fiscalYear: "2025",
      period,
    });
    for (const value of [values[0][q], values[1][q], financial.revenue[q]])
      expect(Number.isSafeInteger(value)).toBe(true);
    expect(BigInt(values[0][q]) + BigInt(values[1][q])).toBe(
      BigInt(financial.revenue[q]),
    );
  }
  expect(csv.replaceAll("\r\n", "\n")).toBe(
    `Quarter,${sourceLabels.join(",")}\n${financial.quarters.map((quarter, q) => `${quarter},${values[0][q]},${values[1][q]}`).join("\n")}\n`,
  );
  return {
    csv,
    values,
    financial,
    hashes: {
      raw: financial.sourceSha256,
      csv: createHash("sha256").update(csv).digest("hex"),
      json: createHash("sha256").update(json).digest("hex"),
    },
  };
}

// Reset observation and force actual host resize; stable screenshots alone can retain stale paint.
export async function freshNightingale(page: Page, widget: Locator) {
  const viewport = page.viewportSize();
  if (!viewport) throw Error("Fixed isolated viewport required");
  await page.evaluate(() => {
    (window as unknown as { pieDrawing: Drawing }).pieDrawing = {
      sectors: [],
      text: [],
      outlines: [],
      lines: [],
    };
  });
  await page.setViewportSize({ ...viewport, width: viewport.width + 2 });
  await stablePie(page, widget);
  await page.setViewportSize(viewport);
  await stablePie(page, widget);
  return currentPie(page, widget, (d) => d.text.some((t) => t.text === "Q1"));
}
export async function outerCircleCrop(page: Page, widget: Locator, drawing: Drawing) {
  const circle = drawing.outlines
    .filter((a) => Math.abs(a.end - a.start) >= Math.PI * 2 - 0.001)
    .sort((a, b) => b.radius - a.radius)[0];
  if (!circle)
    throw Error("Native full outer circle required for isolated Thickness evidence");
  const canvas = await widget.locator("canvas").first().boundingBox();
  if (!canvas) throw Error("Visible native Nightingale canvas required");
  // The diagonal outer boundary is clear of top ticks and cardinal category labels.
  // All financial bars must leave this crop clear, so only axis paint can change it.
  expect(Math.max(...drawing.sectors.map((s) => s.radius))).toBeLessThan(
    circle.radius - 12,
  );
  const x = circle.x + circle.radius / Math.sqrt(2);
  const y = circle.y + circle.radius / Math.sqrt(2);
  return {
    circle,
    bytes: await page.screenshot({
      clip: { x: canvas.x + x - 6, y: canvas.y + y - 6, width: 12, height: 12 },
    }),
  };
}
const angle = (s: { start: number; end: number }) => {
  const a = (s.start + s.end) / 2 + Math.PI / 2;
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
};
export async function financialPaint(
  page: Page,
  widget: Locator,
  source: ReturnType<typeof retainedNightingale>,
  mode: Mode,
  visible = [0, 1],
  innerRadiusRatio = 0,
) {
  const drawing = await freshNightingale(page, widget);
  const unique = [
    ...new Map(
      drawing.sectors.map((s) => [
        JSON.stringify([s.x, s.y, s.radius, s.inner, s.start, s.end]),
        s,
      ]),
    ).values(),
  ];
  expect(
    unique,
    "exactly one native bar per visible financial observation",
  ).toHaveLength(4 * visible.length);
  expect(drawing.text.map((t) => t.text)).toEqual(
    expect.arrayContaining([...financial.quarters, ...labels]),
  );
  const matched = [];
  for (let q = 0; q < 4; q++) {
    const bars = unique
      .filter(
        (s) =>
          Math.abs(
            Math.atan2(
              Math.sin(angle(s) - (q * Math.PI) / 2),
              Math.cos(angle(s) - (q * Math.PI) / 2),
            ),
          ) <
          Math.PI / 4,
      )
      .sort((a, b) => (mode === "grouped" ? angle(a) - angle(b) : a.inner - b.inner));
    // The top grouped pair straddles angle zero.
    if (mode === "grouped" && q === 0)
      bars.sort(
        (a, b) =>
          Math.atan2(Math.sin(angle(a)), Math.cos(angle(a))) -
          Math.atan2(Math.sin(angle(b)), Math.cos(angle(b))),
      );
    expect(bars).toHaveLength(visible.length);
    let total = 0;
    for (const [j, field] of visible.entries()) {
      const raw = source.values[field][q];
      const denominator = visible.reduce(
        (sum, index) => sum + source.values[index][q],
        0,
      );
      const low = mode === "grouped" ? 0 : total;
      total += raw;
      const factor = mode === "normalized" ? 100 / denominator : 1;
      const sector = bars[j];
      matched.push({
        sector,
        q,
        field,
        raw,
        low: low * factor,
        high: (low + raw) * factor,
      });
      expect(sector.shadowBlur).toBe(0);
      if (j > 0 && mode !== "grouped")
        expect(sector.inner).toBeCloseTo(bars[j - 1].radius, 1);
    }
  }
  const offset = matched[0].sector.inner;
  const outerRadius = Math.max(
    ...drawing.outlines.map((a) => a.radius),
    ...unique.map((s) => s.radius),
  );
  expect(
    offset / outerRadius,
    "native inner boundary follows the requested nonzero axis ratio",
  ).toBeCloseTo(innerRadiusRatio, 3);
  const scale = (matched[0].sector.radius - offset) / matched[0].high;
  for (const m of matched) {
    expect(m.sector.inner).toBeCloseTo(offset + m.low * scale, 1);
    expect(m.sector.radius).toBeCloseTo(offset + m.high * scale, 1);
    const center = angle(m.sector);
    const expected =
      (m.q * Math.PI) / 2 +
      (mode === "grouped"
        ? (((visible.indexOf(m.field) + 0.5) / visible.length - 0.5) * Math.PI) / 2
        : 0);
    expect(
      Math.abs(Math.atan2(Math.sin(center - expected), Math.cos(center - expected))),
    ).toBeLessThan(0.02);
  }
  if (mode === "normalized") {
    expect(drawing.text.some((t) => t.text === "100")).toBe(true);
    expect(drawing.text.some((t) => /^\d+%$/.test(t.text))).toBe(false);
  }
  return { drawing, matched };
}
export async function financialTooltips(
  page: Page,
  widget: Locator,
  matched: Awaited<ReturnType<typeof financialPaint>>["matched"],
) {
  const tips = [];
  for (const m of matched) {
    await page.mouse.move(0, 0);
    await hoverSector(page, widget, m.sector);
    const tip = widget.getByText(
      new RegExp(
        `^Q${m.q + 1}\\s*${labels[m.field].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`,
        "i",
      ),
    );
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(expectedBoxTooltipNumber(m.raw));
    await expect(tip).toContainText("USD");
    await expect(tip).not.toContainText("%");
    tips.push({
      quarter: `Q${m.q + 1}`,
      field: labels[m.field],
      usd: m.raw,
      text: await tip.innerText(),
    });
  }
  await page.mouse.move(0, 0);
  return tips;
}

// Original AG sectors use Path2D/offscreen paint. Targets are source-derived hypotheses;
// exact native tooltip identity, rather than an inferred sector boundary, is the oracle.
export async function originalFinancialTips(
  page: Page,
  widget: Locator,
  source: ReturnType<typeof retainedNightingale>,
) {
  const drawing = await freshNightingale(page, widget);
  const top = drawing.text.find((t) => t.text === "Q1");
  const ticks = drawing.text
    .filter((t) => /^\d[\d,]*(?:\.\d+)?(?: [MBT])?$/.test(t.text))
    .map((t) => {
      // Original themes.tsx radius-number uses formatNumberMagnitude(value, 2).
      // Pinned financialFormatting.sources.json owns its M/B/T suffix contract.
      const match = /^(\d[\d,]*(?:\.\d+)?)(?: ([MBT]))?$/.exec(t.text)!;
      const multiplier = { M: 1e6, B: 1e9, T: 1e12 };
      return {
        ...t,
        value:
          Number(match[1].replaceAll(",", "")) *
          (match[2] ? multiplier[match[2] as keyof typeof multiplier] : 1),
      };
    })
    .sort((a, b) => a.value - b.value);
  const zero = ticks.find((t) => t.value === 0);
  const outer = ticks.at(-1);
  if (!top || !zero || !outer || outer.value <= 0)
    throw Error("Original numerical tick anchors required");
  const scale = (zero.y - outer.y) / outer.value;
  expect(scale).toBeGreaterThan(0);
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw Error("Original canvas required");
  const tips = [];
  for (let q = 0; q < 4; q++)
    for (let field = 0; field < 2; field++) {
      const raw = source.values[field][q];
      const midpoint = raw / 2 + (field === 1 ? source.values[0][q] : 0);
      const theta = -Math.PI / 2 + (q * Math.PI) / 2;
      await page.mouse.move(0, 0);
      await page.mouse.move(
        box.x + top.x + scale * midpoint * Math.cos(theta),
        box.y + zero.y + scale * midpoint * Math.sin(theta),
      );
      const tip = page.locator(".ag-charts-tooltip").filter({ visible: true }).last();
      await expect(tip).toBeVisible();
      await expect(tip).toContainText(`Q${q + 1}`);
      await expect(tip).toContainText(labels[field]);
      await expect(tip).toContainText(expectedBoxTooltipNumber(raw));
      tips.push({
        quarter: `Q${q + 1}`,
        field: labels[field],
        usd: raw,
        text: await tip.innerText(),
      });
    }
  await page.mouse.move(0, 0);
  return tips;
}
