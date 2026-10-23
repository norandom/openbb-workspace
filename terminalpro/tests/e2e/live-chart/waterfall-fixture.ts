import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { type BoxDrawing, currentBox, observeBox } from "./box-plot-fixture";
import { observeDrawnText } from "./diagnostics";
import { expect } from "./fixtures";
import type { Rectangle } from "./histogram-observer";

export type Direction = "vertical" | "horizontal";
export type Movement = { category: string; delta: number; start: number; end: number };
export type Match = Movement & { rectangle: Rectangle };
export const rawHash =
  "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b";
export const csvHash =
  "e7ab84a4fd92a0afa0ca53422ed9e430ded9ff200209bc158047439f7a7c41b5";
const categories = [
  "Revenue",
  "Cost of revenue",
  "Operating expenses",
  "Other income / expenses, net",
  "Income tax expense",
];
const deltas = [109417000000n, -54647000000n, -19075000000n, 572000000n, -6478000000n];
const balances = [
  109417000000n,
  54770000000n,
  35695000000n,
  36267000000n,
  29789000000n,
];
const fields = [
  "revenue",
  "costOfRevenue",
  "operatingExpenses",
  "totalOtherIncomeExpensesNet",
  "incomeTaxExpense",
];
const reported = ["grossProfit", "operatingIncome", "incomeBeforeTax", "netIncome"];

function absoluteDirectory(name: string) {
  const directory = process.env[name];
  if (!directory || !isAbsolute(directory))
    throw Error(`Absolute retained evidence directory required: ${name}`);
  return directory;
}

// BigInt checks whole reported USD independently of production cumulative/formatting helpers.
export function retainedWaterfallFixture() {
  const directory = absoluteDirectory("QOPENBB_WATERFALL_FMP_EVIDENCE");
  const raw = readFileSync(
    join(absoluteDirectory("QOPENBB_BOX_FMP_EVIDENCE"), "raw.json"),
  );
  const bytes = readFileSync(join(directory, "waterfall.csv"));
  const provenance = JSON.parse(
    readFileSync(join(directory, "provenance.json"), "utf8"),
  );
  expect(createHash("sha256").update(raw).digest("hex")).toBe(rawHash);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(csvHash);
  expect(provenance).toMatchObject({
    endpoint: "https://financialmodelingprep.com/stable/income-statement",
    parameters: { symbol: "AAPL", period: "quarter", limit: "40" },
    retrieved_at_utc: "2026-10-20T14:06:05.149732+00:00",
    raw_sha256: rawHash,
    csv_sha256: csvHash,
    rows: 5,
    columns: ["Stage", "MovementUSD"],
    numeric_fields: ["MovementUSD"],
    units: { MovementUSD: "USD original reported amount; unscaled" },
    record: {
      symbol: "AAPL",
      date: "2026-06-27",
      fiscalYear: "2026",
      period: "Q3",
      reportedCurrency: "USD",
    },
  });
  const records = (
    JSON.parse(raw.toString("utf8")) as Record<string, unknown>[]
  ).filter((row) => row.date === "2026-06-27" && row.symbol === "AAPL");
  expect(records).toHaveLength(1);
  const record = records[0];
  expect(record).toMatchObject(provenance.record);
  const integer = (field: string) => {
    expect(
      Number.isSafeInteger(record[field]),
      `exact whole reported USD: ${field}`,
    ).toBe(true);
    return BigInt(record[field] as number);
  };
  const derived = fields.map(
    (field, index) => integer(field) * [1n, -1n, -1n, 1n, -1n][index],
  );
  expect(derived).toEqual(deltas);
  let balance = 0n;
  const movements = derived.map((delta, index) => {
    const start = balance;
    balance += delta;
    expect(balance).toBe(balances[index]);
    if (index > 0)
      expect(
        balance - integer(reported[index - 1]),
        `${reported[index - 1]} difference, USD`,
      ).toBe(0n);
    expect(provenance.movements[index]).toMatchObject({
      stage: categories[index],
      raw_field: fields[index],
      raw_value_usd: integer(fields[index]).toString(),
      movement_usd: delta.toString(),
      ending_balance_usd: balance.toString(),
    });
    return {
      category: categories[index],
      delta: Number(delta),
      start: Number(start),
      end: Number(balance),
    };
  });
  const csv = bytes.toString("utf8");
  const quote = (value: string) => (value.includes(",") ? `"${value}"` : value);
  expect(csv.replaceAll("\r\n", "\n")).toBe(
    `Stage,MovementUSD\n${movements.map((row) => `${quote(row.category)},${row.delta}`).join("\n")}\n`,
  );
  return { csv, movements, provenance };
}

export async function observeWaterfall(page: Page) {
  await observeDrawnText(page);
  await observeBox(page);
}

