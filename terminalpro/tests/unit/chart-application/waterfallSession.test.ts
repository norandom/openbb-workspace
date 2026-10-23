import { expect, it } from "vitest";
import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import { selectWaterfallSession, waterfallSelection } from "../../../src/components/General/Table/Chart/application/waterfallSessionSelection";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { sessionFixture } from "./applicationSessionFixture";
import { applyApplicationSetupTransaction } from "../../../src/components/General/Table/Chart/application/applicationSessionSetup";

function source(): ApplicationSessionContext<"waterfall"> {
  const context = sessionFixture();
  return {
    ...context,
    inputs: { ...context.inputs, family: "waterfall", theme: projectCallerTheme("light", [], {}, "waterfall") },
    local: { ...context.local, baseline: { ...context.local.baseline, chartType: "waterfall" } },
    capture: { ...context.capture, columns: context.capture.columns.map(column => ({ ...column,
      ...(column.id === "revenue" ? { unit: "USD", scale: 1 } : column.id === "income" ? { unit: "%", scale: 0.01 } : {}),
    })) },
  };
}

it("admits only the first value before unit checks without rewriting the saved selection", () => {
  const context = source();
  const before = structuredClone(context.capture);
  const selected = selectWaterfallSession({}, context);
  expect(selected.setup.seriesIds).toEqual(["revenue", "income"]);
  expect(selected.projection.snapshot.selectedColumnIds).toEqual(["period", "revenue"]);
  expect(selected.projection.snapshot.rows.map(row => row.values.revenue)).toEqual([100, 120]);
  expect(selected.range.columnIds).toEqual(["period", "revenue", "income"]);
  expect(context.capture).toEqual(before);
  expect(selected.editor.eligibility).toMatchObject({ labels: false, shadow: false, markers: false, connectMissingData: false });
  expect(selected.editor.eligibility.axes.number.ticks).toBe(false);
});

it("keeps field reordering and aggregation under the existing setup owner", () => {
  const context = source();
  const range = { ...context.local.range, columnIds: ["period", "income", "revenue"] };
  const selected = selectWaterfallSession({}, { ...context,
    inputs: { ...context.inputs, range },
    local: { ...context.local, range, baseline: { ...context.local.baseline,
      model: { ...context.local.baseline.model, aggFunc: "sum" },
    } },
  });
  expect(selected.setup.seriesIds).toEqual(["income", "revenue"]);
  expect(selected.projection.snapshot.rows.map(row => row.values.income)).toEqual([45]);
});

it("shares a transient first-field policy that does not mutate the full setup", () => {
  const selection = { categoryId: "period", seriesIds: ["revenue", "income"], switchCategorySeries: true, aggFunc: "sum" as const };
  expect(waterfallSelection(selection)).toEqual({ ...selection, seriesIds: ["revenue"], switchCategorySeries: false });
  expect(selection.seriesIds).toEqual(["revenue", "income"]);
  expect(selection.switchCategorySeries).toBe(true);
});

it("validates post-edit aggregation against the effective field and preserves explicit legend visibility", () => {
  const initial = source();
  const context = { ...initial, local: { ...initial.local, legendEnabled: false } };
  const result = applyApplicationSetupTransaction({}, context, context.local.stamp, { kind: "aggregate", value: true });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") return;
  expect(result.value.local.legendEnabled).toBe(false);
  expect(result.value.local.range.columnIds).toEqual(["period", "revenue", "income"]);
  const selected = selectWaterfallSession(result.value.storage, { ...context, local: result.value.local, capture: result.value.capture });
  expect(selected.projection.snapshot.rows.map(row => row.values.revenue)).toEqual([220]);
});
