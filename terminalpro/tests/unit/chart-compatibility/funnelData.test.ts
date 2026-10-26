// @vitest-environment node
import { expect, it } from "vitest";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import type {
  SetupProjection,
  SetupSelection,
} from "../../../src/components/General/Table/Chart/application/setupTypes";
import {
  isFunnelFamily,
  nativeFunnelType,
} from "../../../src/components/General/Table/Chart/compatibility/funnelContracts";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { buildFunnelData } from "../../../src/components/General/Table/Chart/echarts/funnelData";

function capture(
  values: readonly (number | null)[] = [-10, 0, 20, 30, null],
): ChartSnapshot {
  return {
    stateAddress: "funnel",
    dataRevision: 1,
    sourceMode: "flat",
    originalModel: {},
    selectedRange: {},
    selectedColumnIds: ["stage", "value", "reserve"],
    categoryColumnId: "stage",
    columns: [
      { id: "stage", label: "Stage", role: "category" },
      { id: "reserve", label: "Reserve", role: "number" },
      {
        id: "value",
        label: "Level",
        role: "number",
        unit: "USD",
        scale: 1000,
        metadata: { nested: { values: [1] } },
      },
    ],
    rows: values.map((value, i) => ({
      id: String(i),
      category: i % 2 ? "East" : "West",
      values: { value, reserve: 100 + i },
    })),
  };
}
function project(source = capture(), selection: Partial<SetupSelection> = {}) {
  const result = projectOrdinarySetup(source, {
    categoryId: "stage",
    seriesIds: ["value", "reserve"],
    switchCategorySeries: false,
    ...selection,
  });
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value;
}
function ready(p = project(), family: "funnel" | "coneFunnel" | "pyramid" = "funnel") {
  const result = buildFunnelData(p, family);
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value;
}
function invalid(
  p: SetupProjection,
  family: "funnel" | "pyramid",
  code: string,
  path: readonly (string | number)[],
) {
  const result = buildFunnelData(p, family);
  expect(result.status).toBe("invalid");
  if (result.status !== "invalid") throw new Error("Expected diagnostics");
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code, path }));
  expect(result).not.toHaveProperty("value");
}
const values = (data: ReturnType<typeof ready>) =>
  data.stages.map((s) => (s.kind === "value" ? s.value : null));

