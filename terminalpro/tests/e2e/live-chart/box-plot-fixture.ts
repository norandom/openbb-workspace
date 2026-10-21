import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";
import {
  currentHistogram,
  observeHistogram,
  type Rectangle,
} from "./histogram-observer";
import { currentPie, type Drawing, observePie, toggle } from "./pie-observer";

export const fields = ["revenue", "netIncome"] as const;
export type Field = (typeof fields)[number];
export type Summary = {
  numeric_count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
};
export type Group = { category: string; fields: Record<Field, Summary | null> };
export type Observation = {
  category: string;
  revenue: number | null;
  netIncome: number | null;
};
export type Direction = "vertical" | "horizontal";
export const rawHash =
  "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b";
export const csvHash =
  "120e1dac7d9e0a541293fb9c8d40982959ce3a03fa8b33ef027ea52ceceb32cb";

// Independently calculate the retained proxy's interpolated quartiles and absolute whiskers.
export function summary(observations: readonly (number | null)[]): Summary | null {
  const values = observations
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const quantile = (q: number) => {
    const position = (values.length - 1) * q;
    const lower = Math.floor(position);
    return (
      values[lower] +
      (position - lower) * ((values[lower + 1] ?? values[lower]) - values[lower])
    );
  };
  return {
    numeric_count: values.length,
    min: values[0],
    q1: quantile(0.25),
    median: quantile(0.5),
    q3: quantile(0.75),
    max: values.at(-1)!,
  };
}

export function grouped(rows: readonly Observation[]): Group[] {
  return [...new Set(rows.map((row) => row.category))].map((category) => {
    const selected = rows.filter((row) => row.category === category);
    return {
      category,
      fields: {
        revenue: summary(selected.map((r) => r.revenue)),
        netIncome: summary(selected.map((r) => r.netIncome)),
      },
    };
  });
}

export function retainedBoxFixture() {
  const directory = process.env.QOPENBB_BOX_FMP_EVIDENCE;
  if (!directory || !isAbsolute(directory))
    throw Error(
      "Set QOPENBB_BOX_FMP_EVIDENCE to the absolute retained chart-box/fmp directory; missing evidence is unverified",
    );
  const raw = readFileSync(join(directory, "raw.json"));
  const bytes = readFileSync(join(directory, "quarter.csv"));
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
    rows: 40,
    category_field: "FiscalYearCategory",
    numeric_fields: fields,
    units: {
      revenue: "USD original reported amount",
      netIncome: "USD original reported amount",
    },
    date_min: "2016-09-24",
    date_max: "2026-06-27",
  });
  type Raw = {
    date: string;
    fiscalYear: string;
    period: string;
    symbol: string;
    reportedCurrency: string;
    revenue: number;
    netIncome: number;
  };
  const rows = (JSON.parse(raw.toString("utf8")) as Raw[]).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  expect(rows).toHaveLength(40);
  expect(new Set(rows.map((row) => row.date)).size).toBe(40);
  const csv = bytes.toString("utf8");
  const records = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
  expect(records.shift()).toEqual([
    "FiscalYearCategory",
    ...fields,
    "ReportingDate",
    "Period",
    "FiscalYear",
    "Symbol",
    "ReportedCurrency",
  ]);
  const labels = new Map<string, string>(
    provenance.groups.map((group: { fiscalYear: string; category: string }) => [
      group.fiscalYear,
      group.category,
    ]),
  );
  const observations = rows.map((row) => {
    expect(row).toMatchObject({ symbol: "AAPL", reportedCurrency: "USD" });
    expect(row.period).toMatch(/^Q[1-4]$/);
    fields.forEach((field) => expect(Number.isFinite(row[field])).toBe(true));
    const category = labels.get(String(row.fiscalYear));
    expect(category).toBeDefined();
    return { category: category!, revenue: row.revenue, netIncome: row.netIncome };
  });
  expect(records).toEqual(
    rows.map((row, i) => [
      observations[i].category,
      String(row.revenue),
      String(row.netIncome),
      row.date,
      row.period,
      String(row.fiscalYear),
      row.symbol,
      row.reportedCurrency,
    ]),
  );
  const groups = grouped(observations);
  expect(groups).toHaveLength(11);
  expect(groups).toEqual(
    provenance.groups.map((group: Group) => ({
      category: group.category,
      fields: group.fields,
    })),
  );
  expect(groups[0]).toMatchObject({
    category: "FY 2016 (partial: 1/4 quarters)",
    fields: { revenue: { numeric_count: 1 }, netIncome: { numeric_count: 1 } },
  });
  expect(groups.at(-1)).toMatchObject({
    category: "FY 2026 (partial: 3/4 quarters)",
    fields: { revenue: { numeric_count: 3 }, netIncome: { numeric_count: 3 } },
  });
  return { csv, observations, groups, provenance };
}

