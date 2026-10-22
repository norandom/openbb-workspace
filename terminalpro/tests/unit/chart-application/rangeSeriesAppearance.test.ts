import { describe, expect, it } from "vitest";
import {
  type RangeSeriesAppearanceInput,
  resolveRangeSeriesAppearance,
} from "../../../src/components/General/Table/Chart/application/rangeSeriesAppearance";
import { buildRangeGeneratedSeries } from "../../../src/components/General/Table/Chart/application/rangeSeriesAppearanceOptions";
import type { RuntimeOptions } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";

function input(family: "rangeBar" | "rangeArea" = "rangeBar"): {
  -readonly [K in keyof RangeSeriesAppearanceInput]: RangeSeriesAppearanceInput[K];
} {
  return {
    family,
    baseline: { stateAddress: "a", chartType: family, model: {}, options: {} },
    generated: {},
    seriesIds: ["b", "a"],
    theme: {
      name: "selected",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#111111",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#fafafa",
      },
      overrides: {},
      palette: { fills: ["#112233", "#445566"], strokes: ["#778899", "#aabbcc"] },
    },
  };
}
function saved(source: RangeSeriesAppearanceInput, series: RuntimeOptions) {
  return {
    ...source,
    baseline: {
      ...source.baseline,
      options: {
        [source.family === "rangeBar" ? "range-bar" : "range-area"]: { series },
      },
    },
  };
}
function resolved(source: RangeSeriesAppearanceInput) {
  const result = resolveRangeSeriesAppearance(source);
  expect(result.status).toBe("resolved");
  if (result.status !== "resolved") throw Error(JSON.stringify(result));
  return result;
}
describe("Range finite series appearance", () => {
  it.each([
    "rangeBar",
    "rangeArea",
  ] as const)("resolves independent source defaults for %s in both themes", (family) => {
    for (const dark of [false, true]) {
      const source = input(family);
      source.theme = {
        ...source.theme,
        mode: dark ? "dark" : "light",
        navigatorFont: { fontFamily: "Wrong", fontSize: 99, fontWeight: 900 },
        colors: {
          ...source.theme.colors,
          base: dark ? "ag-default-dark" : "ag-default",
          textColor: dark ? "#eeeeee" : "#222222",
          chartBackgroundColor: dark ? "#101010" : "#fafafa",
        },
      };
      const result = resolved(source);
      expect(result.configuredVisible).toBe(true);
      expect(result.fields.b).toMatchObject({
        fill: "#112233",
        stroke: "#778899",
        fillOpacity: family === "rangeBar" ? 1 : 0.7,
        strokeWidth: family === "rangeBar" ? 0 : 1,
        strokeOpacity: 1,
        lineDash: [0],
        lineDashOffset: 0,
        label: {
          enabled: false,
          placement: family === "rangeBar" ? "inside" : "outside",
          spacing: 0,
          padding: family === "rangeBar" ? 6 : 10,
          font: "Verdana, sans-serif",
          size: 12,
          fontWeight: 400,
          color:
            family === "rangeBar"
              ? source.theme.colors.chartBackgroundColor
              : source.theme.colors.textColor,
        },
      });
      expect(result.fields.a.fill).toBe("#445566");
      if (result.family === "rangeBar") expect(result.direction).toBe("vertical");
      else
        expect(result.fields.b).toMatchObject({
          marker: {
            enabled: false,
            shape: "circle",
            size: 6,
            strokeWidth: 2,
            fill: "#112233",
            stroke: "#778899",
            fillOpacity: 1,
            strokeOpacity: 1,
          },
          shadow: {
            enabled: false,
            color: "rgba(0, 0, 0, 0.5)",
            blur: 5,
            xOffset: 0,
            yOffset: 0,
          },
          interpolation: { type: "linear" },
          connectMissingData: false,
        });
    }
  });
  it("collapses family before common and uses selected options instead of model.chartOptions", () => {
    const source = input();
    source.theme = {
      ...source.theme,
      overrides: {
        common: { series: { strokeWidth: 8, label: { fontSize: 15 } } },
        "range-bar": { series: { strokeWidth: 3, label: { fontSize: 16 } } },
      },
    };
    source.generated = {
      common: { series: { strokeWidth: 9, label: { fontSize: 19 } } },
      "range-bar": { series: { fillOpacity: 0.2 } },
    };
    source.baseline = {
      ...source.baseline,
      model: { chartOptions: { "range-bar": { series: { strokeWidth: 99 } } } },
      options: {
        common: { series: { strokeWidth: 100 } },
        "range-bar": {
          series: {
            fillOpacity: 0,
            label: { fontWeight: 650, fontStyle: "italic" },
            direction: "horizontal",
            visible: false,
          },
        },
      },
    };
    const result = resolved(source);
    expect(result).toMatchObject({ direction: "horizontal", configuredVisible: false });
    expect(result.fields.b).toMatchObject({
      strokeWidth: 3,
      fillOpacity: 0,
      label: { size: 16, fontWeight: 650, fontStyle: "italic" },
    });
  });
  it.each([
    { lineDash: [2] },
    { lineDash: [] },
  ])("replaces lower theme dash arrays atomically with %j", ({ lineDash }) => {
    const source = input();
    source.theme = {
      ...source.theme,
      overrides: {
        common: { series: { lineDash: [5, 6] } },
        "range-bar": { series: { lineDash } },
      },
    };
    expect(resolved(source).fields.b.lineDash).toEqual(lineDash);
  });
  it("replaces a theme dash with composed common arrays including an empty array", () => {
    const source = input();
    source.theme = {
      ...source.theme,
      overrides: { common: { series: { lineDash: [5, 6] } } },
    };
    for (const lineDash of [[2], []]) {
      source.generated = { common: { series: { lineDash } } };
      expect(resolved(source).fields.b.lineDash).toEqual(lineDash);
    }
  });
  it("keeps the caller's saved/generated lodash array composition before theme collapse", () => {
    const source = saved(input(), { lineDash: [2] });
    source.generated = { "range-bar": { series: { lineDash: [5, 6] } } };
    expect(resolved(source).fields.b.lineDash).toEqual([2, 6]);
  });
  it.each([
    "rangeBar",
    "rangeArea",
  ] as const)("does not apply direct-user stroke/spacing conditionals to %s overrides", (family) => {
    const result = resolved(
      saved(input(family), { stroke: "red", label: { spacing: 3 } }),
    );
    expect(result.fields.b.strokeWidth).toBe(family === "rangeBar" ? 0 : 1);
    expect(result.fields.b.label).toMatchObject({
      spacing: 3,
      padding: family === "rangeBar" ? 6 : 10,
    });
  });
  it("filters only generated caller marker/gap/callout and retains disabled label overrides", () => {
    const caller = {
      fill: "red",
      marker: { enabled: true },
      connectMissingData: true,
      calloutLabel: { enabled: true },
      label: { fontSize: 18, enabled: true },
    };
    const before = structuredClone(caller);
    const built = buildRangeGeneratedSeries(caller);
    expect(built).toEqual({
      valid: true,
      value: { fill: "red", label: { enabled: true, fontSize: 18 } },
    });
    expect(caller).toEqual(before);
    expect(buildRangeGeneratedSeries({})).toEqual({
      valid: true,
      value: { label: { enabled: false } },
    });
    if (!built.valid) throw Error(built.error);
    const source = saved(input("rangeArea"), {
      marker: { enabled: true, size: 9 },
      connectMissingData: true,
    });
    source.generated = { "range-area": { series: built.value } };
    const result = resolved(source);
    expect(result.fields.b).toMatchObject({
      label: { enabled: true, size: 18 },
      marker: { enabled: true, size: 9 },
      connectMissingData: true,
    });
  });
  it("retains marker palette independently of band paint and does not auto-enable saved marker/shadow", () => {
    const result = resolved(
      saved(input("rangeArea"), {
        fill: "red",
        stroke: "blue",
        fillOpacity: 0.2,
        strokeOpacity: 0,
        strokeWidth: 0,
        marker: { size: 0 },
        shadow: { blur: 0 },
      }),
    );
    expect(result.fields.b).toMatchObject({
      fill: "red",
      strokeWidth: 0,
      marker: {
        enabled: false,
        size: 0,
        fill: "#112233",
        stroke: "#778899",
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeWidth: 2,
      },
      shadow: { enabled: false, blur: 0 },
    });
    expect(
      resolved(
        saved(input("rangeArea"), {
          marker: { fill: "green", fillOpacity: 0, strokeWidth: 0 },
          label: { padding: 0, enabled: false },
        }),
      ).fields.b,
    ).toMatchObject({
      marker: { fill: "green", fillOpacity: 0, strokeWidth: 0 },
      label: { padding: 0, enabled: false },
    });
  });
  it.each([
    { type: "linear" },
    { type: "smooth", tension: 1 },
    { type: "step", position: "end" },
  ])("resolves interpolation default %j", (interpolation) => {
    const result = resolved(
      saved(input("rangeArea"), { interpolation: { type: interpolation.type } }),
    );
    expect(result.fields.b).toMatchObject({ interpolation });
  });
  it("preserves projected common fonts, explicit family fonts and disabled shadow values", () => {
    const source = input("rangeArea");
    source.theme = {
      ...source.theme,
      overrides: {
        common: {
          series: { label: { fontFamily: "Selected", fontSize: 20, fontWeight: 500 } },
        },
        "range-area": { series: { label: { fontSize: 22 } } },
      },
    };
    expect(
      resolved(
        saved(source, {
          shadow: { enabled: false, color: "purple", xOffset: -2, yOffset: 3, blur: 8 },
          interpolation: { type: "smooth", tension: 0 },
          label: { placement: "inside" },
        }),
      ).fields.b,
    ).toMatchObject({
      label: { font: "Selected", size: 22, fontWeight: 500, placement: "inside" },
      shadow: { enabled: false, color: "purple", xOffset: -2, yOffset: 3, blur: 8 },
      interpolation: { type: "smooth", tension: 0 },
    });
  });
  it.each([
    ["rangeBar", { cornerRadius: 2 }],
    ["rangeBar", { shadow: { enabled: false, blur: 6 } }],
    ["rangeArea", { marker: { lineDash: [2, 3] } }],
    ["rangeArea", { marker: { lineDashOffset: 1 } }],
    ["rangeArea", { fill: { type: "gradient" } }],
    ["rangeBar", { label: { fill: "red" } }],
    ["rangeArea", { label: { color: { type: "gradient" } } }],
    ["rangeBar", { label: { padding: { top: 1, right: 2, bottom: 3, left: 4 } } }],
    ["rangeBar", { label: { border: { strokeWidth: 1 } } }],
    ["rangeBar", { label: { cornerRadius: 1 } }],
    ["rangeArea", { label: { placement: "outside-end" } }],
  ] as const)("reports unrepresented %s options %j", (family, series) => {
    expect(
      resolveRangeSeriesAppearance(saved(input(family), series as RuntimeOptions)),
    ).toMatchObject({
      status: "unsupported",
      diagnostics: [expect.objectContaining({ message: expect.any(String) })],
    });
  });
  it.each([
    { fillOpacity: 2 },
    { strokeWidth: -1 },
    { strokeOpacity: Number.NaN },
    { fill: 42 },
    { marker: { shape: "star" } },
    { marker: null },
    { label: { fontSize: -1 } },
    { label: { fontWeight: Number.POSITIVE_INFINITY } },
    { label: null },
    { lineDash: [-1] },
    { interpolation: { type: "smooth", tension: -1 } },
    { interpolation: { type: "step", position: "invalid" } },
  ])("rejects malformed effective leaves atomically %j", (series) => {
    expect(
      resolveRangeSeriesAppearance(saved(input("rangeArea"), series)),
    ).toMatchObject({ status: "invalid" });
  });
  it("admits defaults for unrepresented Bar zero radius/shadow and Area solid marker dash", () => {
    expect(
      resolved(
        saved(input(), {
          cornerRadius: 0,
          shadow: {
            enabled: false,
            color: "rgba(0, 0, 0, 0.5)",
            blur: 5,
            xOffset: 0,
            yOffset: 0,
          },
        }),
      ).status,
    ).toBe("resolved");
    expect(
      resolved(
        saved(input("rangeArea"), { marker: { lineDash: [0], lineDashOffset: 0 } }),
      ).status,
    ).toBe("resolved");
  });
  it("rejects malformed branches, duplicate identities and empty palettes", () => {
    const source = input();
    expect(
      resolveRangeSeriesAppearance({
        ...source,
        generated: { "range-bar": { series: null } },
      }).status,
    ).toBe("invalid");
    expect(
      resolveRangeSeriesAppearance({ ...source, seriesIds: ["a", "a"] }).status,
    ).toBe("invalid");
    expect(resolveRangeSeriesAppearance({ ...source, seriesIds: [""] }).status).toBe(
      "invalid",
    );
    expect(
      resolveRangeSeriesAppearance({
        ...source,
        theme: { ...source.theme, palette: { fills: [], strokes: [] } },
      }).status,
    ).toBe("invalid");
    expect(buildRangeGeneratedSeries({ label: null }).valid).toBe(false);
    expect(
      resolveRangeSeriesAppearance(saved(input(), { lineDash: new Array(1) })).status,
    ).toBe("invalid");
    expect(
      resolveRangeSeriesAppearance(
        saved(input("rangeArea"), { marker: { lineDash: new Array(1) } }),
      ).status,
    ).toBe("invalid");
  });
  it("never invokes accessors at admission and detaches results including dashes", () => {
    let calls = 0;
    const source = saved(input(), { lineDash: [2, 3] });
    const before = structuredClone(source);
    const result = resolved(source);
    (result.fields.b.lineDash as number[])[0] = 99;
    expect(source).toEqual(before);
    const hostile = Object.defineProperty({}, "fill", {
      enumerable: true,
      get() {
        calls++;
        return "red";
      },
    });
    expect(resolveRangeSeriesAppearance(saved(input(), hostile)).status).toBe(
      "invalid",
    );
    expect(buildRangeGeneratedSeries(hostile).valid).toBe(false);
    const root = Object.defineProperty({}, "family", {
      enumerable: true,
      get() {
        calls++;
        return "rangeBar";
      },
    });
    expect(
      resolveRangeSeriesAppearance(root as RangeSeriesAppearanceInput).status,
    ).toBe("invalid");
    expect(calls).toBe(0);
  });
  it("keeps an empty selection empty and palette assignment follows selected order", () => {
    expect(resolved({ ...input(), seriesIds: [] }).fields).toEqual({});
    expect(resolved({ ...input(), seriesIds: ["a", "b"] }).fields.a.fill).toBe(
      "#112233",
    );
  });
});
