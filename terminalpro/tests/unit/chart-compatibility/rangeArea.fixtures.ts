import type { RangeAreaMappingInput } from "../../../src/components/General/Table/Chart/echarts/rangeAreaTypes";
import { type Mutable, rangeInput } from "./rangeBar.fixtures";
/** FMP stable/income-statement AAPL quarter limit40, retrieved 2026-10-20T14:06:05.149732+00:00; raw reported USD. Observed quarterly dispersion, not annual totals. */
export const fmpProvenance = {
  fieldMapping: "amount=revenue; other=netIncome; raw reported USD",
  rawSha256: "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b",
  quarterSha256: "120e1dac7d9e0a541293fb9c8d40982959ce3a03fa8b33ef027ea52ceceb32cb",
  provenanceSha256: "06766113523f5990f8c37cee1b4cb337fef57df9b6fbfc27ac84349fbb348456",
};
export const fmpRows = [
  {
    id: "2016-09-24",
    category: "FY2016 (partial)",
    values: { amount: 46852000000, other: 9014000000 },
  },
  {
    id: "2016-12-31",
    category: "FY2017",
    values: { amount: 78351000000, other: 17891000000 },
  },
  {
    id: "2017-04-01",
    category: "FY2017",
    values: { amount: 52896000000, other: 11029000000 },
  },
  {
    id: "2017-07-01",
    category: "FY2017",
    values: { amount: 45408000000, other: 8717000000 },
  },
  {
    id: "2017-09-30",
    category: "FY2017",
    values: { amount: 52579000000, other: 10714000000 },
  },
];
export function areaInput(): Mutable<RangeAreaMappingInput> {
  const b = rangeInput();
  const fields = Object.fromEntries(
    Object.entries(b.style.fields).map(([id, s]) => [
      id,
      {
        ...s,
        marker: {
          enabled: true,
          shape: "circle",
          size: 6,
          strokeWidth: 2,
          fill: "#123456",
          fillOpacity: 0.8,
          stroke: "#654321",
          strokeOpacity: 0.7,
        },
        shadow: { enabled: true, color: "#112233", blur: 3, xOffset: 1, yOffset: 2 },
        interpolation: { type: "linear" },
        connectMissingData: false,
      },
    ]),
  );
  const { direction: _, band, ...style } = b.style;
  return {
    ...b,
    style: {
      ...style,
      band: { paddingInner: band.paddingInner, paddingOuter: band.paddingOuter },
      fields,
    },
  } as Mutable<RangeAreaMappingInput>;
}

export function fmpAreaInput(): Mutable<RangeAreaMappingInput> {
  const input = areaInput();
  input.snapshot.rows = structuredClone(fmpRows);
  input.snapshot.columns = input.snapshot.columns.map((c) => ({
    ...c,
    label:
      c.id === "other"
        ? "Net income <USD>"
        : c.id === "amount"
          ? "Revenue <USD>"
          : c.label,
  }));
  input.style.valueScale = {
    min: 0,
    max: 80000000000,
    ticks: [0, 11000000000, 80000000000],
  };
  return input;
}
