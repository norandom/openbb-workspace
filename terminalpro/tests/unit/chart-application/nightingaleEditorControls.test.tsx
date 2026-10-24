import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  applyNightingaleSessionTransaction,
  selectNightingaleSession,
} from "../../../src/components/General/Table/Chart/application/nightingaleSessionProjection";
import {
  applyRadialSessionTransaction,
  selectRadialSession,
} from "../../../src/components/General/Table/Chart/application/radialSessionProjection";
import { translateNightingale } from "../../../src/components/General/Table/Chart/echarts/nightingale";
import { translateRadial } from "../../../src/components/General/Table/Chart/echarts/radial";
import { ApplicationCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationCustomizeEditor";
import { ChartSetupPanel } from "../../../src/components/General/Table/Chart/editor/setup/ChartSetupPanel";
import { sessionFixture } from "./applicationSessionFixture";
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 7 }),
  } as any),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["nightingale", "radialColumn", "radialBar"] as const)(
  "connects %s editor changes to saved patches and renderer",
  (family) => {
    const source = sessionFixture();
    const select = (
      family === "nightingale" ? selectNightingaleSession : selectRadialSession
    ) as any;
    const apply = (
      family === "nightingale"
        ? applyNightingaleSessionTransaction
        : applyRadialSessionTransaction
    ) as any;
    const translate = (
      family === "nightingale" ? translateNightingale : translateRadial
    ) as any;
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
      const selected = select(state.storage, context, {
        width: 800,
        height: 500,
      });
      current = { state, selected, mapped: translate(selected.mapping) };
      return (
        <ApplicationCustomizeEditor
          state={selected.editor}
          onAxisStructure={() => {
            throw Error("Unexpected axis structure");
          }}
          onIntent={(intent) => {
            const result = apply(state.storage, context, {
              stamp: state.local.stamp,
              family,
              intent,
            });
            if (result.status !== "ready") throw Error(JSON.stringify(result));
            setState({
              storage: result.value.storage,
              local: result.value.local,
            });
          }}
        />
      );
    }
    render(<Editor />);
    expect(
      screen.queryByRole("button", { name: "Horizontal Axis" }),
    ).toBeNull();
    expect(screen.queryByText("Connect Missing Data")).toBeNull();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Thickness value" }),
      {
        target: { value: "4" },
      },
    );
    expect(current.selected.editor.polarAxis.value.thickness).toBe(4);
    if (family === "nightingale")
      expect(current.mapped.options.angleAxis.axisLine.lineStyle.width).toBe(4);
    else {
      expect(
        current.mapped.options.graphic.some(
          (g: any) => g.style.lineWidth === 4,
        ),
      ).toBe(true);
      fireEvent.change(
        screen.getByRole("spinbutton", { name: "Group Padding value" }),
        { target: { value: "0.2" } },
      );
      expect(current.selected.mapping.style.axes.category.paddingInner).toBe(
        0.2,
      );
      expect(current.selected.editor.polarAxis.value.paddingInner).toBe(
        family === "radialBar" ? 0 : 0.2,
      );
    }
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Inner Radius value" }),
      {
        target: { value: "0.35" },
      },
    );
    expect(current.selected.editor.polarAxis.value.innerRadiusRatio).toBe(0.35);
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Stroke Width value" }),
      {
        target: { value: "5" },
      },
    );
    expect(current.selected.mapping.style.series.strokeWidth).toBe(5);
    expect(screen.queryByRole("switch", { name: "Markers" })).toBeNull();
    fireEvent.click(
      screen.getByRole("switch", { name: "Labels", exact: true }),
    );
    expect(current.selected.mapping.style.series.labels.enabled).toBe(true);
    expect(screen.queryByRole("switch", { name: "Callout Labels" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Shadow" })).toBeNull();
    if (family === "nightingale") {
      fireEvent.change(
        screen.getByRole("spinbutton", { name: "Fill Opacity value" }),
        {
          target: { value: "0.4" },
        },
      );
      expect(current.selected.mapping.style.series.fillOpacity).toBe(0.4);
    }
    const key =
      family === "radialColumn"
        ? "radial-column"
        : family === "radialBar"
          ? "radial-bar"
          : family;
    expect(
      current.state.storage.partition.chartModel.chartOptions[key].axes[
        family === "radialBar" ? "angle-number" : "angle-category"
      ].line.width,
    ).toBe(4);
  },
);

it.each(["nightingale", "radial"] as const)(
  "routes %s Set Up Group Type separately from ordinary setup and keeps transpose reachable",
  (kind) => {
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
          kind,
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
    fireEvent.click(
      screen.getByRole("switch", { name: "Switch Category / Series" }),
    );
    expect(onEdit).toHaveBeenCalledWith({
      kind: "switch-category-series",
      value: true,
    });
  },
);
