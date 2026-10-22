import { expect, it } from "vitest";
import {
  initialApplicationSession,
  sessionDataKey,
  synchronizeApplicationSession,
} from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { sessionFixture } from "./applicationSessionFixture";
import type { ApplicationChartFamily } from "../../../src/components/General/Table/Chart/application/comboSessionTypes";
it.each([
  ["groupedColumn", "rangeBar", false],
  ["boxPlot", "rangeArea", false],
  ["rangeBar", "rangeArea", true],
] as const)("recaptures %s to %s only when observation policy changes", (from, to, retained) => {
  const fixture = sessionFixture();
  const oldInputs = { ...fixture.inputs, family: from as ApplicationChartFamily };
  const old = initialApplicationSession({}, oldInputs, 1);
  const model = { chartType: to };
  const state = {
    ...old,
    capture: fixture.capture,
    pendingFamily: to,
    local: { ...old.local, baseline: { ...old.local.baseline, chartType: to, model } },
  };
  const next = synchronizeApplicationSession(
    { partition: { chartModel: model } },
    { ...oldInputs, family: to },
    state,
  );
  expect(Boolean(next.capture)).toBe(retained);
});
it("initial axis metadata participates in data freshness and replaces unsaved inference", () => {
  const fixture = sessionFixture();
  const inputs = { ...fixture.inputs, family: "rangeArea" as const };
  const state = {
    ...initialApplicationSession({}, inputs, 1),
    capture: fixture.capture,
  };
  const changed = {
    ...inputs,
    initialAxes: {
      ...inputs.initialAxes,
      categoryAxisType: "time" as const,
      axes: inputs.initialAxes.axes.map((a) =>
        a.id === "category" ? { ...a, type: "time" as const } : a,
      ),
    },
  };
  expect(sessionDataKey(changed)).not.toBe(sessionDataKey(inputs));
  const next = synchronizeApplicationSession({}, changed, state);
  expect(next.capture).toBeUndefined();
  expect(next.local.axes.categoryAxisType).toBe("time");
});
