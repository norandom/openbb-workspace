import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationCustomizeEditor";
import {
  applyRadarSessionTransaction,
  selectRadarSession,
} from "../../../src/components/General/Table/Chart/application/radarSessionProjection";
import { translateRadar } from "../../../src/components/General/Table/Chart/echarts/radar";
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
  "radarLine",
  "radarArea",
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
    const selected = selectRadarSession(state.storage, context, {
      width: 800,
      height: 500,
    });
    current = { state, selected, mapped: translateRadar(selected.mapping) };
    return (
      <ApplicationCustomizeEditor
        state={selected.editor}
        onAxisStructure={() => {
          throw Error("Unexpected axis structure");
        }}
        onIntent={(intent) => {
          const result = applyRadarSessionTransaction(state.storage, context, {
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
  expect(
    current.mapped.options.graphic.some((g: any) => g.style?.lineWidth === 4),
  ).toBe(true);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Inner Radius value" }), {
    target: { value: "0.35" },
  });
  expect(current.selected.mapping.style.polarAxis.innerRadiusRatio).toBe(0.35);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Line Width value" }), {
    target: { value: "5" },
  });
  expect(current.selected.mapping.style.series.strokeWidth).toBe(5);
  fireEvent.click(screen.getByRole("switch", { name: "Markers" }));
  expect(current.selected.mapping.style.series.markers.enabled).toBe(
    family !== "radarLine",
  );
  fireEvent.click(screen.getByRole("switch", { name: "Labels", exact: true }));
  expect(current.selected.mapping.style.series.labels.enabled).toBe(true);
  expect(screen.queryByRole("switch", { name: "Callout Labels" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Shadow" })).toBeNull();
  if (family === "radarArea") {
    fireEvent.change(screen.getByRole("spinbutton", { name: "Fill Opacity value" }), {
      target: { value: "0.4" },
    });
    expect(current.selected.mapping.style.series.fillOpacity).toBe(0.4);
  }
  const key = family === "radarLine" ? "radar-line" : "radar-area";
  expect(
    current.state.storage.partition.chartModel.chartOptions[key].axes["angle-category"]
      .line.width,
  ).toBe(4);
});