it("maps the finite family vocabulary", () => {
  expect(["funnel", "coneFunnel", "pyramid"].map(isFunnelFamily)).toEqual([
    true,
    true,
    true,
  ]);
  expect([null, "cone-funnel", "bar", {}].map(isFunnelFamily)).toEqual([
    false,
    false,
    false,
    false,
  ]);
  expect([
    nativeFunnelType("funnel"),
    nativeFunnelType("coneFunnel"),
    nativeFunnelType("pyramid"),
  ]).toEqual(["funnel", "cone-funnel", "pyramid"]);
});
it("uses selected ID order, promotes fields and never selects a reserve implicitly", () => {
  expect(ready().field.id).toBe("value");
  expect(ready(project(capture(), { seriesIds: ["reserve", "value"] })).field.id).toBe(
    "reserve",
  );
  expect(ready(project(capture(), { seriesIds: ["reserve"] })).field.id).toBe(
    "reserve",
  );
  const p = project();
  expect(
    buildFunnelData(
      { ...p, snapshot: { ...p.snapshot, selectedColumnIds: ["stage"] } },
      "funnel",
    ),
  ).toMatchObject({ status: "empty", reason: "no-series" });
});
it("preserves duplicate identity, categories and aligned null/absent gaps", () => {
  const source = capture([-8, null, 0, 4]);
  const p = project({
    ...source,
    rows: [...source.rows, { id: "absent", category: 7, values: {} }],
  });
  const before = structuredClone(p);
  const data = ready(p);
  expect(
    data.stages.map((s) => [s.rowId, s.index, s.category, s.label, s.kind]),
  ).toEqual([
    ["0", 0, "West", "West", "value"],
    ["1", 1, "East", "East", "missing"],
    ["2", 2, "West", "West", "value"],
    ["3", 3, "East", "East", "value"],
    ["absent", 4, 7, "7", "missing"],
  ]);
  expect(data.stages[1]).toMatchObject({ reason: "null" });
  expect(data.stages[4]).toMatchObject({ reason: "absent" });
  expect(data).toMatchObject({ maxAbs: 8, magnitudeRatios: [1, null, 0, 0.5, null] });
  expect(p).toEqual(before);
});
it("reuses ordinary Sum/Count including missing rows and original source units", () => {
  const sum = ready(project(capture(), { aggFunc: "sum" }));
  expect(values(sum)).toEqual([10, 30]);
  const count = ready(project(capture(), { aggFunc: "count" }));
  expect(values(count)).toEqual([3, 2]);
  expect(count.observationKind).toBe("count");
  expect(count.field).toMatchObject({ unit: "observation-count", scale: 1 });
  expect(count.stages[0]).toMatchObject({
    origin: {
      kind: "count",
      sourceRowIds: ["0", "2", "4"],
      sourceColumnId: "value",
      unit: "USD",
      scale: 1000,
    },
  });
  expect(sum.stages[1]).toMatchObject({ origin: { sourceRowIds: ["1", "3"] } });
  expect(ready().stages).toHaveLength(5);
});
it("rejects actual switched setup and unsupported/missing provenance", () => {
  invalid(
    project(capture(), { switchCategorySeries: true }),
    "funnel",
    "funnel-orientation",
    ["setupProjection", "kind"],
  );
  const p = project(capture([1]));
  invalid({ ...p, valueOrigins: {} }, "funnel", "funnel-origin", [
    "rows",
    0,
    "values",
    "value",
  ]);
  for (const sourceRowIds of [[], [""]])
    invalid(
      {
        ...p,
        valueOrigins: {
          "0": { value: { kind: "source", sourceColumnId: "value", sourceRowIds } },
        },
      },
      "funnel",
      "funnel-origin",
      ["rows", 0, "values", "value"],
    );
  invalid(
    {
      ...p,
      valueOrigins: {
        "0": { value: { ...p.valueOrigins["0"].value, sourceColumnId: "reserve" } },
      },
    },
    "funnel",
    "funnel-source-column",
    ["rows", 0, "values", "value"],
  );
});
it("detaches metadata bidirectionally and source row arrays including empty metadata", () => {
  const p = project(capture([1]));
  const data = ready(p);
  const output = data.field.metadata as { nested: { values: number[] } };
  const input = p.snapshot.columns.find((c) => c.id === "value")?.metadata as {
    nested: { values: number[] };
  };
  output.nested.values.push(2);
  expect(input.nested.values).toEqual([1]);
  input.nested.values.push(3);
  expect(output.nested.values).toEqual([1, 2]);
  const stage = data.stages[0];
  if (stage.kind !== "value") throw new Error("Expected observation");
  (stage.origin.sourceRowIds as string[]).push("detached");
  expect(p.valueOrigins["0"].value.sourceRowIds).toEqual(["0"]);
  const missing = project(capture([null]));
  const empty = buildFunnelData(missing, "funnel");
  if (empty.status !== "empty" || !empty.field) throw new Error("Expected empty field");
  (empty.field.metadata as { nested: { values: number[] } }).nested.values.push(4);
  expect(missing.snapshot.columns.find((c) => c.id === "value")?.metadata).toEqual({
    nested: { values: [1] },
  });
});
it.each([
  "funnel",
  "coneFunnel",
] as const)("normalizes signed %s without overflow or zero division", (family) => {
  expect(ready(project(capture([-8, 0, 4])), family)).toMatchObject({
    maxAbs: 8,
    magnitudeRatios: [1, 0, 0.5],
  });
  expect(values(ready(project(capture([-8, 0, 4])), family))).toEqual([-8, 0, 4]);
  expect(ready(project(capture([0, 0])), family)).toMatchObject({
    maxAbs: 0,
    magnitudeRatios: [0, 0],
  });
  expect(
    ready(project(capture([Number.MAX_VALUE, -Number.MAX_VALUE])), family),
  ).toMatchObject({ magnitudeRatios: [1, 1] });
});
it.each([
  [1, 1],
  [Number.MAX_VALUE, Number.MAX_VALUE],
  [Number.MIN_VALUE, Number.MIN_VALUE],
])("uses stable axial half ranges for %j", (a, b) => {
  expect(ready(project(capture([a, b])), "pyramid")).toMatchObject({
    scaledTotal: 2,
    axialRanges: [
      { start: 0, end: 0.5 },
      { start: 0.5, end: 1 },
    ],
  });
});
it("keeps missing gaps, zero extents and raw values through geometry underflow", () => {
  const data = ready(
    project(capture([0, Number.MIN_VALUE, null, Number.MAX_VALUE, 0])),
    "pyramid",
  );
  expect(data).toMatchObject({
    axialRanges: [
      { start: 0, end: 0 },
      { start: 0, end: 0 },
      null,
      { start: 0, end: 1 },
      { start: 1, end: 1 },
    ],
  });
  expect(values(data)).toEqual([0, Number.MIN_VALUE, null, Number.MAX_VALUE, 0]);
  expect(ready(project(capture([1, 1, 1])), "pyramid")).toMatchObject({
    axialRanges: [
      { start: 0, end: 1 / 3 },
      { start: 1 / 3, end: 2 / 3 },
      { start: 2 / 3, end: 1 },
    ],
  });
});
it("rejects negative Pyramid and zero total", () => {
  invalid(project(capture([2, -1])), "pyramid", "pyramid-negative", [
    "rows",
    1,
    "values",
    "value",
  ]);
  invalid(project(capture([0, 0])), "pyramid", "pyramid-total", ["rows"]);
});
it.each([
  undefined,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  "1",
])("rejects malformed own value %s", (value) => {
  const p = project(capture([1]));
  const malformed = {
    ...p,
    snapshot: { ...p.snapshot, rows: [{ ...p.snapshot.rows[0], values: { value } }] },
  } as unknown as SetupProjection;
  invalid(malformed, "funnel", "funnel-value", ["rows", 0, "values", "value"]);
});
it("returns empty identities and recovers on restored observations", () => {
  expect(buildFunnelData(project(capture([])), "funnel")).toMatchObject({
    status: "empty",
    reason: "no-rows",
    stages: [],
  });
  expect(buildFunnelData(project(capture([null])), "funnel")).toMatchObject({
    status: "empty",
    reason: "no-values",
    stages: [{ rowId: "0", index: 0, category: "West", label: "West" }],
  });
  expect(ready(project(capture([1]))).stages).toHaveLength(1);
});
it("retains reconciled AAPL FY2026 Q2 reported USD levels", () => {
  // Reconciled 2026-10-26, assessment-review.md: reported 2026-03-28 levels overlap financially.
  // Retained FMP source SHA-256: 390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b.
  const reported = [111184000000, 54781000000, 35885000000, 35833000000, 29578000000];
  expect(values(ready(project(capture(reported))))).toEqual(reported);
});
it("retains small scaled contributions and bounded cumulative ranges", () => {
  const observations = [1, ...Array<number>(1000).fill(1e-16)];
  const data = ready(project(capture(observations)), "pyramid");
  if (data.family !== "pyramid") throw new Error("Expected pyramid");
  expect(data.scaledTotal).toBe(1.0000000000001);
  expect(values(data)).toEqual(observations);
  let previous = 0;
  for (const range of data.axialRanges) {
    if (!range) throw new Error("No missing observations");
    expect(range.start).toBe(previous);
    expect(range.end).toBeGreaterThanOrEqual(range.start);
    expect(range.end).toBeLessThanOrEqual(1);
    expect(Number.isFinite(range.end)).toBe(true);
    previous = range.end;
  }
  expect(previous).toBe(1);
});
