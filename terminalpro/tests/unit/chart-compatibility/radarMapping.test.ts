import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);

import { translateRadar } from "../../../src/components/General/Table/Chart/echarts/radar";
import { radarData } from "../../../src/components/General/Table/Chart/echarts/radarData";
import {
  radarDomain,
  radarPoint,
} from "../../../src/components/General/Table/Chart/echarts/radarLayout";
import { radarRevenue } from "./fixtures/radarContract";
import { radarInput, radarOptions } from "./radar.fixtures";

it("keeps duplicate spokes and raw signed values without applying column scale", () => {
  const input = radarInput();
  const data = radarData(input);
  expect(data.categories).toEqual(["C", "A", "B", "D", "A", "E"]);
  expect(data.series[0].values).toEqual([10, -5, 0, null, 20, 30]);
  expect(data.series[0].id).toBe("primary");
  const domain = radarDomain(data, input, 240);
  expect(domain.extent).toEqual([-10, 30]);
  expect(domain.ticks).toEqual([-10, 0, 10, 20, 30]);
  expect(
    radarPoint(1, 6, -5, { center: [0, 0], radius: 240, inner: 0 }, domain.extent),
  ).toEqual([expect.closeTo(25.980762), expect.closeTo(-15)]);
});
it("uses radial span for nice domains, includes zero and leaves empty domains empty", () => {
  const input = radarInput();
  const data = radarData(input);
  expect(radarDomain(data, input, 60).ticks.length).toBeLessThan(
    radarDomain(data, input, 300).ticks.length,
  );
  for (const values of [
    [5, 5],
    [-5, -5],
    [0, 0],
  ]) {
    const d = { ...data, series: [{ ...data.series[0], values }] };
    const domain = radarDomain(d, input, 240);
    expect(domain.extent[0]).toBeLessThanOrEqual(0);
    expect(domain.extent[1]).toBeGreaterThanOrEqual(0);
    if (values[0] === 0)
      expect(
        radarPoint(0, 2, 0, { center: [0, 0], radius: 240, inner: 0 }, domain.extent),
      ).toEqual([expect.closeTo(0), -120]);
  }
  expect(radarDomain({ ...data, series: [] }, input, 240).ticks).toEqual([]);
});
it("hidden series leaves categories intact and cannot contribute domain", () => {
  const input = radarInput();
  const hidden = {
    ...input,
    context: { ...input.context, legendSelection: { secondary: false } },
  };
  const data = radarData(hidden);
  expect(data.categories).toHaveLength(6);
  expect(radarDomain(data, hidden, 240).extent).toEqual([-10, 30]);
  const only = {
    ...input,
    context: {
      ...input.context,
      legendSelection: { primary: false, secondary: false },
    },
  };
  expect(radarDomain(radarData(only), only, 240).ticks).toEqual([]);
});
it("keeps retained FMP USD exact and missing Q4 separate from geometry", () => {
  const input = radarInput();
  const ids = radarRevenue.series.map((s) => s.fiscalYear);
  const fmp = {
    ...input,
    assignments: ids.map((colId) => ({ colId })),
    snapshot: {
      ...input.snapshot,
      columns: [
        input.snapshot.columns[0],
        ...ids.map((id) => ({
          id,
          label: id,
          role: "number" as const,
          scale: 1000000,
        })),
      ],
      selectedColumnIds: ["period", ...ids],
      rows: radarRevenue.quarters.map((category, i) => ({
        id: category,
        category,
        values: Object.fromEntries(
          radarRevenue.series.map((s) => [s.fiscalYear, s.values[i]]),
        ),
      })),
    },
  };
  const data = radarData(fmp);
  expect(data.series[3].values).toEqual([
    143756000000,
    111184000000,
    109417000000,
    null,
  ]);
  expect(radarDomain(data, fmp, 240).extent).toEqual([0, 150000000000]);
  expect(radarOptions(fmp).series[0].data[0].rawValue).toBe(117154000000);
});
it("rejects nonfinite snapshot observations and malformed assignments", () => {
  const input = radarInput();
  expect(translateRadar({ ...input, assignments: [{ colId: "missing" }] }).status).toBe(
    "invalid",
  );
  expect(
    translateRadar({
      ...input,
      snapshot: {
        ...input.snapshot,
        rows: [
          { id: "x", category: "X", values: { primary: Number.POSITIVE_INFINITY } },
        ],
      },
    }).status,
  ).toBe("invalid");
});
