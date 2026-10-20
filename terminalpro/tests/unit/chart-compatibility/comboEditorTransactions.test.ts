import { describe, expect, it } from "vitest";
import { applyComboEditorTransaction } from "../../../src/components/General/Table/Chart/application/comboEditorTransaction";
import {
  applyComboAssignmentTransaction,
  applyComboFamilyTransaction,
  initializeComboSession,
} from "../../../src/components/General/Table/Chart/application/comboSessionAssignments";
import { selectComboSession } from "../../../src/components/General/Table/Chart/application/comboSessionSelection";
import type { ComboSessionContext } from "../../../src/components/General/Table/Chart/application/comboSessionTypes";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import { sessionFixture } from "../chart-application/applicationSessionFixture";

function fixture(secondary = false) {
  const storage: any = {
    partition: {
      chartModel: {
        chartType: "customCombo",
        unknown: 17,
        seriesChartTypes: [
          { colId: "revenue", chartType: "area", secondaryAxis: secondary },
          { colId: "income", chartType: "line", secondaryAxis: true },
        ],
        chartOptions: {
          area: { series: { fillOpacity: 0.4 }, unknown: true },
          line: { series: { strokeWidth: 3 } },
          bar: { inactive: 12 },
        },
      },
    },
  };
  const ordinary = sessionFixture(storage);
  const candidate: ComboSessionContext = {
    ...ordinary,
    inputs: { ...ordinary.inputs, family: "customCombo" },
  };
  const initialized = initializeComboSession(candidate);
  if (initialized.status !== "ready")
    throw new Error(JSON.stringify(initialized));
  return { storage, context: { ...candidate, local: initialized.value } };
}
function ready<T>(result: { status: string; value?: T }): T {
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value!;
}
describe("combo editor transactions", () => {
  it("rebuilds concrete positions and rotations after assignment and gallery transactions", () => {
    const { storage, context } = fixture(true);
    const category = ready(
      applyComboEditorTransaction(storage, context, {
        stamp: context.local.stamp,
        family: "customCombo",
        geometry: "area",
        intent: {
          panel: "axisStructure",
          axis: "category",
          edit: { field: "type", value: "time" },
        },
      }),
    );
    const theme = ready(
      applyComboEditorTransaction(
        category.storage,
        { ...context, local: category.local },
        {
          stamp: context.local.stamp,
          family: "customCombo",
          geometry: "area",
          intent: {
            panel: "axisLabels",
            axis: "number",
            edit: { field: "color", value: "#123456" },
          },
        },
      ),
    );
    const position = ready(
      applyComboEditorTransaction(
        theme.storage,
        { ...context, local: theme.local },
        {
          stamp: context.local.stamp,
          family: "customCombo",
          geometry: "area",
          intent: {
            panel: "axisStructure",
            axis: "number",
            edit: { field: "position", value: "left" },
          },
        },
      ),
    );
    const rotation = ready(
      applyComboEditorTransaction(
        position.storage,
        { ...context, local: position.local },
        {
          stamp: context.local.stamp,
          family: "customCombo",
          geometry: "area",
          intent: {
            panel: "axisLabels",
            axis: "number",
            edit: { field: "rotation", value: 30 },
          },
        },
      ),
    );
    const edited = { ...context, local: rotation.local };
    const reassigned = ready(
      applyComboAssignmentTransaction(rotation.storage, edited, {
        stamp: context.local.stamp,
        family: "customCombo",
        intent: {
          panel: "comboAssignment",
          colId: "revenue",
          edit: { kind: "secondaryAxis", value: false },
        },
      }),
    );
    const selected = ready(
      selectComboSession(reassigned.storage, {
        ...context,
        local: reassigned.local,
      }),
    );
    expect(selected.resolved.axes.map((a) => a.position)).toEqual([
      "bottom",
      "left",
      "right",
    ]);
    expect(selected.resolved.axes[0].type).toBe("time");
    expect(
      selected.resolved.style.axes.primary?.labels.rotation,
    ).toBeUndefined();
    expect(selected.resolved.style.axes.primary?.labels.color).toBe("#123456");
    expect(reassigned.local.manualRotations.number).toBeUndefined();
    const gallery = ready(
      applyComboFamilyTransaction(
        rotation.storage,
        edited,
        context.local.stamp,
        "columnLineCombo",
      ),
    );
    const gallerySelected = ready(
      selectComboSession(gallery.storage, {
        ...context,
        inputs: { ...context.inputs, family: "columnLineCombo" },
        local: gallery.local,
      }),
    );
    expect(gallerySelected.resolved.axes.map((a) => a.position)).toEqual([
      "bottom",
      "left",
    ]);
    expect(gallerySelected.resolved.axes[0].type).toBe("category");
    expect(
      gallerySelected.resolved.style.axes.primary?.labels.rotation,
    ).toBeUndefined();
    expect(gallery.local.manualRotations.number).toBeUndefined();
    const ordinary = ready(
      applyComboFamilyTransaction(
        rotation.storage,
        edited,
        context.local.stamp,
        "line",
      ),
    );
    expect(ordinary.local.comboAxes).toBeUndefined();
    expect(ordinary.local.axes).toEqual(context.inputs.initialAxes);
  });
  it("writes the selected geometry type-wide and retains inactive/unknown options", () => {
    const { storage, context } = fixture();
    const before = structuredClone(storage);
    const commit = ready(
      applyComboEditorTransaction(storage, context, {
        stamp: context.local.stamp,
        family: "customCombo",
        geometry: "area",
        intent: { panel: "series", edit: { field: "fillOpacity", value: 0.7 } },
      }),
    );
    expect(storage).toEqual(before);
    expect((commit.storage as any).partition.chartModel).toMatchObject({
      unknown: 17,
      chartOptions: {
        area: { series: { fillOpacity: 0.7 }, unknown: true },
        line: { series: { strokeWidth: 3 } },
        bar: { inactive: 12 },
      },
    });
    const lineContext = {
      ...context,
      local: { ...commit.local, comboGeometry: "line" as const },
    };
    expect(
      ready(selectComboSession(commit.storage, lineContext)).geometry,
    ).toBe("line");
    expect((commit.storage as any).partition.chartModel.chartOptions).toEqual(
      (commit.local.baseline.model as any).chartOptions,
    );
  });
  it("retains geometry while active, falls back in area/bar/line order, and rejects stale geometry/stamps", () => {
    const { storage, context } = fixture();
    expect(
      ready(
        selectComboSession(storage, {
          ...context,
          local: { ...context.local, comboGeometry: "bar" },
        }),
      ).geometry,
    ).toBe("area");
    expect(
      ready(
        selectComboSession(storage, {
          ...context,
          local: { ...context.local, comboGeometry: "line" },
        }),
      ).geometry,
    ).toBe("line");
    const command = {
      stamp: context.local.stamp,
      family: "customCombo" as const,
      geometry: "line" as const,
      intent: {
        panel: "markers" as const,
        edit: { field: "size" as const, value: 5 },
      },
    };
    expect(applyComboEditorTransaction(storage, context, command).status).toBe(
      "stale",
    );
    expect(
      applyComboEditorTransaction(storage, context, {
        ...command,
        geometry: "area",
        stamp: { ...command.stamp, generation: 99 },
      }).status,
    ).toBe("stale");
  });
  it("targets all-secondary first numeric axis concretely; position never enters saved model and resets on reopen", () => {
    const { storage, context } = fixture(true);
    const selected = ready(selectComboSession(storage, context));
    expect(selected.resolved.axes.map((a) => a.position)).toEqual([
      "bottom",
      "right",
      "right",
    ]);
    const commit = ready(
      applyComboEditorTransaction(storage, context, {
        stamp: context.local.stamp,
        family: "customCombo",
        geometry: "area",
        intent: {
          panel: "axisStructure",
          axis: "number",
          edit: { field: "position", value: "left" },
        },
      }),
    );
    const changed = ready(
      selectComboSession(commit.storage, { ...context, local: commit.local }),
    );
    expect(changed.resolved.axes.map((a) => a.position)).toEqual([
      "bottom",
      "left",
      "right",
    ]);
    expect(
      (commit.storage as any).partition.chartModel.qopenbbAxisSettings,
    ).toBeUndefined();
    expect(
      ready(
        selectComboSession(commit.storage, {
          ...context,
          local: { ...commit.local, comboAxes: undefined },
        }),
      ).resolved.axes.map((a) => a.position),
    ).toEqual(["bottom", "right", "right"]);
  });
  it("defers mixed financial units to per-axis admission while preserving aggregation and provenance", () => {
    const { storage, context } = fixture();
    const capture = {
      ...context.capture,
      columns: context.capture.columns.map((c) =>
        c.role !== "number"
          ? c
          : { ...c, unit: c.id === "revenue" ? "USD" : "USD/share", scale: 1 },
      ),
    };
    storage.partition.chartModel.aggFunc = "sum";
    const selected = ready(
      selectComboSession(storage, { ...context, capture }),
    );
    expect(selected.projection.snapshot.rows[0].values).toEqual({
      revenue: 220,
      income: 45,
    });
    expect(selected.projection.axisUnits).toBe("deferred");
    expect(
      selected.projection.valueOrigins[selected.projection.snapshot.rows[0].id]
        .revenue.sourceRowIds,
    ).toEqual(["r1", "r2"]);
    expect(projectOrdinarySetup(capture, selected.setup).status).toBe(
      "invalid",
    );
    expect(
      projectOrdinarySetup(
        capture,
        { ...selected.setup, switchCategorySeries: true },
        "combo-per-axis",
      ).status,
    ).toBe("invalid");
    expect(
      selectComboSession(storage, {
        ...context,
        capture: {
          ...capture,
          columns: capture.columns.map((c) =>
            c.id === "income" ? { ...c, scale: NaN } : c,
          ),
        },
      }).status,
    ).toBe("invalid");
  });
  it("inherits numeric appearance to every axis while concrete rotation affects only its target", () => {
    const { storage, context } = fixture(true);
    const theme = ready(
      applyComboEditorTransaction(storage, context, {
        stamp: context.local.stamp,
        family: "customCombo",
        geometry: "area",
        intent: {
          panel: "axisLabels",
          axis: "number",
          edit: { field: "color", value: "#123456" },
        },
      }),
    );
    const themed = { ...context, local: theme.local };
    expect(
      Object.values(
        ready(selectComboSession(theme.storage, themed)).resolved.style.axes
          .secondary,
      ).map((a) => a.labels.color),
    ).toEqual(["#123456", "#123456"]);
    const rotation = ready(
      applyComboEditorTransaction(theme.storage, themed, {
        stamp: context.local.stamp,
        family: "customCombo",
        geometry: "area",
        intent: {
          panel: "axisLabels",
          axis: "number",
          edit: { field: "rotation", value: 30 },
        },
      }),
    );
    const result = ready(
      selectComboSession(rotation.storage, {
        ...context,
        local: rotation.local,
      }),
    );
    expect(result.resolved.style.axes.secondary.revenue.labels.rotation).toBe(
      30,
    );
    expect(
      result.resolved.style.axes.secondary.income.labels.rotation,
    ).toBeUndefined();
    expect((rotation.storage as any).partition.chartModel.chartOptions).toEqual(
      (theme.storage as any).partition.chartModel.chartOptions,
    );
  });
});
