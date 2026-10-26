import { color } from "echarts/core";
import { describe, expect, it } from "vitest";
import { projectFunnelThemePaint } from "../../../src/components/General/Table/Chart/caller/funnelThemePaint";

// Community source SHA256 e9b1b8be8d27ffc1f2c66e715b863b36d5f3aecef0c79e18cc0101a440956df4;
// retained pure Color.interpolate extraction: artifacts/chart-funnel/theme/light-cone-reference.json.
const light = [
  "#5090dc",
  "#629be0",
  "#74a7e4",
  "#85b2e8",
  "#97bdeb",
  "#a8c8ef",
  "#b9d3f2",
  "#cbdef5",
];
const dark = [
  "#5090dc",
  "#4882c6",
  "#4073b0",
  "#38659a",
  "#305684",
  "#28486e",
  "#203a58",
  "#182b42",
];
function project(
  palette: unknown,
  family: "funnel" | "coneFunnel" | "pyramid" = "coneFunnel",
  extra = {},
) {
  return projectFunnelThemePaint(
    "light",
    ["custom"],
    { custom: { palette, ...extra } },
    family,
  );
}
function value(result: ReturnType<typeof project>) {
  expect(result.valid).toBe(true);
  if (!result.valid) throw Error(result.error);
  return result.value;
}
describe("Funnel caller paint", () => {
  it("pins native 12.1.1 Cone tokens, including light OKLCH interior colors", () => {
    expect(value(project(undefined)).fills).toEqual(light);
    expect(color.parse(light[3])).toEqual([133, 178, 232, 1]);
    const paint = value(
      project(undefined, "coneFunnel", { baseTheme: "ag-default-dark" }),
    );
    expect(paint.fills).toEqual(dark);
    expect(paint.strokes).toEqual(dark);
    expect(paint.numericLabelColor).toBe("#FFFFFF");
  });
  it("retains stock Funnel light/dark strokes and a light base override", () => {
    expect(value(project(undefined, "funnel"))).toMatchObject({
      fills: ["#5090dc"],
      strokes: ["#2b5c95"],
    });
    expect(
      value(project(undefined, "funnel", { baseTheme: "ag-default-dark" })),
    ).toMatchObject({
      strokes: ["#74a8e6"],
      numericLabelColor: "#151518",
      stageLabelColor: "#FFFFFF",
    });
    expect(
      value(
        projectFunnelThemePaint(
          "dark",
          ["x"],
          { x: { baseTheme: "ag-default" } },
          "coneFunnel",
        ),
      ).fills,
    ).toEqual(light);
  });
  it("uses raw secondSequentialColors only for an inbuilt palette", () => {
    expect(
      value(project({ secondSequentialColors: ["red", "blue", "green"] })).fills,
    ).toEqual(["red", "blue", "green"]);
    expect(
      value(project({ fills: ["red"], secondSequentialColors: ["blue"] })).fills,
    ).toEqual(["red", "red"]);
    expect(value(project({ strokes: ["red"] })).fills).toEqual(["#5090dc", "#ffa03a"]);
    expect(value(project({ up: { fill: "green", stroke: "black" } })).fills).toEqual([
      "#5090dc",
      "#ffa03a",
    ]);
  });
  it("selects native family arrays and label/drop-off colors", () => {
    const palette = {
      fills: ["#112233", "#445566", "#778899"],
      strokes: ["#abcdef", "#fedcba"],
    };
    const funnel = value(project(palette, "funnel"));
    expect(funnel).toMatchObject({
      fills: ["#112233"],
      strokes: ["#abcdef"],
      numericLabelColor: "#FFFFFF",
      stageLabelColor: "#181d1f",
      dropOffFill: "#112233",
      dropOffStroke: "#abcdef",
    });
    expect(value(project(palette)).strokes).toEqual(["#112233", "#445566"]);
    expect(value(project(palette, "pyramid"))).toMatchObject(palette);
    expect(value(project(undefined, "pyramid")).fills).toHaveLength(10);
    expect(
      value(
        project(undefined, "funnel", {
          params: { backgroundColor: "ivory", textColor: "navy" },
        }),
      ),
    ).toMatchObject({ numericLabelColor: "ivory", stageLabelColor: "navy" });
  });
  it.each([
    null,
    [],
    "red",
    { up: "green" },
    { down: { fill: "invalid" } },
    { fills: [] },
    { strokes: "red" },
    { fills: ["bogus"] },
    { fills: [null] },
    { secondSequentialColors: [] },
  ])("rejects malformed palette %j without throwing", (palette) => {
    const result = project(palette);
    expect(result).toMatchObject({
      valid: false,
      error: expect.stringContaining("Invalid"),
    });
  });
  it.each([
    "image",
    "gradient",
    "pattern",
  ])("rejects deferred %s paints with sanitized diagnostics and preserves source", (type) => {
    const palette = { fills: [{ type, url: "https://private.invalid/secret" }, "red"] };
    const before = JSON.stringify(palette);
    const result = project(palette);
    expect(result).toMatchObject({
      valid: false,
      error: expect.stringContaining("Advanced"),
    });
    expect(JSON.stringify(result)).not.toContain("private.invalid");
    expect(JSON.stringify(palette)).toBe(before);
  });
  it("rejects malformed selected themes and parameter colors without escaping", () => {
    for (const selected of [
      null,
      [],
      "bad",
      { params: null },
      { params: [] },
      { params: { textColor: {} } },
      { params: { fontSize: {} } },
    ]) {
      expect(() =>
        projectFunnelThemePaint("light", ["x"], { x: selected }, "funnel"),
      ).not.toThrow();
    }
    expect(project(undefined, "funnel", { params: { textColor: {} } })).toMatchObject({
      valid: false,
    });
  });
  it("detaches every returned palette from input and subsequent projections", () => {
    const palette = { fills: ["red", "blue"], strokes: ["green"] };
    const before = JSON.stringify(palette);
    const first = value(project(palette, "pyramid"));
    expect(JSON.stringify(palette)).toBe(before);
    palette.fills[0] = "black";
    expect(first.fills).toEqual(["red", "blue"]);
    (first.strokes as string[])[0] = "white";
    expect(palette.strokes).toEqual(["green"]);
    expect(value(project(undefined)).fills).toEqual(light);
    expect(color.parse(light[3])).toEqual([133, 178, 232, 1]);
  });
});
