import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resolveFunnelAppearance } from "../../../src/components/General/Table/Chart/application/funnelAppearance";
import { projectFunnelEditorState } from "../../../src/components/General/Table/Chart/application/funnelEditor";
import { FunnelCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/funnel/FunnelCustomizeEditor";
import type { FunnelFamily } from "../../../src/components/General/Table/Chart/compatibility/funnelContracts";
afterEach(cleanup);
function state(family: FunnelFamily) {
  const result = resolveFunnelAppearance(
    {
      baseline: { stateAddress: "a", chartType: family, model: {}, options: {} },
      generated: {},
      precision: 2,
      theme: {
        name: "selected",
        mode: "light",
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
        fills: ["#112233"],
        strokes: ["#778899"],
        numericLabelColor: "#ffffff",
        stageLabelColor: "#222222",
        dropOffFill: "#aaaaaa",
        dropOffStroke: "#bbbbbb",
      },
    },
    family,
  );
  if (!result.valid) throw Error(result.error);
  return projectFunnelEditorState(result.value);
}
it.each([
  "funnel",
  "coneFunnel",
  "pyramid",
] as const)("dispatches independent labels and direction for %s with eligible controls", (family) => {
  const onEdit = vi.fn();
  const value = state(family);
  const before = structuredClone(value);
  render(<FunnelCustomizeEditor state={value} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  fireEvent.click(screen.getByRole("switch", { name: "Labels" }));
  fireEvent.click(screen.getByRole("switch", { name: "Stage Labels" }));
  fireEvent.click(screen.getByRole("radio", { name: "Horizontal" }));
  expect(onEdit.mock.calls.map(([intent]) => intent)).toEqual([
    { panel: "labels", edit: { field: "enabled", value: false } },
    { panel: "stageLabels", edit: { field: "enabled", value: false } },
    { panel: "funnelDirection", value: "horizontal" },
  ]);
  expect(!!screen.queryByRole("switch", { name: "Shadow" })).toBe(
    family !== "coneFunnel",
  );
  expect(!!screen.queryByRole("switch", { name: "Drop-Off" })).toBe(
    family === "funnel",
  );
  for (const name of ["Axes", "Legend", "Navigator"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Titles" }));
  expect(screen.queryByRole("switch", { name: "Horizontal Axis Title" })).toBeNull();
  expect(value).toEqual(before);
});
