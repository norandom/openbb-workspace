import { ChartSetupPanel } from "../../../src/components/General/Table/Chart/editor/setup/ChartSetupPanel";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationCustomizeEditor";
import {
  applyNightingaleSessionTransaction,
  selectNightingaleSession,
} from "../../../src/components/General/Table/Chart/application/nightingaleSessionProjection";
import { translateNightingale } from "../../../src/components/General/Table/Chart/echarts/nightingale";
import { sessionFixture } from "./applicationSessionFixture";
beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ measureText: (s: string) => ({ width: s.length * 7 }) } as any),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([
  "nightingale",
] as const)("connects %s editor changes to saved patches and renderer", (family) => {
  const source = sessionFixture();
  let current: any;
  function Editor() {
    const [state, setState] = useState({
      storage: {},
      local: {
        ...source.local,
        baseline: { ...source.local.baseline, chartType: family },
      },
    });
    const context = {
      ...source,
      inputs: { ...source.inputs, family },
      local: state.local,
    };
    const selected = selectNightingaleSession(state.storage, context, {
      width: 800,
      height: 500,
    });
    current = { state, selected, mapped: translateNightingale(selected.mapping) };
    return (
      <ApplicationCustomizeEditor
        state={selected.editor}
        onAxisStructure={() => {
          throw Error("Unexpected axis structure");
        }}
        onIntent={(intent) => {
          const result = applyNightingaleSessionTransaction(state.storage, context, {
            stamp: state.local.stamp,
            family,
            intent,
          });
          if (result.status !== "ready") throw Error(JSON.stringify(result));
          setState({ storage: result.value.storage, local: result.value.local });
        }}
      />
    );
  }
  render(<Editor />);
  expect(screen.queryByRole("button", { name: "Horizontal Axis" })).toBeNull();
  expect(screen.queryByText("Connect Missing Data")).toBeNull();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Thickness value" }), {
    target: { value: "4" },
  });
  expect(current.selected.mapping.style.polarAxis.thickness).toBe(4);
  expect(current.mapped.options.angleAxis.axisLine.lineStyle.width === 4).toBe(true);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Inner Radius value" }), {
    target: { value: "0.35" },
  });
  expect(current.selected.mapping.style.polarAxis.innerRadiusRatio).toBe(0.35);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Stroke Width value" }), {
    target: { value: "5" },
  });
  expect(current.selected.mapping.style.series.strokeWidth).toBe(5);
  expect(screen.queryByRole("switch", { name: "Markers" })).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Labels", exact: true }));
  expect(current.selected.mapping.style.series.labels.enabled).toBe(true);
  expect(screen.queryByRole("switch", { name: "Callout Labels" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Shadow" })).toBeNull();
  if (family === "nightingale") {
    fireEvent.change(screen.getByRole("spinbutton", { name: "Fill Opacity value" }), {
      target: { value: "0.4" },
    });
    expect(current.selected.mapping.style.series.fillOpacity).toBe(0.4);
  }
  const key = "nightingale";
  expect(
    current.state.storage.partition.chartModel.chartOptions[key].axes["angle-category"]
      .line.width,
  ).toBe(4);
});

it("routes Set Up Group Type separately from ordinary setup and keeps transpose reachable", () => {
  const onEdit = vi.fn();
  const onGroup = vi.fn();
  render(
    <ChartSetupPanel
      value={{
        categoryId: "period",
        aggregate: false,
        aggregationMethod: "sum",
        series: [],
        switchCategorySeries: false,
      }}
      categories={[]}
      aggregationMethods={[]}
      onEdit={onEdit}
      mode={{
        kind: "nightingale",
        value: "stacked",
        choices: [
          { value: "stacked", label: "Stacked" },
          { value: "normalized", label: "Normalized" },
        ],
        onEdit: onGroup,
      }}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Group Type" }), {
    target: { value: "normalized" },
  });
  expect(onGroup).toHaveBeenCalledWith("normalized");
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch", { name: "Switch Category / Series" }));
  expect(onEdit).toHaveBeenCalledWith({ kind: "switch-category-series", value: true });
});
