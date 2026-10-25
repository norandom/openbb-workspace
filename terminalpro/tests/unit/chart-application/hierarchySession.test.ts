import { describe, expect, it, vi } from "vitest";
import { projectApplicationChart } from "../../../src/components/General/Table/Chart/application/applicationChartProjection";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { executeApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationSessionDispatch";
import type { GridApi } from "ag-grid-community";
import { captureHierarchySession } from "../../../src/components/General/Table/Chart/application/hierarchySessionCapture";
import {
  resolveHierarchyRange,
  normalizeHierarchyGalleryRange,
} from "../../../src/components/General/Table/Chart/application/hierarchyRange";
import type { SnapshotColumn } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { sessionFixture } from "./applicationSessionFixture";
import type { HierarchySessionContext } from "../../../src/components/General/Table/Chart/application/hierarchySessionTypes";
import { projectHierarchySession } from "../../../src/components/General/Table/Chart/application/hierarchySessionProjection";
import { selectHierarchySession } from "../../../src/components/General/Table/Chart/application/hierarchySessionSelection";
import {
  applyHierarchySetupTransaction,
  applyHierarchyAppearanceTransaction,
} from "../../../src/components/General/Table/Chart/application/hierarchySessionTransactions";

function context(): HierarchySessionContext {
  const ordinary = sessionFixture();
  const {
    categoryColumnId: _category,
    rangeCategory: _rangeCategory,
    ...capture
  } = ordinary.capture;
  const {
    categoryColumnId: _inputCategory,
    rangePolicy: _rangePolicy,
    ...inputs
  } = ordinary.inputs;
  const model = { chartType: "treemap", unknown: { preserved: true } };
  return {
    inputs: {
      ...inputs,
      family: "treemap",
      hierarchyThemePalette: {
        fills: ["#123456"],
        strokes: ["#112233"],
        hierarchyColors: ["#aaa"],
        secondHierarchyColors: ["#bbb"],
        colorRange: ["#ff0000", "#00ff00"],
      },
    },
    local: {
      ...ordinary.local,
      baseline: { ...ordinary.local.baseline, chartType: "treemap", model },
    },
    capture: {
      ...capture,
      kind: "hierarchy",
      sourceMode: "flat",
      categoryColumnIds: ["period"],
      originalModel: model,
      rows: ordinary.capture.rows.map((row) => ({
        id: row.id,
        rawCategoryValues: [row.category],
        categoryPath: [String(row.category)],
        values: row.values,
      })),
    },
  };
}

const columns: readonly SnapshotColumn[] = [
  { id: "Region", label: "Region", role: "category" },
  ...["A", "B", "C"].map((id) => ({ id, label: id, role: "number" as const })),
];
describe("live hierarchy session join", () => {
  it("routes a retained hierarchy capture and composes immediate appearance edits", () => {
    const c = context();
    const inputs = { ...c.inputs, categoryColumnId: "period" };
    const state = {
      ...initialApplicationSession({}, inputs, 1),
      capture: c.capture,
      viewport: { width: 600, height: 400 },
    };
    const projected = projectApplicationChart({}, inputs, state);
    expect(projected.status, JSON.stringify(projected)).toBe("ready");
    if (projected.status !== "ready") throw Error("live hierarchy projection");
    expect(projected.value.kind).toBe("hierarchy");
    const widget = { storage: {} } as any;
    const first = executeApplicationChartCommand(widget, state, inputs, {
      stamp: state.local.stamp,
      family: "treemap",
      intent: { panel: "tooltips", edit: { field: "enabled", value: false } },
    });
    expect(first.widget).not.toBe(widget);
    const second = executeApplicationChartCommand(first.widget, first.value, inputs, {
      stamp: state.local.stamp,
      family: "treemap",
      intent: { panel: "tooltips", edit: { field: "enabled", value: true } },
    });
    expect(second.widget).not.toBe(first.widget);
  });
});
const base = {
  columns,
  generatedColumnIds: ["Region", "A", "B", "C"],
  numericCollectionIds: ["A", "B", "C"],
  ignoreCellRange: false,
};
const saved = (columnIds: string[]) => ({
  columnIds,
  rowStartIndex: 1,
  rowEndIndex: 3,
  originalRange: { columns: columnIds, keep: { unknown: true } },
});
describe("hierarchy range boundaries", () => {
  it.each([
    [[]],
    [["Region"]],
    [["A"]],
  ])("preserves explicit saved selection %j", (ids) => {
    const source = saved(ids);
    const result = resolveHierarchyRange({ ...base, storedRange: source });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw Error("range");
    expect(result.range).toEqual(source);
    expect(result.range.originalRange).not.toBe(source.originalRange);
  });
  it("selects numeric members in collection order then roles in candidate order", () => {
    const result = resolveHierarchyRange({
      ...base,
      configuredColumnIds: ["Region", "C", "B", "A"],
    });
    expect(result.status === "ready" && result.range.columnIds).toEqual([
      "Region",
      "B",
      "A",
    ]);
  });
  it("rejects three saved values before visibility intersection and invalid row bounds", () => {
    expect(
      resolveHierarchyRange({
        ...base,
        generatedColumnIds: ["A"],
        storedRange: saved(["A", "B", "C"]),
      }).status,
    ).toBe("invalid");
    expect(
      resolveHierarchyRange({
        ...base,
        storedRange: { ...saved([]), rowStartIndex: 4 },
      }).status,
    ).toBe("invalid");
  });
  it("retains empty intersections and ignores saved state only when requested", () => {
    expect(
      resolveHierarchyRange({
        ...base,
        generatedColumnIds: [],
        storedRange: saved(["A"]),
      }),
    ).toMatchObject({
      status: "ready",
      range: { columnIds: [], originalRange: { columns: [], keep: { unknown: true } } },
    });
    expect(
      resolveHierarchyRange({
        ...base,
        ignoreCellRange: true,
        storedRange: saved([]),
        configuredColumnIds: ["Region"],
      }),
    ).toMatchObject({ status: "ready", range: { columnIds: ["Region"] } });
  });
  it("limits only maximum-reducing gallery transitions and confines empty fallback", () => {
    expect(
      normalizeHierarchyGalleryRange(
        saved(["Region", "C", "A", "B"]),
        columns,
        ["C", "A", "B"],
        "line",
      ),
    ).toMatchObject({ status: "ready", range: { columnIds: ["Region", "C", "A"] } });
    expect(
      normalizeHierarchyGalleryRange(saved([]), columns, ["B", "A"], "line"),
    ).toMatchObject({ status: "ready", range: { columnIds: ["B"] } });
    for (const family of ["treemap", "sunburst", "pie", "waterfall", "histogram"])
      expect(
        normalizeHierarchyGalleryRange(saved([]), columns, ["A"], family),
      ).toMatchObject({ status: "ready", range: { columnIds: [] } });
    expect(
      normalizeHierarchyGalleryRange(
        saved(["A", "B", "C"]),
        columns,
        ["A", "B", "C"],
        "treemap",
      ).status,
    ).toBe("invalid");
  });
});

describe("inactive hierarchy session composition", () => {
  it("captures requested category order and retained numbers outside replayable transactions", () => {
    const c = context();
    const rows = [{ id: "r1", period: 2024, other: "A", revenue: 100, income: 20 }];
    const getCellValue = vi.fn(({ rowNode, colKey }) => rowNode[colKey]);
    const api = {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (index: number) => rows[index],
      getColumns: () => [],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue,
    } as unknown as GridApi<Record<string, unknown>>;
    const captured = captureHierarchySession({ ...c.inputs, api }, c, [
      "other",
      "period",
    ]);
    expect(captured).toMatchObject({
      status: "ready",
      value: {
        categoryColumnIds: ["other", "period"],
        selectedColumnIds: ["other", "period", "revenue", "income"],
        rows: [{ categoryPath: ["A", "2024"], values: { revenue: 100, income: 20 } }],
      },
    });
    const reads = getCellValue.mock.calls.length;
    applyHierarchySetupTransaction(
      {},
      { ...c, inputs: { ...c.inputs, api } },
      c.local.stamp,
      { kind: "series-remove", id: "income" },
    );
    expect(getCellValue).toHaveBeenCalledTimes(reads);
    expect(captureHierarchySession(c.inputs, c).status).toBe("waiting");
  });
  it("projects raw units, true counts, no-category rows and no-size weights through H1", () => {
    const c = context();
    const selected = selectHierarchySession({}, c, { width: 600, height: 400 });
    expect(selected.status, JSON.stringify(selected)).toBe("ready");
    if (selected.status !== "ready") throw Error(JSON.stringify(selected));
    expect(selected.value.mapping.context.display.tooltipNumber(100)).toBe("$100");
    const counted = {
      ...c,
      local: {
        ...c.local,
        baseline: {
          ...c.local.baseline,
          model: { ...c.local.baseline.model, aggFunc: "count" },
        },
      },
    };
    const count = selectHierarchySession({}, counted, { width: 600, height: 400 });
    expect(
      count.status === "ready" && count.value.mapping.context.display.tooltipNumber(2),
    ).toBe("2");
    const empty = { columnIds: [], originalRange: { columns: [] } };
    const noSize = {
      ...c,
      inputs: { ...c.inputs, range: empty },
      local: { ...c.local, range: empty },
      capture: {
        ...c.capture,
        columns: c.capture.columns.filter((column) => column.role === "number"),
        categoryColumnIds: [],
        selectedColumnIds: [],
        rows: c.capture.rows.map((row) => ({
          ...row,
          rawCategoryValues: [],
          categoryPath: [],
        })),
      },
    };
    const result = projectHierarchySession({}, noSize.inputs, {
      ...noSize,
      viewport: { width: 600, height: 400 },
    });
    expect(result.status).toBe("ready");
    const zero = selectHierarchySession({}, noSize, { width: 600, height: 400 });
    expect(zero.status === "ready" && zero.value.projection.root.subtreeWeight).toBe(2);
    const rawCount = {
      ...noSize,
      inputs: { ...noSize.inputs, range: { ...empty, columnIds: ["revenue"] } },
      local: {
        ...noSize.local,
        range: { ...empty, columnIds: ["revenue"] },
        baseline: {
          ...noSize.local.baseline,
          model: { ...noSize.local.baseline.model, aggFunc: "count" },
        },
      },
      capture: { ...noSize.capture, selectedColumnIds: ["revenue"] },
    };
    const inactiveCount = selectHierarchySession({}, rawCount, {
      width: 600,
      height: 400,
    });
    expect(
      inactiveCount.status === "ready" &&
        inactiveCount.value.mapping.context.display.tooltipNumber(100),
    ).toBe("$100");
  });
  it("recaptures ordered categories atomically, rejects partial recapture and stale edits", () => {
    const c = context();
    const recapture = {
      ...c.capture,
      categoryColumnIds: ["period", "other"],
      selectedColumnIds: ["period", "other", "revenue", "income"],
      columns: c.inputs.columns,
      rows: c.capture.rows.map((row) => ({
        ...row,
        rawCategoryValues: [...row.rawCategoryValues, "A"],
        categoryPath: [...row.categoryPath, "A"],
      })),
    };
    const edit = { kind: "category-add" as const, id: "other" };
    const before = JSON.stringify(c);
    expect(applyHierarchySetupTransaction({}, c, c.local.stamp, edit).status).toBe(
      "waiting",
    );
    expect(
      applyHierarchySetupTransaction({}, c, c.local.stamp, edit, {
        status: "ready",
        stamp: c.local.stamp,
        value: c.capture,
      }).status,
    ).toBe("invalid");
    const result = applyHierarchySetupTransaction({}, c, c.local.stamp, edit, {
      status: "ready",
      stamp: c.local.stamp,
      value: recapture,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw Error(JSON.stringify(result));
    expect(result.value.local.range.columnIds).toEqual([
      "period",
      "other",
      "revenue",
      "income",
    ]);
    expect(result.value.storage.partition).toMatchObject({
      chartModel: { unknown: { preserved: true } },
      treemap: { cellRange: { columns: ["period", "other", "revenue", "income"] } },
    });
    expect(result.value.capture.categoryColumnIds).toEqual(["period", "other"]);
    expect(JSON.stringify(c)).toBe(before);
    expect(
      applyHierarchySetupTransaction(
        {},
        c,
        { ...c.local.stamp, dataRevision: 99 },
        edit,
      ).status,
    ).toBe("stale");
    const optionAdvance = {
      ...c,
      local: { ...c.local, stamp: { ...c.local.stamp, renderRevision: 1 } },
    };
    expect(
      applyHierarchySetupTransaction({}, optionAdvance, c.local.stamp, edit, {
        status: "ready",
        stamp: c.local.stamp,
        value: recapture,
      }).status,
    ).toBe("ready");
    expect(
      applyHierarchySetupTransaction({}, optionAdvance, c.local.stamp, edit, {
        status: "ready",
        stamp: optionAdvance.local.stamp,
        value: recapture,
      }).status,
    ).toBe("stale");
  });
  it("repairs overflow by disabling aggregation and rejects failing prospective arithmetic", () => {
    const c = context();
    const overflow = {
      ...c,
      local: {
        ...c.local,
        baseline: {
          ...c.local.baseline,
          model: { ...c.local.baseline.model, aggFunc: "sum" },
        },
      },
      capture: {
        ...c.capture,
        rows: c.capture.rows.map((row) => ({
          ...row,
          values: { revenue: Number.MAX_VALUE, income: 1 },
        })),
      },
    };
    expect(
      selectHierarchySession({}, overflow, { width: 600, height: 400 }).status,
    ).toBe("invalid");
    const repaired = applyHierarchySetupTransaction({}, overflow, c.local.stamp, {
      kind: "aggregate",
      value: false,
    });
    // Removing Size promotes the finite Color field into Size.
    const removed = applyHierarchySetupTransaction({}, overflow, c.local.stamp, {
      kind: "series-remove",
      id: "revenue",
    });
    expect(removed.status).toBe("ready");
    // Duplicate paths use the last raw observation when aggregation is off.
    expect(repaired.status).toBe("ready");
    if (repaired.status !== "ready") throw Error(JSON.stringify(repaired));
    expect(repaired.value.local.baseline.model).not.toHaveProperty("aggFunc");
    const broken = applyHierarchySetupTransaction(
      {},
      {
        ...overflow,
        local: {
          ...overflow.local,
          baseline: { ...overflow.local.baseline, model: c.local.baseline.model },
        },
      },
      c.local.stamp,
      { kind: "aggregate", value: true },
    );
    expect(broken.status).toBe("invalid");
    const stable = applyHierarchySetupTransaction({}, c, c.local.stamp, {
      kind: "aggregate",
      value: false,
    });
    expect(stable.status).toBe("ready");
  });
  it("maps fresh appearance intent and retains inactive gradient preference", () => {
    const c = context();
    const result = applyHierarchyAppearanceTransaction(
      {},
      c,
      {
        stamp: c.local.stamp,
        family: "treemap",
        intent: { panel: "tooltips", edit: { field: "enabled", value: false } },
      },
      { width: 600, height: 400 },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw Error(JSON.stringify(result));
    expect(result.value.change).toBe("render");
    expect(result.value.storage.partition).toMatchObject({
      chartModel: { chartOptions: { treemap: { tooltip: { enabled: false } } } },
    });
    const stale = applyHierarchyAppearanceTransaction(
      {
        partition: { chartModel: { chartType: "treemap", cellRange: { columns: [] } } },
      },
      c,
      {
        stamp: c.local.stamp,
        family: "treemap",
        intent: { panel: "tooltips", edit: { field: "enabled", value: false } },
      },
      { width: 600, height: 400 },
    );
    expect(stale.status).toBe("stale");
  });
  it("composes immediate appearance edits from one view against the latest baseline", () => {
    const c = context();
    const viewport = { width: 600, height: 400 };
    const first = applyHierarchyAppearanceTransaction(
      {},
      c,
      {
        family: "treemap",
        stamp: c.local.stamp,
        intent: { panel: "tooltips", edit: { field: "enabled", value: false } },
      },
      viewport,
    );
    if (first.status !== "ready") throw Error(JSON.stringify(first));
    const current = {
      ...c,
      local: { ...first.value.local, stamp: { ...c.local.stamp, renderRevision: 1 } },
    };
    const command = {
      family: "treemap" as const,
      stamp: c.local.stamp,
      intent: {
        panel: "hierarchySpacing" as const,
        edit: { field: "tileGap" as const, value: 7 },
      },
    };
    const second = applyHierarchyAppearanceTransaction(
      first.value.storage,
      current,
      command,
      viewport,
    );
    expect(second.status).toBe("ready");
    if (second.status !== "ready") throw Error(JSON.stringify(second));
    expect(second.value.storage.partition).toMatchObject({
      chartModel: {
        chartOptions: {
          treemap: { tooltip: { enabled: false }, series: { tile: { gap: 7 } } },
        },
      },
    });
    expect(
      applyHierarchyAppearanceTransaction(
        first.value.storage,
        {
          ...current,
          local: { ...current.local, stamp: { ...current.local.stamp, generation: 2 } },
        },
        command,
        viewport,
      ).status,
    ).toBe("stale");
  });
});
