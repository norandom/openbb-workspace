import { describe, expect, it } from "vitest";
import { resolveFunnelAppearance } from "../../../src/components/General/Table/Chart/application/funnelAppearance";
import {
  mapFunnelEditorIntent,
  projectFunnelEditorState,
} from "../../../src/components/General/Table/Chart/application/funnelEditor";
import type { FunnelAppearanceInput } from "../../../src/components/General/Table/Chart/application/funnelAppearanceTypes";
import type { FunnelFamily } from "../../../src/components/General/Table/Chart/compatibility/funnelContracts";
export function fixture(family: FunnelFamily = "funnel") {
  return {
    baseline: {
      stateAddress: "a",
      chartType: family,
      model: {},
      options: {} as FunnelAppearanceInput["baseline"]["options"],
    },
    generated: {},
    precision: 2,
    theme: {
      name: "selected",
      mode: "light" as "light" | "dark",
      colors: {
        base: "ag-default",
        foregroundColor: "#111111",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#ffffff",
      },
      overrides: {},
      palette: { fills: ["#123456"], strokes: ["#654321"] },
    },
    themePaint: {
      family,
      fills: ["#112233", "#445566"],
      strokes: ["#778899"],
      numericLabelColor: "#ffffff",
      stageLabelColor: "#222222",
      dropOffFill: "#aaaaaa",
      dropOffStroke: "#bbbbbb",
    },
  } satisfies FunnelAppearanceInput;
}
export function resolved(family: FunnelFamily = "funnel", input = fixture(family)) {
  const result = resolveFunnelAppearance(input, family);
  if (!result.valid) throw Error(result.error);
  return result.value;
}
describe("Funnel appearance and native option controls", () => {
  it.each([
    "funnel",
    "coneFunnel",
    "pyramid",
  ] as const)("scopes %s edits and separates labels", (family) => {
    const style = resolved(family);
    const native = family === "coneFunnel" ? "cone-funnel" : family;
    expect(
      mapFunnelEditorIntent(style, {
        panel: "labels",
        edit: { field: "enabled", value: false },
      }),
    ).toEqual({
      valid: true,
      value: { eventOptions: { [native]: { series: { label: { enabled: false } } } } },
    });
    expect(
      mapFunnelEditorIntent(style, {
        panel: "stageLabels",
        edit: { field: "enabled", value: false },
      }),
    ).toEqual({
      valid: true,
      value: {
        eventOptions: { [native]: { series: { stageLabel: { enabled: false } } } },
      },
    });
    expect(projectFunnelEditorState(style).titles.availableCaptions).toEqual([
      "title",
      "subtitle",
    ]);
  });
  it("preserves saved paint arrays and dash arrays without mutating inputs", () => {
    const source = fixture("coneFunnel");
    source.baseline.options = {
      "cone-funnel": {
        series: { fills: ["#abcdef"], strokes: ["#fedcba"], lineDash: [2, 4, 6] },
      },
    };
    const before = structuredClone(source);
    const style = resolved("coneFunnel", source);
    expect(style.paint.fills).toEqual(["#abcdef"]);
    expect(style.paint.strokes).toEqual(["#fedcba"]);
    expect(style.series.lineDash).toEqual([2, 4, 6]);
    expect(source).toEqual(before);
  });
  it.each([
    { panel: "series", edit: { field: "fillOpacity", value: 2 } },
    { panel: "labels", edit: { field: "size", value: -1 } },
    { panel: "shadow", edit: { field: "enabled", value: true } },
    { panel: "funnelDropOff", edit: { field: "enabled", value: true } },
  ])("rejects invalid Cone intent %j", (intent) => {
    expect(mapFunnelEditorIntent(resolved("coneFunnel"), intent as never).valid).toBe(
      false,
    );
  });
  it("uses variant label spacing and direction defaults", () => {
    const source = fixture();
    source.baseline.options = {
      funnel: { series: { direction: "horizontal", stageLabel: { padding: 23 } } },
    };
    expect(resolved("funnel", source).stageLabel).toMatchObject({
      placement: "after",
      spacing: 23,
    });
    expect(resolved("pyramid").stageLabel.spacing).toBe(12);
    expect(resolved("coneFunnel").label).toMatchObject({
      placement: "before",
      spacing: 4,
    });
  });
});