function numeric(text: string) {
  const match = text
    .replaceAll(",", "")
    .replaceAll("−", "-")
    .trim()
    .match(/^([-+]?\d*\.?\d+)\s*([KMBT])?$/i);
  const factors: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return match
    ? Number(match[1]) * (factors[match[2]?.toLowerCase()] ?? 1)
    : Number.NaN;
}

function axis(drawing: BoxDrawing, direction: Direction) {
  const along = direction === "vertical" ? "y" : "x";
  const across = direction === "vertical" ? "x" : "y";
  const groups = new Map<number, BoxDrawing["text"]>();
  for (const tick of drawing.text.filter((tick) =>
    Number.isFinite(numeric(tick.text)),
  )) {
    const key = Math.round(tick[across]);
    groups.set(key, [...(groups.get(key) ?? []), tick]);
  }
  const candidates = [...groups.values()]
    .map((ticks) => [
      ...new Map(ticks.map((tick) => [numeric(tick.text), tick])).values(),
    ])
    .filter(
      (ticks) =>
        ticks.length >= 2 &&
        Math.max(...ticks.map((tick) => tick[along])) -
          Math.min(...ticks.map((tick) => tick[along])) >
          40,
    )
    .sort((a, b) => a[0][across] - b[0][across]);
  const ticks = candidates[0];
  expect(
    ticks,
    "painted main-axis financial ticks establish raw-USD coordinates",
  ).toBeDefined();
  const ordered = ticks!.sort((a, b) => numeric(a.text) - numeric(b.text));
  const first = ordered[0];
  const last = ordered.at(-1)!;
  const scale =
    (last[along] - first[along]) / (numeric(last.text) - numeric(first.text));
  expect(direction === "vertical" ? scale < 0 : scale > 0).toBe(true);
  const pixel = (value: number) => first[along] + (value - numeric(first.text)) * scale;
  for (const tick of ticks!)
    expect(Math.abs(pixel(numeric(tick.text)) - tick[along])).toBeLessThan(1);
  return { along, across, pixel, ticks: ticks! } as const;
}

function visibleFinancialPaint(rectangle: Rectangle) {
  const fill = rectangle.fill.trim().toLowerCase();
  if (
    !Number.isFinite(rectangle.alpha) ||
    rectangle.alpha <= 0 ||
    ["", "none", "transparent"].includes(fill)
  )
    return false;
  const alpha =
    fill.match(/^(?:rgba|hsla)\([^)]*,\s*([\d.]+%?)\s*\)$/)?.[1] ??
    fill.match(/\/\s*([\d.]+%?)\s*\)$/)?.[1];
  if (alpha !== undefined && Number.parseFloat(alpha) <= 0) return false;
  return (
    !(/^#[\da-f]{4}$/.test(fill) && fill.endsWith("0")) &&
    !(/^#[\da-f]{8}$/.test(fill) && fill.endsWith("00"))
  );
}

function actualStrokeWidth(rectangle: Rectangle) {
  // A fill can inherit the preceding connector's canvas lineWidth without ever stroking its own path.
  return rectangle.strokeAlpha !== undefined && rectangle.strokeAlpha > 0
    ? rectangle.lineWidth
    : 0;
}

function categoryLabel(drawing: BoxDrawing, category: string) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
  const expected = normalize(category);
  const ordered = drawing.text.slice().sort((a, b) => a.y - b.y);
  for (const first of ordered) {
    let joined = normalize(first.text);
    if (joined === expected) return first;
    if (!expected.startsWith(`${joined} `)) continue;
    const fontSize = Number(first.font.match(/([\d.]+)px/)?.[1] ?? 12);
    let last = first;
    // Reassemble only consecutive painted lines on one category anchor, never words from neighboring labels.
    for (const next of ordered.filter(
      (text) =>
        text.y > first.y &&
        Math.abs(text.x - first.x) < 1.1 &&
        text.font === first.font &&
        text.fill === first.fill,
    )) {
      const gap = next.y - last.y;
      if (gap < fontSize * 0.7) continue;
      if (gap > fontSize * 1.8) break;
      joined += ` ${normalize(next.text)}`;
      if (joined === expected) return { ...first, y: (first.y + next.y) / 2 };
      if (!expected.startsWith(`${joined} `)) break;
      last = next;
    }
  }
  return undefined;
}

