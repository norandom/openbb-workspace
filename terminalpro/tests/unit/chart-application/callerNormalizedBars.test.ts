import { describe, expect, it } from "vitest";
import { changeCallerChartType, resolveCallerChart } from "../../../src/components/General/Table/Chart/caller/chartInputs";
import { resolveApplicationAppearance } from "../../../src/components/General/Table/Chart/application/effectiveAppearance";
import { transitionApplicationAxisStructure } from "../../../src/components/General/Table/Chart/application/axisStructure";
import { sessionFixture } from "./applicationSessionFixture";

const definitions = [
  { field: "Category", chartDataType: "category" as const },
  ...["First", "Second", "Third"].map((field) => ({ field, chartDataType: "series" as const })),
];

describe("normalized family caller transitions", () => {
  it("reconstructs physical axes while retaining distinct family ranges and inactive options", () => {
    const options = { bar: { title: { text: "Retained" } }, pie: { custom: "inactive" } };
    let widget = {
      id: "w", storage: { default: {
        chartModel: { chartType: "groupedColumn", chartOptions: options, custom: 17 },
        groupedColumn: { cellRange: { columns: ["Category", "First"] } },
        normalizedColumn: { cellRange: { columns: ["Category", "First", "Second"], rowStartIndex: 1 } },
        normalizedBar: { cellRange: { columns: ["Category", "Second", "Third"], rowEndIndex: 2 } },
      } },
    };
    for (const family of ["groupedColumn", "normalizedColumn", "normalizedBar", "groupedColumn"] as const) {
      widget = changeCallerChartType(widget, family);
      const result = resolveCallerChart(widget, {}, definitions);
      if (!result.valid) throw new Error(result.error);
      const horizontal = family === "normalizedBar";
      expect(result.value.initialAxes.axes).toEqual([
        { id: "category", type: "category", direction: horizontal ? "y" : "x", position: horizontal ? "left" : "bottom", options: {} },
        { id: "number", type: "number", direction: horizontal ? "x" : "y", position: horizontal ? "bottom" : "left", options: {} },
      ]);
      expect(result.value.range.columnIds).toEqual(widget.storage.default[family].cellRange.columns);
      expect(result.value.range.originalRange).toEqual(widget.storage.default[family].cellRange);
      expect(widget.storage.default.chartModel.chartOptions).toEqual(options);
      expect(widget.storage.default.chartModel.custom).toBe(17);
      expect(widget.storage.default.chartModel).not.toHaveProperty("axes");
      const context = sessionFixture();
      const appearance = resolveApplicationAppearance({
        baseline: { ...context.local.baseline, chartType: family },
        generated: {}, family, theme: context.inputs.theme, precision: 0,
        seriesIds: ["First", "Second"], axisRuntime: result.value.initialAxes,
      });
      expect(appearance.valid).toBe(true);
      const moved = transitionApplicationAxisStructure({
        family, runtime: result.value.initialAxes, savedOptions: options,
        event: { panel: "axisStructure", axis: "category", edit: { field: "position", value: horizontal ? "right" : "top" } },
      });
      expect(moved.valid).toBe(true);
      if (moved.valid) expect(moved.value.runtime.axes[0]).toMatchObject({ direction: horizontal ? "y" : "x", position: horizontal ? "right" : "top" });
    }
  });
});