it.each([
  "light",
  "dark",
] as const)("retains explicit paint and theme chrome in %s", (mode) => {
  const source = fixture("coneFunnel");
  source.theme.mode = mode;
  source.theme.colors.chartBackgroundColor = mode === "dark" ? "#151518" : "#ffffff";
  source.generated = {
    "cone-funnel": { series: { fills: ["#111111", "#222222", "#333333"] } },
  };
  source.baseline.options = {
    "cone-funnel": { series: { fills: ["#abcdef"] } },
  };
  const value = resolved("coneFunnel", source);
  expect(value.paint.fills).toEqual(["#abcdef"]);
  expect(value.application.background.fill).toBe(
    source.theme.colors.chartBackgroundColor,
  );
  expect(value.paint.strokes).toEqual(source.themePaint.strokes);
});
it.each([
  { series: { strokeWidth: -1 } },
  { series: { lineDash: [2, Infinity] } },
  { series: { label: { fontSize: NaN } } },
  { series: { fillOpacity: -0.1 } },
  { series: { fills: [] } },
  { series: { strokes: ["invalid"] } },
])("rejects invalid appearance %j", (funnel) => {
  const source = fixture();
  source.baseline.options = { funnel };
  expect(resolveFunnelAppearance(source, "funnel").valid).toBe(false);
});
it("round-trips native scoped patches through the existing reducer, preserving other families and fonts", async () => {
  const { reduceIntegratedState } = await import(
    "../../../src/components/General/Table/Chart/compatibility/integratedState"
  );
  const source = fixture("coneFunnel");
  source.baseline.options = {
    bar: { series: { strokeWidth: 9 } },
    "cone-funnel": {
      series: { label: { fontWeight: 650, fontStyle: "italic" }, lineDash: [2, 4] },
    },
  };
  const style = resolved("coneFunnel", source);
  const result = mapFunnelEditorIntent(style, {
    panel: "funnelDirection",
    value: "horizontal",
  });
  if (!result.valid) throw Error(result.error);
  const next = reduceIntegratedState({
    storage: {},
    stateKey: "a",
    currentModel: {},
    resolvedOptions: source.baseline.options,
    eventOptions: result.value.eventOptions,
    chartType: "coneFunnel",
    totalSeries: 1,
    isPivotMode: false,
  });
  const options = (
    next.a as { chartModel: { chartOptions: typeof source.baseline.options } }
  ).chartModel.chartOptions;
  source.baseline.options = options;
  expect(options.bar).toEqual({ series: { strokeWidth: 9 } });
  const value = resolved("coneFunnel", source);
  expect(value.direction).toBe("horizontal");
  expect(value.label).toMatchObject({ fontWeight: 650, fontStyle: "italic" });
  expect(value.series.lineDash).toEqual([2, 4]);
  expect(
    mapFunnelEditorIntent(value, {
      panel: "series",
      edit: { field: "lineDash", value: 7 },
    }),
  ).toMatchObject({
    value: { eventOptions: { "cone-funnel": { series: { lineDash: [7] } } } },
  });
});
it.each([
  {
    panel: "titles",
    edit: { caption: "horizontalAxisTitle", field: "text", value: "forged" },
  },
  { panel: "series", edit: { field: "strokeWidth", value: Infinity } },
  { panel: "funnelDropOff", edit: { field: "fillOpacity", value: 1.5 } },
  { panel: "funnelDirection", value: "sideways" },
  { panel: "labels", edit: { field: "color", value: "invalid" } },
])("rejects forged or invalid Funnel intent %j", (intent) => {
  expect(mapFunnelEditorIntent(resolved(), intent as never).valid).toBe(false);
});

it("matches native explicit stroke width and Funnel connector opacity defaults", () => {
  const source = fixture();
  expect(resolved().family === "funnel" && resolved().series.strokeWidth).toBe(0);
  source.baseline.options = {
    funnel: { series: { strokes: ["#abcdef"], dropOff: { stroke: "#fedcba" } } },
  };
  const value = resolved("funnel", source);
  expect(value.series.strokeWidth).toBe(2);
  if (value.family !== "funnel") throw Error("Wrong variant");
  expect(value.dropOff).toMatchObject({ strokeWidth: 2, fillOpacity: 0.2 });
});
