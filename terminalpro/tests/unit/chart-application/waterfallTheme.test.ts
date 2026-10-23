import { describe, expect, it } from "vitest";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";

function theme(palette?: unknown, baseTheme = "ag-default") {
  return projectCallerTheme(
    "light",
    ["custom"],
    { custom: { baseTheme, palette } },
    "waterfall",
  );
}

describe("Waterfall theme provenance", () => {
  it("uses original stock sign and neutral tokens", () => {
    expect(theme().waterfallPaint).toEqual({
      positive: { fill: "#5090dc", stroke: "#2b5c95" },
      negative: { fill: "#ffa03a", stroke: "#cc6f10" },
      total: { fill: "#b5b5b5", stroke: "#575757" },
      connectorStroke: "#575757",
    });
    expect(theme(undefined, "ag-default-dark").waterfallPaint).toEqual({
      positive: { fill: "#5090dc", stroke: "#74a8e6" },
      negative: { fill: "#ffa03a", stroke: "#ffbe70" },
      total: { fill: "#b5b5b5", stroke: "#a1a1a1" },
      connectorStroke: "#a1a1a1",
    });
  });

  it("uses indexed custom fills but retains named outlines and connector", () => {
    const paint = theme({
      fills: ["red", "green", "blue"],
      strokes: ["pink", "cyan", "gold"],
    }).waterfallPaint;
    expect(paint).toEqual({
      positive: { fill: "red", stroke: "#2b5c95" },
      negative: { fill: "green", stroke: "#cc6f10" },
      total: { fill: "blue", stroke: "#575757" },
      connectorStroke: "#575757",
    });
  });

  it.each([
    [["red"], ["red", "red", "red"]],
    [["red", "blue"], ["red", "blue", "red"]],
  ])("uses the sole series fill for missing indexed entries %j", (fills, expected) => {
    const paint = theme({ fills }).waterfallPaint!;
    expect([paint.positive.fill, paint.negative.fill, paint.total.fill]).toEqual(expected);
  });

  it("gives named full palettes precedence over indexed fills", () => {
    const palette = {
      fills: ["red", "green", "blue"],
      altUp: { fill: "purple", stroke: "navy" },
      altDown: { fill: "yellow", stroke: "orange" },
      neutral: { fill: "silver", stroke: "black" },
    };
    expect(theme(palette).waterfallPaint).toEqual({
      positive: palette.altUp,
      negative: palette.altDown,
      total: palette.neutral,
      connectorStroke: "black",
    });
  });

  it("uses the default indexed third fill when only a stroke array is supplied", () => {
    expect(theme({ strokes: ["pink", "cyan", "gold"] }).waterfallPaint?.total).toEqual({
      fill: "#459d55",
      stroke: "#575757",
    });
  });

  it("retains integrated zoom defaults and explicit Waterfall overrides", () => {
    const resolved = projectCallerTheme(
      "light",
      ["custom"],
      {
        custom: {
          params: { fontSize: 14 },
          overrides: {
            common: { zoom: { enabled: false } },
            waterfall: { series: { line: { strokeWidth: 4 } } },
          },
        },
      },
      "waterfall",
    );
    expect(resolved.overrides.common).toMatchObject({
      zoom: { enabled: false, minVisibleItems: 4 },
    });
    expect(resolved.overrides.waterfall).toMatchObject({
      series: { line: { strokeWidth: 4 } },
    });
    expect(resolved.overrides.waterfall).toMatchObject({
      series: {
        item: {
          positive: { label: { fontSize: 14 } },
          negative: { label: { fontSize: 14 } },
        },
      },
    });
    expect(
      projectCallerTheme("light", [], {}, "waterfall").overrides.common,
    ).toMatchObject({ zoom: { enabled: true } });
    expect(projectCallerTheme("light", [], {}).waterfallPaint).toBeUndefined();
  });
});
