import { describe, expect, it } from "vitest";
import { projectHierarchyThemePalette } from "../../../src/components/General/Table/Chart/caller/hierarchyThemePalette";
import { projectApplicationChart } from "../../../src/components/General/Table/Chart/application/applicationChartProjection";
import { projectApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionProjection";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { sessionFixture } from "./applicationSessionFixture";

describe("inactive hierarchy caller prerequisites", () => {
  it("resolves selected light/dark/custom hierarchy tokens without changing saved options", () => {
    const light = projectHierarchyThemePalette("light", [], {});
    const dark = projectHierarchyThemePalette("dark", [], {});
    expect(light.hierarchyColors).toEqual([
      "#fff",
      "#e0e5ea",
      "#c1ccd5",
      "#a3b4c1",
      "#859cad",
    ]);
    expect(dark.hierarchyColors[0]).toBe("#192834");
    expect(light.colorRange).toEqual(["#ffa03a", "#e1cc00", "#459d55"]);
    expect(dark.strokes[0]).toBe("#74a8e6");
    const themes = {
      custom: {
        baseTheme: "ag-default-dark",
        palette: {
          fills: ["#123456"],
          strokes: ["#654321"],
          hierarchyColors: ["#333"],
          secondHierarchyColors: ["#444"],
          divergingColors: ["#111", "#999"],
        },
      },
    };
    const before = JSON.stringify(themes);
    const custom = projectHierarchyThemePalette("light", ["custom"], themes);
    expect(custom).toEqual({
      fills: ["#123456"],
      strokes: ["#654321"],
      hierarchyColors: ["#333"],
      secondHierarchyColors: ["#444"],
      colorRange: ["#111", "#999"],
    });
    expect(JSON.stringify(themes)).toBe(before);
    expect(custom.fills).not.toBe(themes.custom.palette.fills);
  });
  it("preserves ordinary family projection after extracting the dispatcher", () => {
    const c = sessionFixture();
    const state = {
      ...initialApplicationSession({}, c.inputs, 1),
      capture: c.capture,
      viewport: { width: 600, height: 400 },
    };
    const ordinary = projectApplicationSession({}, c.inputs, state);
    const projected = projectApplicationChart({}, c.inputs, state);
    expect(ordinary.status).toBe("ready");
    expect(projected.status).toBe("ready");
    if (ordinary.status !== "ready" || projected.status !== "ready")
      throw Error("ordinary projection");
    expect(JSON.stringify(projected.value.options)).toEqual(
      JSON.stringify(ordinary.value.options),
    );
    expect(projected.value.kind).toBe("cartesian");
    expect(projected.value.setupProps).toEqual(ordinary.value.setupProps);
  });
});
