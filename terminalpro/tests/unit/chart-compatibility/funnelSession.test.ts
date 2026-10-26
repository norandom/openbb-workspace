import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { captureApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionCapture";
import { planApplicationRecapture } from "../../../src/components/General/Table/Chart/application/applicationSessionRecapture";
import {
  contextFor,
  initialApplicationSession,
  nextSessionStamp,
  synchronizeApplicationSession,
} from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { applyOrdinarySessionTransaction } from "../../../src/components/General/Table/Chart/application/applicationSessionTransactions";
import { applyFunnelSessionTransaction } from "../../../src/components/General/Table/Chart/application/funnelEditorTransaction";
import { projectFunnelSession } from "../../../src/components/General/Table/Chart/application/funnelSessionProjection";
import { selectFunnelSession } from "../../../src/components/General/Table/Chart/application/funnelSessionSelection";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import { observationSnapshotPolicy } from "../../../src/components/General/Table/Chart/application/histogramCapture";
import { funnelFixture, funnelState } from "./funnelSessionFixture";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 7 }),
  } as any),
);
afterEach(() => vi.restoreAllMocks());

function ready<T>(result: { status: string; value?: T }): T {
  expect(result.status, JSON.stringify(result)).toBe("ready");
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  return result.value!;
}
function draw(context = funnelFixture(), storage = {}) {
  return ready(
    projectFunnelSession(storage, context.inputs, funnelState(context, storage)),
  );
}
function edit(context: ReturnType<typeof funnelFixture>, intent: any, storage = {}) {
  return applyOrdinarySessionTransaction(storage, context, {
    stamp: context.local.stamp,
    family: context.inputs.family,
    intent,
  });
}
it.each([
  "funnel",
  "coneFunnel",
  "pyramid",
] as const)("captures %s absent, null and genuine zero through the ordinary capture owner", (family) => {
  const context = funnelFixture(family);
  const rows = [
    { id: "absent", period: "Absent", income: 3 },
    { id: "null", period: "Null", revenue: null, income: 2 },
    { id: "zero", period: "Zero", revenue: 0, income: 1 },
  ];
  const api = {
    isDestroyed: () => false,
    getGridOption: (key: string) => (key === "rowData" ? [] : undefined),
    getDisplayedRowCount: () => rows.length,
    getDisplayedRowAtIndex: (index: number) => rows[index],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
  };
  const capture = ready(
    captureDisplayedChart({
      api: api as any,
      stamp: context.local.stamp,
      range: context.local.range,
      categoryColumnId: "period",
      columns: context.inputs.columns.filter((column) => column.id !== "other"),
      originalModel: {},
      snapshotPolicy: observationSnapshotPolicy(family),
    }),
  );
  expect(capture.rows[0].values).not.toHaveProperty("revenue");
  expect(capture.rows[1].values.revenue).toBeNull();
  expect(capture.rows[2].values.revenue).toBe(0);
  if (family !== "pyramid") {
    const selected = selectFunnelSession({}, { ...context, capture });
    expect(selected.data).toMatchObject({
      status: "ready",
      value: {
        stages: [
          { kind: "missing", reason: "absent", rowId: "absent" },
          { kind: "missing", reason: "null", rowId: "null" },
          { kind: "value", value: 0, rowId: "zero" },
        ],
      },
    });
    expect(draw({ ...context, capture }).notice?.kind).toBe("missing-stages");
  }
});
it("keeps all ordered fields and promotes the first through real Set Up transactions", () => {
  const context = funnelFixture();
  const selected = selectFunnelSession({}, context);
  expect(selected.setup.seriesIds).toEqual(["revenue", "income"]);
  expect(selected.projection.snapshot.selectedColumnIds).toEqual(
    context.local.range.columnIds,
  );
  expect(selected.data).toMatchObject({
    status: "ready",
    value: { field: { id: "revenue" } },
  });
  const changed = ready(
    edit(context, {
      panel: "setup",
      edit: { kind: "series-order", ids: ["income", "revenue"] },
    }),
  );
  const next = { ...context, local: changed.local, capture: changed.capture! };
  expect(selectFunnelSession(changed.storage, next).data).toMatchObject({
    status: "ready",
    value: { field: { id: "income" } },
  });
  expect(draw(next, changed.storage).setupProps.value.series.map((s) => s.id)).toEqual([
    "income",
    "revenue",
  ]);
  expect(context.capture.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
});
it("retains an editable ready empty state and recovers by adding a series", () => {
  let context = funnelFixture();
  let storage = {};
  for (const id of ["revenue", "income"]) {
    const commit = ready(
      edit(context, { panel: "setup", edit: { kind: "series-remove", id } }, storage),
    );
    storage = commit.storage;
    context = {
      ...context,
      local: {
        ...commit.local,
        stamp: nextSessionStamp(context.local.stamp, commit.change),
      },
      capture: commit.capture!,
    };
  }
  const empty = draw(context, storage);
  expect(empty.notice).toMatchObject({
    kind: "empty",
    message: "No series selected. Add a series in Set Up.",
  });
  expect(empty.options.series).toEqual([]);
  expect(empty.setupProps.availableSeries).toContainEqual({
    value: "revenue",
    label: "Revenue",
  });
  const added = ready(
    edit(
      context,
      { panel: "setup", edit: { kind: "series-add", id: "income" } },
      storage,
    ),
  );
  expect(
    draw({ ...context, local: added.local, capture: added.capture! }, added.storage)
      .notice,
  ).toBeUndefined();
});
it.each([
  -5, 0,
])("keeps invalid Pyramid %s live, clears geometry and recovers on field promotion", (value) => {
  const source = funnelFixture("pyramid");
  const context = {
    ...source,
    capture: {
      ...source.capture,
      rows: source.capture.rows.map((row) => ({
        ...row,
        values: { ...row.values, revenue: value },
      })),
    },
  };
  const invalid = draw(context);
  expect(invalid.notice?.kind).toBe("invalid-data");
  expect(invalid.options.series).toEqual([]);
  expect(invalid.options.graphic).toEqual([]);
  expect(invalid.options.tooltip).toMatchObject({ show: false });
  expect(
    ready(edit(context, { panel: "labels", edit: { field: "enabled", value: true } }))
      .capture,
  ).toBe(context.capture);
  const fixed = ready(
    edit(context, {
      panel: "setup",
      edit: { kind: "series-order", ids: ["income", "revenue"] },
    }),
  );
  expect(
    draw({ ...context, local: fixed.local, capture: fixed.capture! }, fixed.storage)
      .notice,
  ).toBeUndefined();
});
it("reuses ordinary Count provenance rather than adding financial magnitudes", () => {
  const context = funnelFixture();
  const aggregate = ready(
    edit(context, { panel: "setup", edit: { kind: "aggregate", value: true } }),
  );
  const aggregated = {
    ...context,
    local: aggregate.local,
    capture: aggregate.capture!,
  };
  const counted = ready(
    edit(
      aggregated,
      { panel: "setup", edit: { kind: "aggregation-method", value: "count" } },
      aggregate.storage,
    ),
  );
  const selection = selectFunnelSession(counted.storage, {
    ...context,
    local: counted.local,
    capture: counted.capture!,
  });
  expect(selection.data).toMatchObject({
    status: "ready",
    value: { observationKind: "count", stages: [{ kind: "value", value: 2 }] },
  });
  expect(selection.projection.valueOrigins).not.toEqual({});
  expect(counted.capture).toBe(context.capture);
});
it.each([
  "funnel",
  "coneFunnel",
  "pyramid",
] as const)("persists %s direction in native scope and rejects stale callbacks", (family) => {
  const context = funnelFixture(family);
  const before = JSON.stringify(context);
  const commit = ready(
    edit(context, { panel: "funnelDirection", value: "horizontal" }),
  );
  const next = {
    ...context,
    local: {
      ...commit.local,
      stamp: nextSessionStamp(context.local.stamp, commit.change),
    },
    capture: commit.capture!,
  };
  const selected = selectFunnelSession(commit.storage, next);
  expect(selected.editor.direction).toBe("horizontal");
  const native = family === "coneFunnel" ? "cone-funnel" : family;
  expect(JSON.stringify(commit.storage)).toContain(`"${native}"`);
  expect(selected.baseline.options[native]).toMatchObject({
    series: { direction: "horizontal" },
  });
  expect(next.local.range).toEqual(context.local.range);
  expect(commit.capture).toBe(context.capture);
  expect(JSON.stringify(context)).toBe(before);
  expect(
    applyFunnelSessionTransaction({}, context, {
      stamp: { ...context.local.stamp, generation: 2 },
      family,
      intent: { panel: "funnelDirection", value: "horizontal" },
    }).status,
  ).toBe("stale");
  expect(
    applyFunnelSessionTransaction({}, context, {
      stamp: context.local.stamp,
      family: "line",
      intent: { panel: "funnelDirection", value: "horizontal" },
    }).status,
  ).toBe("stale");
  if (family !== "funnel")
    expect(
      edit(context, { panel: "funnelDropOff", edit: { field: "enabled", value: true } })
        .status,
    ).not.toBe("ready");
  if (family === "coneFunnel")
    expect(
      edit(context, { panel: "shadow", edit: { field: "enabled", value: true } })
        .status,
    ).not.toBe("ready");
});
it("advances only appearance revision and isolates caller paint while retaining capture", () => {
  const context = funnelFixture();
  const state = funnelState(context);
  const inputs = {
    ...context.inputs,
    funnelThemePaint: { ...context.inputs.funnelThemePaint!, fills: ["#abcdef"] },
  };
  const next = synchronizeApplicationSession({}, inputs, state);
  expect(next.local.stamp.renderRevision).toBeGreaterThan(
    state.local.stamp.renderRevision,
  );
  expect(next.local.stamp.dataRevision).toBe(state.local.stamp.dataRevision);
  expect(next.capture).toBe(state.capture);
  inputs.funnelThemePaint.fills[0] = "#fedcba";
  expect(next.appearance.funnelThemePaint?.fills).toEqual(["#abcdef"]);
});
it("roundtrips gallery families with full selection and preserved Funnel options", () => {
  let context: any = funnelFixture();
  const first = ready(
    edit(context, { panel: "labels", edit: { field: "enabled", value: true } }),
  );
  let storage = first.storage;
  context = { ...context, local: first.local, capture: first.capture };
  const originalRange = structuredClone(context.local.range);
  const stale = {
    stamp: context.local.stamp,
    family: "funnel" as const,
    intent: { panel: "funnelDirection" as const, value: "horizontal" as const },
  };
  for (const family of ["coneFunnel", "pyramid", "line", "funnel"] as const) {
    const commit = ready(
      applyOrdinarySessionTransaction(storage, context, {
        stamp: context.local.stamp,
        family: context.inputs.family,
        intent: { panel: "family", chartType: family },
      }),
    );
    expect(commit.local.range).toEqual(originalRange);
    expect(commit.capture).toBeUndefined();
    storage = commit.storage;
    const source = funnelFixture();
    context = {
      ...context,
      local: {
        ...commit.local,
        stamp: nextSessionStamp(context.local.stamp, commit.change),
      },
      inputs: {
        ...context.inputs,
        family,
        funnelThemePaint: { ...context.inputs.funnelThemePaint, family },
      },
      capture: {
        ...source.capture,
        dataRevision: nextSessionStamp(context.local.stamp, commit.change).dataRevision,
      },
    };
    expect(applyOrdinarySessionTransaction(storage, context, stale).status).toBe(
      "stale",
    );
  }
  const restored = selectFunnelSession(storage, context);
  expect(restored.baseline.options.funnel).toMatchObject({
    series: { label: { enabled: true } },
  });
  expect(restored.setup.seriesIds).toEqual(["revenue", "income"]);
});
it.each([
  "funnel",
  "coneFunnel",
  "pyramid",
] as const)("recaptures a newly added %s field without collapsing absent/null/zero", (family) => {
  const source = funnelFixture(family);
  const rows = [
    { id: "absent", period: "Absent", income: 3 },
    { id: "null", period: "Null", income: 2, revenue: null },
    { id: "zero", period: "Zero", income: 1, revenue: 0 },
  ];
  const api = {
    isDestroyed: () => false,
    getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
    getDisplayedRowCount: () => rows.length,
    getDisplayedRowAtIndex: (index: number) => rows[index],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
  } as any;
  const inputs = {
    ...source.inputs,
    api,
    range: {
      columnIds: ["period", "income"],
      originalRange: { columns: ["period", "income"] },
    },
    rangePolicy: {
      ...source.inputs.rangePolicy!,
      configuredColumnIds: ["period", "income"],
    },
  };
  const initial = {
    ...initialApplicationSession({}, inputs, 2),
    viewport: { width: 800, height: 500 },
  };
  const state = {
    ...initial,
    capture: ready(captureApplicationSession(inputs, initial)),
  };
  expect(state.capture.selectedColumnIds).toEqual(["period", "income"]);
  expect(state.capture.rows.every((row) => !Object.hasOwn(row.values, "revenue"))).toBe(
    true,
  );
  const command = {
    stamp: state.local.stamp,
    family,
    intent: {
      panel: "setup" as const,
      edit: { kind: "series-add" as const, id: "revenue" },
    },
  };
  const recapture = planApplicationRecapture({}, inputs, state, command);
  expect(recapture?.status, JSON.stringify(recapture)).toBe("ready");
  const commit = ready(
    applyOrdinarySessionTransaction(
      {},
      contextFor(inputs, state),
      command,
      recapture as any,
    ),
  );
  expect(commit.capture!.selectedColumnIds).toEqual(["period", "income", "revenue"]);
  const capture = commit.capture as typeof state.capture;
  expect(capture.rows[0].values).not.toHaveProperty("revenue");
  expect(capture.rows[1].values.revenue).toBeNull();
  expect(capture.rows[2].values.revenue).toBe(0);
  const projected = ready(
    projectFunnelSession(commit.storage, inputs, {
      ...state,
      local: commit.local,
      capture,
    }),
  );
  expect(projected.setupProps.value.series.map((series) => series.id)).toEqual([
    "income",
    "revenue",
  ]);
  expect(projected.snapshot.rows.map((row) => row.id)).toEqual([
    "absent",
    "null",
    "zero",
  ]);
});
it.each([
  "heatmap",
  "histogram",
] as const)("rejects every Funnel-only intent on %s before family editor projection", (family) => {
  const source = funnelFixture();
  const inputs = { ...source.inputs, family };
  const state = {
    ...initialApplicationSession({}, inputs, 1),
    capture: source.capture,
  };
  const context = contextFor(inputs, state);
  const before = JSON.stringify(context);
  for (const intent of [
    { panel: "stageLabels", edit: { field: "enabled", value: true } },
    { panel: "funnelDirection", value: "horizontal" },
    { panel: "funnelDropOff", edit: { field: "enabled", value: true } },
  ] as const) {
    expect(
      applyOrdinarySessionTransaction({}, context, {
        stamp: context.local.stamp,
        family,
        intent,
      }).status,
    ).toBe("stale");
  }
  expect(JSON.stringify(context)).toBe(before);
});