export function candidateIdentity() {
  expect(process.env.QOPENBB_CANDIDATE_SOURCE).toMatch(/^[a-f0-9]{40}$/);
  expect(process.env.QOPENBB_CANDIDATE_IMAGE).toMatch(/^sha256:[a-f0-9]{64}$/);
  return {
    workspace_source: process.env.QOPENBB_CANDIDATE_SOURCE,
    candidate_image: process.env.QOPENBB_CANDIDATE_IMAGE,
  };
}

export async function observeBox(page: Page) {
  await observeHistogram(page);
  await observePie(page);
}

export async function setupBox(editor: Locator, category = "FiscalYearCategory") {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption(category);
  await toggle(editor, "Aggregate", false);
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  const labels = {} as Record<Field, string>;
  for (const field of fields) {
    const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
    const options = await add.locator("option").allTextContents();
    const label = options.find(
      (text) => text.replace(/[^a-z]/gi, "").toLowerCase() === field.toLowerCase(),
    );
    expect(label, `the retained numeric field ${field} is selectable`).toBeDefined();
    labels[field] = label!;
    await add.selectOption({ label: label! });
  }
  await expect(remove).toHaveCount(2);
  await expect(
    editor.getByRole("switch", { name: "Switch Category / Series", exact: true }),
  ).toHaveCount(0);
  return labels;
}

function numeric(text: string) {
  const match = text
    .replaceAll(",", "")
    .replaceAll("−", "-")
    .trim()
    .match(/^([-+]?\d*\.?\d+)\s*([KMBT])?$/i);
  const factor: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return match ? Number(match[1]) * (factor[match[2]?.toLowerCase()] ?? 1) : Number.NaN;
}

export type BoxDrawing = Drawing & { rectangles: Rectangle[] };
export async function currentBox(page: Page, widget: Locator): Promise<BoxDrawing> {
  // The existing resize helper clears stale frames in both public observers.
  const histogram = await currentHistogram(page, widget);
  const drawing = await currentPie(page, widget);
  return { ...drawing, rectangles: histogram.rectangles };
}

function valueAxis(drawing: BoxDrawing, direction: Direction, overview: boolean) {
  const along = direction === "vertical" ? "y" : "x";
  const across = along === "y" ? "x" : "y";
  const groups = new Map<number, Drawing["text"]>();
  for (const text of drawing.text.filter((t) => Number.isFinite(numeric(t.text)))) {
    const key = Math.round(text[across]);
    groups.set(key, [...(groups.get(key) ?? []), text]);
  }
  const candidates = [...groups.values()]
    .map((group) => [...new Map(group.map((t) => [numeric(t.text), t])).values()])
    .filter(
      (group) =>
        group.length >= 2 && Math.abs(group.at(-1)![along] - group[0][along]) > 25,
    )
    .sort((a, b) => a[0][across] - b[0][across]);
  const ticks = overview ? candidates.at(-1) : candidates[0];
  expect(
    ticks,
    "painted numeric labels establish the actual raw-value scale",
  ).toBeDefined();
  const ordered = [...ticks!].sort((a, b) => numeric(a.text) - numeric(b.text));
  const first = ordered[0];
  const last = ordered.at(-1)!;
  const scale =
    (last[along] - first[along]) / (numeric(last.text) - numeric(first.text));
  expect(direction === "vertical" ? scale < 0 : scale > 0).toBe(true);
  const position = (value: number) =>
    first[along] + (value - numeric(first.text)) * scale;
  for (const tick of ticks!)
    expect(Math.abs(position(numeric(tick.text)) - tick[along])).toBeLessThan(1);
  return { along, across, position, ticks: ticks!, scale } as const;
}

