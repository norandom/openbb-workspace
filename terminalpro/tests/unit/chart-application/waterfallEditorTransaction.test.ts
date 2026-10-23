import get from "lodash/get";
import { describe, expect, it } from "vitest";
import type { ApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationChartSessionTypes";
import { executeApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationSessionDispatch";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import { applyWaterfallEditorTransaction } from "../../../src/components/General/Table/Chart/application/waterfallEditorTransaction";
import { selectWaterfallSession } from "../../../src/components/General/Table/Chart/application/waterfallSessionSelection";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import type {
  ChartStorageOutput,
  JsonObject,
} from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type { WidgetT } from "../../../src/components/types";
import { sessionFixture } from "./applicationSessionFixture";

function source(
  storage: ChartStorageOutput = {},
): ApplicationSessionContext<"waterfall"> {
  const context = sessionFixture(storage);
  return {
    ...context,
    inputs: {
      ...context.inputs,
      family: "waterfall",
      theme: projectCallerTheme("light", [], {}, "waterfall"),
    },
    local: {
      ...context.local,
      baseline: { ...context.local.baseline, chartType: "waterfall" },
    },
  };
}

function apply(
  intent: ApplicationChartCommand["intent"],
  storage: ChartStorageOutput = {},
  context = source(storage),
) {
  const result = applyWaterfallEditorTransaction(storage, context, {
    stamp: context.local.stamp,
    family: "waterfall",
    intent,
  });
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  return {
    storage: result.value.storage,
    context: { ...context, local: result.value.local },
  };
}

const options = (storage: ChartStorageOutput): any =>
  get(storage, "partition.chartModel.chartOptions");

describe("Waterfall stamped editor transactions", () => {
  it("persists only sign label leaves and retains unknown bags, distractors and explicit legend visibility", () => {
    const storage = {
      rootUnknown: { keep: 1 },
      inactive: { keep: 2 },
      partition: {
        chartModel: {
          chartType: "waterfall",
          unknown: { keep: 3 },
          chartOptions: {
            bar: { title: { text: "untouched" } },
            waterfall: {
              retained: 4,
              legend: { enabled: false },
              series: {
                item: {
                  total: { untouched: 5 },
                  positive: { untouched: 6, label: { fontStyle: "italic" } },
                },
              },
            },
          },
        },
      },
    };
    const result = apply(
      {
        panel: "waterfall",
        edit: {
          kind: "label",
          sign: "positive",
          edit: { field: "weight", value: "boldItalic" },
        },
      },
      storage,
    );
    expect(options(result.storage)).toEqual({
      ...storage.partition.chartModel.chartOptions,
      waterfall: {
        ...storage.partition.chartModel.chartOptions.waterfall,
        series: {
          item: {
            total: { untouched: 5 },
            positive: {
              untouched: 6,
              label: { fontWeight: "bold", fontStyle: "italic" },
            },
          },
        },
      },
    });
    expect(result.storage.rootUnknown).toEqual(storage.rootUnknown);
    expect(result.storage.inactive).toEqual(storage.inactive);
    expect(result.storage.totalSeries).toBe(1);
    expect(get(result.storage, "partition.chartModel.unknown")).toEqual({ keep: 3 });
    const selected = selectWaterfallSession(result.storage, result.context);
    expect(selected.setup.seriesIds).toEqual(["revenue", "income"]);
    expect(selected.appearance.application.legend.enabled).toBe(false);
    expect(selected.appearance.series.item.positive.label).toMatchObject({
      fontWeight: "bold",
      fontStyle: "italic",
    });
  });

  it.each([
    "single",
    "shared",
    "compact",
  ] as const)("keeps tooltip enable and %s mode at the chart proxy", (mode) => {
    const storage = {
      partition: {
        chartModel: {
          chartType: "waterfall",
          chartOptions: {
            waterfall: { series: { tooltip: { enabled: true, untouched: 7 } } },
          },
        },
      },
    };
    const enabled = apply(
      { panel: "tooltips", edit: { field: "enabled", value: false } },
      storage,
    );
    const edited = apply(
      { panel: "tooltips", edit: { field: "mode", value: mode } },
      enabled.storage,
      enabled.context,
    );
    expect(options(edited.storage).waterfall.tooltip).toEqual({ enabled: false, mode });
    expect(options(edited.storage).waterfall.series.tooltip).toEqual({
      enabled: true,
      untouched: 7,
    });
    const reopened = selectWaterfallSession(edited.storage, source(edited.storage));
    expect(reopened.appearance.application.tooltip).toMatchObject({
      enabled: false,
      mode,
    });
  });

  it("rebinds concrete direction without losing semantic numeric type or subsequent axis styles", () => {
    const numeric = apply({
      panel: "axisStructure",
      axis: "category",
      edit: { field: "type", value: "number" },
    });
    const horizontal = apply(
      { panel: "waterfall", edit: { kind: "direction", value: "horizontal" } },
      numeric.storage,
      numeric.context,
    );
    expect(
      selectWaterfallSession(horizontal.storage, horizontal.context).bindings.category,
    ).toEqual({ axis: "category", direction: "y", optionType: "number" });
    const styled = apply(
      {
        panel: "axisLabels",
        axis: "category",
        edit: { field: "color", value: "#123456" },
      },
      horizontal.storage,
      horizontal.context,
    );
    expect(options(styled.storage).waterfall.axes.number.left.label.color).toBe(
      "#123456",
    );
    expect(options(styled.storage).waterfall.axes.number.right.label.color).toBe(
      "#123456",
    );
    const reopened = selectWaterfallSession(styled.storage, source(styled.storage));
    expect(reopened.bindings.category).toMatchObject({
      direction: "y",
      optionType: "number",
    });
    expect(reopened.appearance.application.axes.category.labels.color).toBe("#123456");
  });

  it("persists horizontal category time format, axis positions and titles through a fresh reopen", () => {
    const direction = apply({
      panel: "waterfall",
      edit: { kind: "direction", value: "horizontal" },
    });
    const time = apply(
      {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "time" },
      },
      direction.storage,
      direction.context,
    );
    const format = apply(
      {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "timeFormat", value: "%Y" },
      },
      time.storage,
      time.context,
    );
    const category = apply(
      {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "position", value: "right" },
      },
      format.storage,
      format.context,
    );
    const number = apply(
      {
        panel: "axisStructure",
        axis: "number",
        edit: { field: "position", value: "top" },
      },
      category.storage,
      category.context,
    );
    const titled = apply(
      {
        panel: "titles",
        edit: { caption: "verticalAxisTitle", field: "text", value: "Fiscal year" },
      },
      number.storage,
      number.context,
    );
    expect(options(titled.storage).waterfall.axes.time.right.position).toBe("right");
    expect(options(titled.storage).waterfall.axes.number.bottom.position).toBe("top");
    const reopened = selectWaterfallSession(titled.storage, source(titled.storage));
    expect(reopened.appearance.axisRuntime.axes).toMatchObject([
      { id: "category", direction: "y", type: "time", position: "right" },
      { id: "number", direction: "x", type: "number", position: "top" },
    ]);
    expect(reopened.appearance.application.axes.category).toMatchObject({
      fields: { timeFormat: "%Y" },
      title: { text: "Fiscal year" },
    });
    expect(get(titled.storage, "partition.chartModel.qopenbbAxisSettings")).toEqual({
      version: 1,
      categoryType: "time",
      timeFormat: "%Y",
    });
  });

  it("transfers retained Waterfall axis styles through type changes without reading bar styles", () => {
    const storage = {
      partition: {
        chartModel: {
          chartType: "waterfall",
          chartOptions: {
            bar: { axes: { category: { bottom: { label: { color: "#ff0000" } } } } },
            waterfall: {
              axes: {
                category: { bottom: { label: { color: "#123456" }, unknown: 9 } },
              },
            },
          },
        },
      },
    };
    const changed = apply(
      {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "time" },
      },
      storage,
    );
    const reopened = selectWaterfallSession(changed.storage, source(changed.storage));
    expect(reopened.appearance.application.axes.category.labels.color).toBe("#123456");
    expect(options(changed.storage).waterfall.axes.time.top.unknown).toBe(9);
    expect(options(changed.storage).bar).toEqual(
      storage.partition.chartModel.chartOptions.bar,
    );
  });

  it("preserves distinct destination styles on horizontal and vertical direction round trips", () => {
    const storage = {
      partition: {
        chartModel: {
          chartType: "waterfall",
          chartOptions: {
            waterfall: {
              axes: {
                category: {
                  bottom: {
                    label: { color: "#123456", fontSize: 17 },
                    gridLine: { style: [{ stroke: "#123456", lineDash: [2, 3] }] },
                    retained: "vertical",
                  },
                  left: {
                    label: { color: "#abcdef" },
                    retained: "horizontal",
                    gridLine: { style: [{ stroke: "#abcdef", lineDash: [9] }] },
                  },
                  right: { label: { fontSize: 19 }, unrelated: 42 },
                },
              },
            },
          },
        },
      },
    };
    const horizontal = apply(
      { panel: "waterfall", edit: { kind: "direction", value: "horizontal" } },
      storage,
    );
    const saved = options(horizontal.storage).waterfall.axes.category;
    expect(saved.left).toEqual({
      label: { color: "#abcdef", fontSize: 17 },
      gridLine: { style: [{ stroke: "#abcdef", lineDash: [9] }] },
      retained: "horizontal",
    });
    expect(saved.right).toEqual({
      label: { color: "#123456", fontSize: 19 },
      gridLine: { style: [{ stroke: "#123456", lineDash: [2, 3] }] },
      retained: "vertical",
      unrelated: 42,
    });
    expect(
      selectWaterfallSession(horizontal.storage, source(horizontal.storage)).appearance
        .application.axes.category.labels.color,
    ).toBe("#abcdef");
    const vertical = apply(
      { panel: "waterfall", edit: { kind: "direction", value: "vertical" } },
      horizontal.storage,
      horizontal.context,
    );
    expect(options(vertical.storage).waterfall.axes.category.bottom).toEqual(
      storage.partition.chartModel.chartOptions.waterfall.axes.category.bottom,
    );
    expect(
      selectWaterfallSession(vertical.storage, source(vertical.storage)).appearance
        .application.axes.category.labels.color,
    ).toBe("#123456");
  });

  it("retains manual rotation when auto rotation is enabled then disabled", () => {
    const manual = apply({
      panel: "axisLabels",
      axis: "category",
      edit: { field: "rotation", value: 35 },
    });
    const auto = apply(
      {
        panel: "axisLabels",
        axis: "category",
        edit: { field: "autoRotate", value: true },
      },
      manual.storage,
      manual.context,
    );
    expect(
      selectWaterfallSession(auto.storage, auto.context).appearance.application.axes
        .category.labels.rotation,
    ).toBeUndefined();
    const restored = apply(
      {
        panel: "axisLabels",
        axis: "category",
        edit: { field: "autoRotate", value: false },
      },
      auto.storage,
      auto.context,
    );
    expect(
      selectWaterfallSession(restored.storage, restored.context).appearance.application
        .axes.category.labels.rotation,
    ).toBe(35);
  });

  it("rejects obsolete stamp, range and semantic model changes before applying edits", () => {
    const context = source();
    const intent = {
      panel: "waterfall",
      edit: { kind: "direction", value: "horizontal" },
    } as const;
    const command = {
      stamp: context.local.stamp,
      family: "waterfall",
      intent,
    } as const;
    expect(
      applyWaterfallEditorTransaction(
        {},
        {
          ...context,
          local: { ...context.local, stamp: { ...context.local.stamp, generation: 2 } },
        },
        command,
      ).status,
    ).toBe("stale");
    expect(
      applyWaterfallEditorTransaction(
        {},
        {
          ...context,
          local: {
            ...context.local,
            stamp: {
              ...context.local.stamp,
              address: {
                ...context.local.stamp.address,
                widgetId: "other",
                stateAddress: '["other","partition"]',
              },
            },
          },
        },
        command,
      ).status,
    ).toBe("stale");
    for (const chartModel of [
      { aggFunc: "sum" },
      { qopenbbAxisSettings: { version: 1, categoryType: "time" } },
    ] as JsonObject[]) {
      expect(
        applyWaterfallEditorTransaction({ partition: { chartModel } }, context, command)
          .status,
      ).toBe("stale");
    }
    expect(
      applyWaterfallEditorTransaction(
        {},
        {
          ...context,
          inputs: {
            ...context.inputs,
            range: { ...context.inputs.range, columnIds: ["period", "income"] },
          },
        },
        command,
      ).status,
    ).toBe("stale");
  });

  it("rejects ordinary series, ticks and unrelated family intents", () => {
    const context = source();
    for (const intent of [
      { panel: "series", edit: { field: "strokeWidth", value: 4 } },
      { panel: "ticks", axis: "number", edit: { field: "width", value: 4 } },
      { panel: "labels", edit: { field: "enabled", value: true } },
      { panel: "range", edit: { kind: "direction", value: "horizontal" } },
    ] as ApplicationChartCommand["intent"][]) {
      expect(
        applyWaterfallEditorTransaction({}, context, {
          stamp: context.local.stamp,
          family: "waterfall",
          intent,
        }).status,
      ).not.toBe("ready");
    }
  });

  it("uses the common stamped dispatcher and rejects Waterfall intents in another family", () => {
    const context = source();
    const state = {
      ...initialApplicationSession({}, context.inputs, 1),
      local: context.local,
      capture: context.capture,
    };
    const widget = { storage: {} } as WidgetT;
    const command = {
      stamp: context.local.stamp,
      family: "waterfall",
      intent: { panel: "waterfall", edit: { kind: "direction", value: "horizontal" } },
    } as const;
    const edited = executeApplicationChartCommand(
      widget,
      state,
      context.inputs,
      command,
    );
    expect(
      options(edited.widget.storage as ChartStorageOutput).waterfall.series.direction,
    ).toBe("horizontal");
    expect(edited.value.local.stamp.renderRevision).toBe(
      context.local.stamp.renderRevision + 1,
    );
    const ordinary = sessionFixture();
    const other = {
      ...initialApplicationSession({}, ordinary.inputs, 1),
      local: ordinary.local,
      capture: ordinary.capture,
    };
    expect(
      executeApplicationChartCommand(widget, other, ordinary.inputs, {
        ...command,
        family: "groupedColumn",
      }),
    ).toEqual({ widget, value: other });
  });
});
