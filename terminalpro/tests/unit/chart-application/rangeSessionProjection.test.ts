import { expect, it } from "vitest";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { applyRangeEditorTransaction } from "../../../src/components/General/Table/Chart/application/rangeEditorTransaction";
import { projectRangeSession } from "../../../src/components/General/Table/Chart/application/rangeSessionProjection";
import { sessionFixture } from "./applicationSessionFixture";

it.each([
  "rangeBar",
  "rangeArea",
] as const)("joins the real %s session to live composition and pointer projection", (family) => {
  const base = sessionFixture();
  const inputs = { ...base.inputs, family };
  const capture = {
    ...base.capture,
    rows: base.capture.rows.map((row) => ({
      ...row,
      boxPlotAggregationKey: String(row.category),
    })),
    rangeCategory: {
      categoryColumnId: "period",
      columnChartDataType: "number",
      firstCategoryIsDate: false,
      kind: "number" as const,
    },
  };
  const state = {
    ...initialApplicationSession({}, inputs, 1),
    capture,
    viewport: { width: 800, height: 480 },
  };
  expect(
    projectRangeSession({}, inputs, { ...state, viewport: undefined }).status,
  ).toBe("waiting");
  expect(
    projectRangeSession({}, inputs, { ...state, error: "Refresh failed" }).status,
  ).toBe("invalid");
  const result = projectRangeSession({}, inputs, state);
  expect(result.status, JSON.stringify(result)).toBe("ready");
  if (result.status !== "ready") return;
  expect(result.value.kind).toBe("range");
  expect(result.value.projection.projection.fields[0].data[0].summary).toMatchObject({
    min: 100,
    max: 120,
  });
  expect(result.value.projectPointer?.(result.value.options)?.plot).toEqual(
    result.value.projection.plot,
  );
  expect(result.value.projectLegendSelection).toBeTypeOf("function");
  expect(result.value.projectNavigationWindow).toBeTypeOf("function");
  const edit =
    family === "rangeBar"
      ? { kind: "direction" as const, value: "horizontal" as const }
      : {
          kind: "interpolation" as const,
          value: { type: "smooth" as const, tension: 0.25 },
        };
  const changed = applyRangeEditorTransaction(
    {},
    { inputs, capture, local: state.local },
    {
      family,
      stamp: state.local.stamp,
      intent: { panel: "range", edit },
    },
  );
  expect(changed.status, JSON.stringify(changed)).toBe("ready");
  if (changed.status !== "ready") return;
  const updated = projectRangeSession(changed.value.storage, inputs, {
    ...state,
    local: changed.value.local,
  });
  expect(updated.status, JSON.stringify(updated)).toBe("ready");
  if (updated.status !== "ready") return;
  expect(
    updated.value.range.controls[family === "rangeBar" ? "direction" : "interpolation"],
  ).toEqual(family === "rangeBar" ? "horizontal" : { type: "smooth", tension: 0.25 });
  expect(updated.value.projectPointer?.(updated.value.options)?.plot).toEqual(
    updated.value.projection.plot,
  );
});
