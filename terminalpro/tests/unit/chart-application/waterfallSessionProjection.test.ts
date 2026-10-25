import { type EChartsOption, graphic } from "echarts";
import { expect, it } from "vitest";
import type { ApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationChartSessionTypes";
import { executeApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationSessionDispatch";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import type { ApplicationSessionState } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import { projectWaterfallSession } from "../../../src/components/General/Table/Chart/application/waterfallSessionProjection";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import type { ChartStorageOutput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import type { WidgetT } from "../../../src/components/types";
import { engine } from "../chart-compatibility/waterfall.fixtures";
import { sessionFixture } from "./applicationSessionFixture";

function source(storage: ChartStorageOutput = {}, generation = 1) {
  const base = sessionFixture(storage);
  const inputs = {
    ...base.inputs,
    family: "waterfall" as const,
    generated: {
      waterfall: {
        series: {
          line: { strokeWidth: 3 },
          item: { positive: { fillOpacity: 0.6, label: { enabled: true } } },
        },
      },
    },
    theme: projectCallerTheme(
      "light",
      ["analyst"],
      {
        analyst: {
          params: { fontFamily: "Arial", fontSize: 16, textColor: "#334455" },
          palette: { fills: ["#145da0", "#b33b32", "#888888"] },
        },
      },
      "waterfall",
    ),
  };
  const capture: ChartSnapshot = {
    ...base.capture,
    columns: base.capture.columns.map((column) => ({
      ...column,
      ...(column.id === "revenue"
        ? { unit: "USD", scale: 1 }
        : column.id === "income"
          ? { unit: "%", scale: 0.01 }
          : {}),
    })),
    rows: [10, -3, 0, null, 2].map((revenue, index) => ({
      id: `movement-${index}`,
      category: index === 4 ? "Total" : `Row ${index}`,
      values: { revenue, income: 90 + index },
    })),
  };
  const state = {
    ...initialApplicationSession(storage, inputs, generation),
    capture,
    viewport: { width: 620, height: 420 },
  } satisfies ApplicationSessionState;
  return { inputs, state };
}

type WaterfallFixture = Omit<ReturnType<typeof source>, "state"> & { state: ApplicationSessionState };
function ready(storage: ChartStorageOutput, fixture: WaterfallFixture = source(storage)) {
  const result = projectWaterfallSession(storage, fixture.inputs, fixture.state);
  expect(result.status, JSON.stringify(result)).toBe("ready");
  if (result.status !== "ready" || result.value.kind !== "waterfall")
    throw Error(JSON.stringify(result));
  return result.value;
}

function movements(options: EChartsOption) {
  const series = options.series as {
    id: string;
    data: { id: string; value: (number | null)[] }[];
  }[];
  return series.find((item) => item.id === "openbb-waterfall-data")!.data;
}

function edit(
  fixture: WaterfallFixture,
  storage: ChartStorageOutput,
  intent: ApplicationChartCommand["intent"],
) {
  const changed = executeApplicationChartCommand(
    { storage } as WidgetT,
    fixture.state,
    fixture.inputs,
    { family: "waterfall", stamp: fixture.state.local.stamp, intent },
  );
  expect(changed.value.local.stamp.renderRevision).toBe(
    fixture.state.local.stamp.renderRevision + 1,
  );
  return {
    storage: changed.widget.storage as ChartStorageOutput,
    fixture: { inputs: fixture.inputs, state: changed.value },
  };
}

it("allows empty Waterfall snapshots while retaining ordinary defaults, unit admission and malformed-value rejection", () => {
  const capture = source().state.capture!;
  const empty = {
    ...capture,
    selectedColumnIds: ["period"],
    columns: capture.columns.filter((column) => column.role === "category"),
    rows: capture.rows.map((row) => ({ ...row, values: {} })),
  };
  expect(validateSnapshot(empty).valid).toBe(false);
  expect(validateSnapshot(empty, "waterfall-observations").valid).toBe(true);
  const selection = {
    categoryId: "period",
    seriesIds: [],
    switchCategorySeries: false,
  };
  expect(projectOrdinarySetup(capture, selection).status).toBe("invalid");
  expect(
    projectOrdinarySetup(capture, selection, "waterfall-observations").status,
  ).toBe("ready");
  expect(
    projectOrdinarySetup(
      capture,
      { ...selection, seriesIds: ["revenue", "income"] },
      "waterfall-observations",
    ).status,
  ).toBe("invalid");
  const malformed = {
    ...capture,
    rows: [{ ...capture.rows[0], values: { revenue: Number.POSITIVE_INFINITY } }],
  };
  expect(validateSnapshot(malformed, "waterfall-observations").valid).toBe(false);
  expect(
    projectOrdinarySetup(
      malformed,
      { ...selection, seriesIds: ["revenue"] },
      "waterfall-observations",
    ).status,
  ).toBe("invalid");
});

it("joins initialized mixed-unit selection to raw cumulative bars, caller paint and generated appearance", () => {
  const fixture = source();
  const before = structuredClone(fixture.state.capture);
  const result = ready({}, fixture);
  expect(result.snapshot.selectedColumnIds).toEqual(["period", "revenue"]);
  expect(result.setupProps.value.series.map((item) => item.id)).toEqual([
    "revenue",
    "income",
  ]);
  expect(fixture.state.local.range.columnIds).toEqual(["period", "revenue", "income"]);
  expect(movements(result.options)).toEqual([
    { id: "movement-0", value: [0, 0, 10, 10, 0] },
    { id: "movement-1", value: [1, 10, 7, -3, 1] },
    { id: "movement-2", value: [2, 7, 7, 0, 2] },
    { id: "movement-3", value: [3, 7, 7, null, 3] },
    { id: "movement-4", value: [4, 7, 9, 2, 4] },
  ]);
  expect(result.waterfall.controls).toMatchObject({
    direction: "vertical",
    connector: { strokeWidth: 3 },
    items: {
      positive: {
        series: {
          controls: expect.arrayContaining([
            {
              field: "fillOpacity",
              label: "Fill Opacity",
              value: 0.6,
              min: 0,
              max: 1,
              rangeStep: 0.05,
              numberStep: "any",
            },
          ]),
        },
        labels: { value: { enabled: true, font: "Arial", size: 16, color: "#334455" } },
      },
    },
  });
  engine(result.options, (chart) => {
    const rectangles = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter(
        (item) =>
          item instanceof graphic.Rect &&
          ["#145da0", "#b33b32"].includes(String(item.style.fill)),
      );
    expect(rectangles).toHaveLength(3);
    expect(rectangles.map((item) => item.style.fill)).toEqual([
      "#145da0",
      "#b33b32",
      "#145da0",
    ]);
    const negative = rectangles[1] as InstanceType<typeof graphic.Rect>;
    const pixel = (value: number) =>
      chart.convertToPixel({ gridIndex: 0 }, [1, value]) as number[];
    expect(negative.shape.y).toBeCloseTo(Math.min(pixel(10)[1], pixel(7)[1]));
    expect(negative.shape.height).toBeCloseTo(Math.abs(pixel(10)[1] - pixel(7)[1]));
    const pointer = result.projectPointer?.(result.options);
    expect(pointer).toBeDefined();
    const match = pointer!.pick(
      {
        x: negative.shape.x + negative.shape.width / 2,
        y: negative.shape.y + negative.shape.height / 2,
      },
      "click",
    )?.matches[0];
    expect(match?.key).toBe("movement-1");
    expect(pointer!.present(match!)?.html).toContain("Revenue: $-3");
    expect(chart.renderToSVGString()).toContain("$2");
  });
  expect(fixture.state.capture).toEqual(before);
});

it("keeps ordinary aggregation witnesses and count formatting in the joined renderer", () => {
  const fixture = source();
  fixture.state = {
    ...fixture.state,
    capture: {
      ...fixture.state.capture!,
      rows: fixture.state.capture!.rows.map((row) => ({ ...row, category: "same" })),
    },
  };
  const aggregate = edit(
    fixture,
    {},
    { panel: "setup", edit: { kind: "aggregate", value: true } },
  );
  const summed = ready(aggregate.storage, aggregate.fixture);
  expect(summed.snapshot.sourceMode).toBe("grouped");
  expect(movements(summed.options).map((item) => item.value.slice(1, 4))).toEqual([
    [0, 9, 9],
  ]);
  const count = edit(aggregate.fixture, aggregate.storage, {
    panel: "setup",
    edit: { kind: "aggregation-method", value: "count" },
  });
  const counted = ready(count.storage, count.fixture);
  expect(movements(counted.options).map((item) => item.value.slice(1, 4))).toEqual([
    [0, 5, 5],
  ]);
  engine(counted.options, (chart) => {
    expect(chart.renderToSVGString()).toContain(">5</text>");
    expect(chart.renderToSVGString()).not.toContain("$5");
  });
});

it("reprojects a direction edit and restores saved axis settings in a fresh initialized session", () => {
  const fixture = source();
  fixture.state = {
    ...fixture.state,
    capture: {
      ...fixture.state.capture!,
      rows: fixture.state.capture!.rows.map((row, index) => ({
        ...row,
        category: 2020 + index,
      })),
    },
  };
  const direction = edit(
    fixture,
    {},
    {
      panel: "waterfall",
      edit: { kind: "direction", value: "horizontal" },
    },
  );
  expect(ready(direction.storage, direction.fixture).waterfall.controls.direction).toBe(
    "horizontal",
  );
  const numeric = edit(direction.fixture, direction.storage, {
    panel: "axisStructure",
    axis: "category",
    edit: { field: "type", value: "number" },
  });
  const colored = edit(numeric.fixture, numeric.storage, {
    panel: "axisLabels",
    axis: "category",
    edit: { field: "color", value: "#123456" },
  });
  const positioned = edit(colored.fixture, colored.storage, {
    panel: "axisStructure",
    axis: "category",
    edit: { field: "position", value: "right" },
  });
  const saved = JSON.parse(JSON.stringify(positioned.storage)) as ChartStorageOutput;
  const fresh = source(saved, 2);
  fresh.state = {
    ...fresh.state,
    capture: {
      ...fresh.state.capture!,
      rows: fresh.state.capture!.rows.map((row, index) => ({
        ...row,
        category: 2020 + index,
      })),
    },
  };
  const reopened = ready(saved, fresh);
  expect(reopened.stamp.generation).toBe(2);
  expect(reopened.waterfall.controls.direction).toBe("horizontal");
  expect(fresh.state.local.range.columnIds).toEqual(["period", "revenue", "income"]);
  expect(movements(reopened.options).map((item) => item.value)).toEqual([
    [2020, 0, 10, 10, 0],
    [2021, 10, 7, -3, 1],
    [2022, 7, 7, 0, 2],
    [2023, 7, 7, null, 3],
    [2024, 7, 9, 2, 4],
  ]);
  expect(reopened.options.yAxis).toMatchObject([
    {
      type: "value",
      position: "right",
      axisLabel: { color: "#123456" },
    },
    { id: "openbb-waterfall-category-carrier", show: false },
  ]);
  engine(reopened.options, (chart) =>
    expect(chart.renderToSVGString()).toContain("<svg"),
  );
});

it("waits for capture and size, preserves refresh errors and rejects malformed observations", () => {
  const fixture = source();
  expect(
    projectWaterfallSession({}, fixture.inputs, {
      ...fixture.state,
      capture: undefined,
    }),
  ).toEqual({ status: "waiting" });
  expect(
    projectWaterfallSession({}, fixture.inputs, {
      ...fixture.state,
      viewport: undefined,
    }),
  ).toEqual({ status: "waiting" });
  const failed = projectWaterfallSession({}, fixture.inputs, {
    ...fixture.state,
    capture: undefined,
    error: "Refresh failed",
  });
  expect(failed).toMatchObject({
    status: "invalid",
    diagnostics: [{ message: "Refresh failed" }],
  });
  const invalid = projectWaterfallSession({}, fixture.inputs, {
    ...fixture.state,
    capture: {
      ...fixture.state.capture!,
      rows: [
        {
          id: "malformed",
          category: "Invalid",
          values: { revenue: Number.POSITIVE_INFINITY, income: 10 },
        },
      ],
    },
  });
  expect(invalid).toMatchObject({
    status: "invalid",
    diagnostics: [{ message: expect.stringMatching(/finite/i) }],
  });
});
