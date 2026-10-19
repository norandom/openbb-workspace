import { describe, expect, it } from "vitest";
import { changeCallerChartType, resolveCallerChart } from "../../../src/components/General/Table/Chart/caller/chartInputs";
import { transitionApplicationAxisStructure } from "../../../src/components/General/Table/Chart/application/axisStructure";
import { isCartesianFamily, isNormalizedFamily } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";

const families = ["area", "stackedArea", "normalizedArea"] as const;
const definitions = [
  { field: "Category", chartDataType: "category" as const },
  ...["First", "Second", "Third"].map(field => ({ field, chartDataType: "series" as const })),
];

describe("area caller integration", () => {
  it("admits all three saved families without admitting combination charts", () => {
    families.forEach(family => expect(isCartesianFamily(family)).toBe(true));
    expect(isNormalizedFamily("normalizedArea")).toBe(true);
    expect(isNormalizedFamily("stackedArea")).toBe(false);
    expect(isCartesianFamily("areaColumnCombo")).toBe(false);
  });

  it("retains exact family ranges and moves area axis settings without touching other branches", () => {
    const options = {
      area: { axes: { category: { bottom: { label: { rotation: 23 } }, crosshair: { enabled: true } } } },
      bar: { axes: { category: { bottom: { label: { rotation: 71 } } } } },
      pie: { custom: "inactive" },
    };
    let widget: any = { id: "w", storage: { default: {
      chartModel: { chartType: "groupedColumn", chartOptions: options, custom: 17 },
      area: { cellRange: { columns: ["Category", "First"], rowStartIndex: 1 } },
      stackedArea: { cellRange: { columns: ["Category", "First", "Second"] } },
      normalizedArea: { cellRange: { columns: ["Category", "Second", "Third"], rowEndIndex: 2 } },
    } } };
    for (const family of [...families, "area"] as const) {
      widget = changeCallerChartType(widget, family);
      const resolved = resolveCallerChart(widget, {}, definitions);
      if (!resolved.valid) throw new Error(resolved.error);
      expect(resolved.value.range.originalRange).toEqual(widget.storage.default[family].cellRange);
      expect(resolved.value.initialAxes.axes.map(axis => [axis.direction, axis.position])).toEqual([["x", "bottom"], ["y", "left"]]);
      expect(widget.storage.default.chartModel).toMatchObject({ chartType: family, chartOptions: options, custom: 17 });
      const changed = transitionApplicationAxisStructure({
        family, runtime: resolved.value.initialAxes, savedOptions: options,
        event: { panel: "axisStructure", axis: "category", edit: { field: "type", value: "number" } },
      });
      expect(changed.valid).toBe(true);
      if (!changed.valid) throw new Error(changed.error);
      expect(changed.value.eventOptions.area.axes.number.bottom.label.rotation).toBe(23);
      expect(changed.value.eventOptions.area.axes.number.crosshair.enabled).toBe(true);
      expect(changed.value.eventOptions).not.toHaveProperty("bar");
      expect(widget.storage.default.chartModel.chartOptions).toEqual(options);
    }
  });
});
