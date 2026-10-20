import { expect, it } from "vitest";
import { admitCombo } from "../../../src/components/General/Table/Chart/echarts/comboAdmission";
import {
  applicationStyle,
  mappingContext,
} from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
export function comboFixture() {
  const { application, series, line, ...common } = applicationStyle();
  const { axes, series: effective, ...shared } = application;
  return {
    snapshot: {
      ...validSnapshotInput,
      columns: [
        { id: "a", label: "A", role: "number" as const, unit: "USD", scale: 1 },
        {
          id: "b",
          label: "B",
          role: "number" as const,
          unit: "USD/share",
          scale: 1,
        },
      ],
      selectedColumnIds: ["a", "b"],
      rows: [{ id: "r", category: "Q", values: { a: 1000, b: 2 } }],
    },
    assignments: [
      { colId: "a", chartType: "stackedArea" as const },
      { colId: "b", chartType: "line" as const, secondaryAxis: true },
    ],
    style: {
      common,
      application: shared,
      axes: {
        category: axes.category,
        primary: axes.number,
        secondary: {
          b: {
            ...axes.number,
            fields: { ...axes.number.fields, position: "right" as const },
          },
        },
      },
      geometry: {
        area: { series: effective, overrides: {} },
        line: { series: effective, overrides: {} },
      },
    },
    context: mappingContext(),
  };
}
it("admits distinct financial units on distinct axes without mutation", () => {
  const input = comboFixture();
  const before = JSON.stringify(input);
  const r = admitCombo(input);
  expect(r.status).toBe("admitted");
  if (r.status === "admitted")
    expect(
      r.plan.selected.map((s) => [s.column.id, s.paletteIndex, s.yAxisIndex]),
    ).toEqual([
      ["a", 0, 0],
      ["b", 1, 1],
    ]);
  expect(JSON.stringify(input)).toBe(before);
});
it.each([
  "missing",
  "duplicate",
  "type",
  "primary",
  "units",
  "viewport",
  "style",
])("rejects invalid %s", (kind) => {
  const input: any = comboFixture();
  if (kind === "missing") input.assignments.pop();
  if (kind === "duplicate") input.assignments.push(input.assignments[0]);
  if (kind === "type") input.assignments[1].chartType = "pie";
  if (kind === "primary") input.assignments[0].secondaryAxis = true;
  if (kind === "units") {
    input.assignments[1].secondaryAxis = false;
  }
  if (kind === "viewport") delete input.context.viewport;
  if (kind === "style") delete input.style.geometry.line;
  const r = admitCombo(input);
  expect(r.status).not.toBe("admitted");
  expect(r).not.toHaveProperty("options");
});
it("catches hostile inputs", () => {
  expect(
    admitCombo(
      new Proxy(
        {},
        {
          get() {
            throw Error("hostile");
          },
        },
      ) as any,
    ).status,
  ).toBe("invalid");
});
it("admits retained unselected assignments without allocating axes", () => {
  const input: any = comboFixture();
  input.assignments.push({
    colId: "unused",
    chartType: "line",
    secondaryAxis: true,
  });
  const result = admitCombo(input);
  expect(result.status).toBe("admitted");
  if (result.status === "admitted")
    expect(result.plan.axisGroups).toHaveLength(2);
});
it.each([0, -1, Infinity, NaN])("rejects malformed scale %s", (scale) => {
  const input: any = comboFixture();
  input.snapshot.columns[0].scale = scale;
  expect(admitCombo(input).status).toBe("invalid");
});
it("allows unknown raw metadata but rejects declared gaps", () => {
  const input: any = comboFixture();
  delete input.snapshot.columns[0].unit;
  delete input.snapshot.columns[0].scale;
  input.context.observations = { kind: "raw-observations" };
  expect(admitCombo(input).status).toBe("admitted");
  input.context.observations = { kind: "declared-units" };
  expect(admitCombo(input).status).toBe("unsupported");
});
it("rejects conflicting known raw units on a shared axis", () => {
  const input: any = comboFixture();
  input.assignments[1].secondaryAxis = false;
  input.context.observations = { kind: "raw-observations" };
  expect(admitCombo(input).status).toBe("unsupported");
});
it("admits finite number/time coordinates and rejects malformed observations", () => {
  const input: any = comboFixture();
  input.style.axes.category.fields.type = "number";
  input.snapshot.rows[0].category = 42;
  let r = admitCombo(input);
  expect(r.status === "admitted" && r.plan.coordinates).toEqual([42]);
  input.style.axes.category.fields.type = "time";
  input.snapshot.rows[0].category = "2026-01-01";
  r = admitCombo(input);
  expect(r.status === "admitted" && r.plan.coordinates).toEqual([
    Date.parse("2026-01-01"),
  ]);
  input.snapshot.rows[0].values.a = Infinity;
  expect(admitCombo(input).status).toBe("invalid");
});
it.each([undefined, null, {}, Infinity, NaN])(
  "rejects malformed category %s at its exact path",
  (category) => {
    const input: any = comboFixture();
    input.snapshot.rows[0].category = category;
    const result = admitCombo(input);
    expect(result.status).toBe("invalid");
    if (result.status !== "admitted")
      expect(result.diagnostics[0].path).toEqual([
        "snapshot",
        "rows",
        0,
        "category",
      ]);
  },
);
it.each([[], null, 7])(
  "rejects malformed values %s at its exact path",
  (values) => {
    const input: any = comboFixture();
    input.snapshot.rows[0].values = values;
    const result = admitCombo(input);
    expect(result.status).toBe("invalid");
    if (result.status !== "admitted")
      expect(result.diagnostics[0].path).toEqual([
        "snapshot",
        "rows",
        0,
        "values",
      ]);
  },
);
it.each([null, [], 7])("rejects malformed row %s at its exact path", (row) => {
  const input: any = comboFixture();
  input.snapshot.rows[0] = row;
  const result = admitCombo(input);
  expect(result.status).toBe("invalid");
  if (result.status !== "admitted")
    expect(result.diagnostics[0].path).toEqual(["snapshot", "rows", 0]);
});
it("rejects duplicate selected IDs", () => {
  const input: any = comboFixture();
  input.snapshot.selectedColumnIds.push("a");
  expect(admitCombo(input).status).toBe("invalid");
});
