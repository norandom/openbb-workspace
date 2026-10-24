import { expect, it } from "vitest";
import { resolveRadarAssignments } from "../../../src/components/General/Table/Chart/compatibility/radarAssignments";

it("retains every selected numeric field in order for either Radar family", () => {
  for (const chartType of ["radarLine", "radarArea"]) {
    expect(
      resolveRadarAssignments({
        chartType,
        valueColumns: [
          { colId: "b", selected: true },
          { colId: "a", selected: false },
          { colId: "c", selected: true },
        ],
      }),
    ).toMatchObject({
      status: "resolved",
      assignments: [{ colId: "b" }, { colId: "c" }],
    });
  }
});
it("rejects duplicate IDs and hostile accessors without partial assignments", () => {
  expect(
    resolveRadarAssignments({
      chartType: "radarLine",
      valueColumns: [
        { colId: "x", selected: true },
        { colId: "x", selected: false },
      ],
    }).status,
  ).toBe("invalid");
  expect(
    resolveRadarAssignments({
      get chartType() {
        throw Error("unsafe");
      },
    }).status,
  ).toBe("invalid");
});
