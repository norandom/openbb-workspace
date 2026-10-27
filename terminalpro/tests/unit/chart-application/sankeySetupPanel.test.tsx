import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SankeySetupPanelProps } from "../../../src/components/General/Table/Chart/application/sankeyTypes";
import { SankeySetupPanel } from "../../../src/components/General/Table/Chart/editor/sankey/SankeySetupPanel";

function props(): SankeySetupPanelProps {
  return {
    columns: [
      { id: "s", label: "Origin", role: "category" },
      { id: "t", label: "Destination", role: "category" },
      { id: "v", label: "Amount", role: "number" },
      { id: "u", label: "Currency unit", role: "category" },
      { id: "scale", label: "Multiplier", role: "number" },
    ],
    selection: {
      sourceColumnId: null,
      targetColumnId: null,
      valueColumnId: null,
      metadata: {
        unit: null,
        currency: null,
        scale: null,
        period: null,
        measure: null,
      },
      metadataColumnIds: {},
    },
    diagnostics: [],
    onEdit: vi.fn(),
  };
}
afterEach(cleanup);

describe("controlled Sankey setup", () => {
  it("uses capture warnings for bound row metadata without claiming complete bindings are unknown", () => {
    const base = props();
    const p: SankeySetupPanelProps = {
      ...base,
      selection: {
        ...base.selection,
        metadataColumnIds: {
          unit: "u",
          currency: "u",
          scale: "scale",
          period: "u",
          measure: "u",
        },
      },
    };
    const view = render(<SankeySetupPanel {...p} />);
    expect(screen.queryByText(/Units or allocation scope unspecified/)).toBeNull();
    view.rerender(
      <SankeySetupPanel
        {...p}
        diagnostics={[
          {
            code: "unknown-metadata",
            severity: "warning",
            path: ["rows"],
            message:
              "Units or allocation scope unspecified; numerical balance is not financial reconciliation",
            rowIds: ["blank"],
          },
        ]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "numerical balance is not financial reconciliation",
    );
    expect(screen.getByRole("status").textContent).toContain("blank");
  });

  it("keeps unmapped inputs editable without automatic column inference", () => {
    const p = props();
    render(<SankeySetupPanel {...p} />);
    for (const name of ["Source", "Target", "Value"])
      expect((screen.getByLabelText(name) as HTMLSelectElement).value).toBe("");
    expect(screen.getByText(/Units or allocation scope unspecified/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "s" } });
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "t" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "v" } });
    expect(p.onEdit).toHaveBeenNthCalledWith(1, {
      kind: "mapping",
      field: "sourceColumnId",
      value: "s",
    });
    expect(p.onEdit).toHaveBeenNthCalledWith(2, {
      kind: "mapping",
      field: "targetColumnId",
      value: "t",
    });
    expect(p.onEdit).toHaveBeenNthCalledWith(3, {
      kind: "mapping",
      field: "valueColumnId",
      value: "v",
    });
    expect((screen.getByLabelText("Source") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByLabelText("Aggregation method")).toBeNull();
  });

  it("shows metadata fields and optional compatible column bindings in a collapsible section", () => {
    const p = props();
    render(<SankeySetupPanel {...p} />);
    expect(screen.queryByLabelText("Unit")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Metadata" }));
    for (const [field, value] of [
      ["Unit", "currency"],
      ["Currency", "USD"],
      ["Scale", "1000"],
      ["Period", "AAPL FY2025"],
      ["Measure", "income-allocation"],
    ]) {
      fireEvent.change(screen.getByLabelText(field), { target: { value } });
    }
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata",
      field: "unit",
      value: "currency",
    });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata",
      field: "currency",
      value: "USD",
    });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata",
      field: "scale",
      value: 1000,
    });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata",
      field: "period",
      value: "AAPL FY2025",
    });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata",
      field: "measure",
      value: "income-allocation",
    });
    fireEvent.change(screen.getByLabelText("Unit column"), { target: { value: "u" } });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata-column",
      field: "unit",
      value: "u",
    });
    const scale = screen.getByLabelText("Scale column") as HTMLSelectElement;
    expect(Array.from(scale.options).map((o) => o.value)).toEqual(["", "v", "scale"]);
    expect(screen.getByText(/Blank bound cells remain unknown/)).toBeTruthy();
  });

  it("preserves missing selections and visible actionable errors while allowing replacement and clearing", () => {
    const base = props();
    const p: SankeySetupPanelProps = {
      ...base,
      selection: {
        ...base.selection,
        sourceColumnId: "gone",
        metadata: {
          unit: "currency",
          currency: "USD",
          scale: 1,
          period: "FY2025",
          measure: "income-allocation",
        },
        metadataColumnIds: { unit: "missing-unit" },
      },
      diagnostics: [
        {
          code: "missing-column",
          severity: "error",
          path: ["selection", "sourceColumnId"],
          message: "Select a source column; gone is unavailable",
          rowIds: ["row1"],
        },
      ],
    };
    render(<SankeySetupPanel {...p} />);
    expect(screen.getByRole("alert").textContent).toContain("Select a source column");
    expect(screen.getByRole("alert").textContent).toContain("row1");
    expect((screen.getByLabelText("Source") as HTMLSelectElement).value).toBe("gone");
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "" } });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "mapping",
      field: "sourceColumnId",
      value: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Metadata" }));
    expect((screen.getByLabelText("Unit column") as HTMLSelectElement).value).toBe(
      "missing-unit",
    );
    fireEvent.change(screen.getByLabelText("Unit column"), { target: { value: "" } });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata-column",
      field: "unit",
      value: null,
    });
    fireEvent.change(screen.getByLabelText("Scale"), { target: { value: "" } });
    expect(p.onEdit).toHaveBeenCalledWith({
      kind: "metadata",
      field: "scale",
      value: null,
    });
  });

  it("keeps supplied warnings outside collapsed metadata and removes local unknown warning for complete declarations", () => {
    const base = props();
    const p: SankeySetupPanelProps = {
      ...base,
      selection: {
        ...base.selection,
        metadata: {
          unit: "currency",
          currency: "USD",
          scale: 1,
          period: "FY2025",
          measure: "income-allocation",
        },
      },
      diagnostics: [
        {
          code: "imbalance",
          severity: "warning",
          path: ["nodes", "q1"],
          message: "Quarter incoming 10, outgoing 9, residual 1",
          rowIds: ["r1", "r2"],
          nodeId: "q1",
        },
      ],
    };
    render(<SankeySetupPanel {...p} />);
    expect(screen.getByRole("status").textContent).toContain(
      "Quarter incoming 10, outgoing 9, residual 1",
    );
    expect(screen.queryByText(/Units or allocation scope unspecified/)).toBeNull();
    expect(screen.getByLabelText("Source")).toBeTruthy();
  });
});