export function matchWaterfall(
  drawing: BoxDrawing,
  movements: Movement[],
  direction: Direction,
  requireAll = true,
): Match[] {
  const a = axis(drawing, direction);
  const band = direction === "vertical" ? "width" : "height";
  const span = direction === "vertical" ? "height" : "width";
  const numericBottom =
    direction === "horizontal"
      ? Math.min(...a.ticks.map((t) => t.y))
      : Number.POSITIVE_INFINITY;
  const rectangles = [
    ...new Map(
      drawing.rectangles
        .filter(visibleFinancialPaint)
        .map((r) => [JSON.stringify([r.x, r.y, r.width, r.height, r.fill]), r]),
    ).values(),
  ];
  const used = new Set<Rectangle>();
  const matches: Match[] = [];
  for (const row of movements) {
    const low = Math.min(a.pixel(row.start), a.pixel(row.end));
    const high = Math.max(a.pixel(row.start), a.pixel(row.end));
    const category = categoryLabel(drawing, row.category);
    const fontSize = Number(category?.font.match(/([\d.]+)px/)?.[1] ?? 12);
    const alignmentTolerance =
      direction === "vertical" ? 1.1 : Math.max(1.1, fontSize * 0.6);
    const candidates = rectangles.filter(
      (r) =>
        !used.has(r) &&
        category !== undefined &&
        Math.abs(r[a.across] + r[band] / 2 - category[a.across]) <=
          alignmentTolerance &&
        r[band] > 2 &&
        r.y < numericBottom - 3 &&
        Math.abs(r[a.along] - low) < 1.1 &&
        Math.abs(r[span] - Math.max(actualStrokeWidth(r), high - low)) < 1.1,
    );
    candidates.sort((x, y) =>
      category
        ? Math.abs(x[a.across] + x[band] / 2 - category[a.across]) -
          Math.abs(y[a.across] + y[band] / 2 - category[a.across])
        : 0,
    );
    const rectangle = candidates[0];
    if (requireAll)
      expect(
        rectangle,
        `${row.category}: raw signed movement spans ${row.start} to ${row.end} USD`,
      ).toBeDefined();
    if (rectangle) {
      const previous = matches.at(-1)?.rectangle;
      if (previous)
        expect(
          rectangle[a.across] + rectangle[band] / 2,
          `${row.category}: source order advances along the actual category axis`,
        ).toBeGreaterThan(previous[a.across] + previous[band] / 2);
      used.add(rectangle);
      matches.push({ ...row, rectangle });
    }
  }
  if (requireAll) expect(matches).toHaveLength(movements.length);
  return matches;
}

export async function waterfallGeometry(
  page: Page,
  widget: Locator,
  movements: Movement[],
  direction: Direction,
) {
  const drawing = await currentBox(page, widget);
  return { drawing, matches: matchWaterfall(drawing, movements, direction) };
}

export function navigatorTrack(drawing: BoxDrawing, height: number) {
  const tracks = [
    ...new Map(
      drawing.rectangles
        .filter(
          (r) =>
            Math.abs(r.height - 40) < 0.5 &&
            r.width > 200 &&
            r.y > height / 2 &&
            r.fill.replaceAll(" ", "") === "rgba(0,0,0,0)",
        )
        .map((r) => [JSON.stringify([r.x, r.y, r.width, r.height]), r]),
    ).values(),
  ];
  const widest = Math.max(...tracks.map((r) => r.width));
  const full = tracks.filter((r) => Math.abs(r.width - widest) < 0.1);
  expect(full, "one full-width native miniature track").toHaveLength(1);
  return full[0];
}

export function miniature(
  drawing: BoxDrawing,
  track: Rectangle,
  fills: string[],
  movements: Movement[],
) {
  const rects = [
    ...new Map(
      drawing.rectangles
        .filter(
          (r) =>
            r.x >= track.x - 1 &&
            r.x + r.width <= track.x + track.width + 1 &&
            r.y >= track.y - 1 &&
            r.y + r.height <= track.y + track.height + 1 &&
            r.width > 1 &&
            r.height > 0 &&
            visibleFinancialPaint(r) &&
            fills.includes(r.fill),
        )
        .map((r) => [JSON.stringify([r.x, r.y, r.width, r.height, r.fill]), r]),
    ).values(),
  ];
  expect(
    rects,
    "full miniature paints all five original cumulative movements",
  ).toHaveLength(5);
  const ordered = rects.sort((a, b) => a.x - b.x);
  const baseline = ordered[0].y + ordered[0].height;
  const scale = ordered[0].height / movements[0].delta;
  for (let index = 0; index < movements.length; index++) {
    const row = movements[index];
    const rectangle = ordered[index];
    const start = baseline - row.start * scale;
    const end = baseline - row.end * scale;
    expect(
      Math.abs(rectangle.y - Math.min(start, end)),
      `${row.category}: miniature absolute balance`,
    ).toBeLessThan(1.1);
    expect(
      Math.abs(rectangle.height - Math.abs(start - end)),
      `${row.category}: miniature raw movement span`,
    ).toBeLessThan(1.1);
    expect(
      Math.abs(rectangle.width - ordered[0].width),
      "miniature retains equal source category bands",
    ).toBeLessThan(0.1);
  }
  return rects
    .map((r) =>
      [r.x - track.x, r.y - track.y, r.width, r.height, r.fill].map((v) =>
        typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
      ),
    )
    .sort();
}