export type BoxMatch = {
  category: string;
  field: Field;
  summary: Summary;
  rectangle: Rectangle;
  caps: Drawing["lines"];
};
export function matchBoxes(
  drawing: BoxDrawing,
  groups: Group[],
  direction: Direction,
  selected: readonly Field[] = fields,
  capRatio = 0.5,
  overview = false,
): BoxMatch[] {
  const axis = valueAxis(drawing, direction, overview);
  const band = direction === "vertical" ? "x" : "y";
  const span = direction === "vertical" ? "width" : "height";
  const numericSpan = direction === "vertical" ? "height" : "width";
  const mainNumericBottom =
    direction === "horizontal"
      ? Math.min(...axis.ticks.map((t) => t.y))
      : Number.POSITIVE_INFINITY;
  const rectangles = [
    ...new Map(
      drawing.rectangles.map((r) => [
        JSON.stringify([r.x, r.y, r.width, r.height, r.fill]),
        r,
      ]),
    ).values(),
  ];
  const overviewBodies = overview
    ? rectangles
        .filter(
          (r) =>
            r.height > 0 &&
            r.height < 60 / groups.length &&
            r.y > mainNumericBottom - 60 &&
            r.y < mainNumericBottom - 4,
        )
        .sort((a, b) => a.y - b.y)
    : [];
  if (overview)
    expect(
      overviewBodies,
      "the full miniature retains every selected field/group band",
    ).toHaveLength(
      groups.reduce(
        (count, group) =>
          count + selected.filter((field) => group.fields[field]).length,
        0,
      ),
    );
  const used = new Set<Rectangle>();
  const result: BoxMatch[] = [];
  for (const group of groups)
    for (const field of selected) {
      const s = group.fields[field];
      if (!s) continue;
      const low = Math.min(axis.position(s.q1), axis.position(s.q3));
      const high = Math.max(axis.position(s.q1), axis.position(s.q3));
      const candidates = rectangles.filter(
        (r) =>
          !used.has(r) &&
          r[span] > 0 &&
          r[span] < 120 &&
          Math.abs(r[axis.along] - low) < 1.5 &&
          Math.abs(r[axis.along] + r[numericSpan] - high) < 1.5 &&
          (direction !== "horizontal" ||
            (overview
              ? r.y > mainNumericBottom - 60 && r.y < mainNumericBottom - 4
              : r.y < mainNumericBottom - 4)),
      );
      const label = drawing.text
        .filter((t) => t.text === group.category)
        .sort((a, b) => a.y - b.y)[0];
      candidates.sort(
        (a, b) =>
          (label
            ? Math.abs(a[band] + a[span] / 2 - label[band]) -
              Math.abs(b[band] + b[span] / 2 - label[band])
            : 0) || b[span] - a[span],
      );
      const rectangle = overview ? overviewBodies[result.length] : candidates[0];
      expect(
        rectangle,
        `${group.category}/${field}: the IQR body uses independently calculated raw q1/q3`,
      ).toBeDefined();
      expect(Math.abs(rectangle![axis.along] - low)).toBeLessThan(1.5);
      expect(
        Math.abs(rectangle![axis.along] + rectangle![numericSpan] - high),
      ).toBeLessThan(1.5);
      used.add(rectangle!);
      const center = rectangle![band] + rectangle![span] / 2;
      const caps = [s.min, s.max].map((value) => {
        const hit = drawing.lines.find(
          (line) =>
            line.points.length === 2 &&
            line.points.every(
              (point) => Math.abs(point[axis.along] - axis.position(value)) < 1.5,
            ) &&
            Math.abs((line.points[0][band] + line.points[1][band]) / 2 - center) < 2 &&
            Math.abs(
              Math.abs(line.points[1][band] - line.points[0][band]) -
                rectangle![span] * capRatio,
            ) < 2,
        );
        expect(
          hit,
          `${group.category}/${field}: a cap retains the absolute ${value === s.min ? "minimum" : "maximum"}, not an IQR fence`,
        ).toBeDefined();
        return hit!;
      });
      result.push({
        category: group.category,
        field,
        summary: s,
        rectangle: rectangle!,
        caps,
      });
    }
  expect(new Set(result.map((item) => item.rectangle)).size).toBe(result.length);
  return result;
}

export async function verifyBox(
  page: Page,
  widget: Locator,
  groups: Group[],
  direction: Direction,
  labels: Record<Field, string>,
  selected: readonly Field[] = fields,
  capRatio = 0.5,
  tooltips = false,
) {
  const drawing = await currentBox(page, widget);
  const matches = matchBoxes(drawing, groups, direction, selected, capRatio);
  if (tooltips) {
    const bounds = await widget.locator("canvas").first().boundingBox();
    if (!bounds) throw Error("Visible Box canvas required");
    for (const match of matches) {
      const r = match.rectangle;
      await page.mouse.move(
        bounds.x + r.x + r.width / 2,
        bounds.y + r.y + r.height / 2,
      );
      const tooltip = widget.getByText(/Min:\s/).last();
      await expect(tooltip).toContainText(match.category);
      await expect(tooltip).toContainText(labels[match.field]);
      for (const [caption, key] of [
        ["Min", "min"],
        ["Q1", "q1"],
        ["Median", "median"],
        ["Q3", "q3"],
        ["Max", "max"],
      ] as const)
        await expect(tooltip).toContainText(
          `${caption}: ${match.summary[key].toLocaleString("en-US")}`,
        );
      await expect(tooltip).not.toContainText(/(?:\d\s?[BMT]|Frequency:|FiscalYear:)/);
    }
    await page.mouse.move(0, 0);
  }
  return { drawing, matches };
}

export async function clickBoxLegend(page: Page, widget: Locator, label: string) {
  const drawing = await currentPie(page, widget, (d) =>
    d.text.some((t) => t.text === label),
  );
  const text = drawing.text.find((t) => t.text === label)!;
  const bounds = await widget.locator("canvas").first().boundingBox();
  if (!bounds) throw Error("Visible Box legend canvas required");
  await page.mouse.click(
    bounds.x + text.bounds.x + text.bounds.width / 2,
    bounds.y + text.bounds.y + text.bounds.height / 2,
  );
}
