import type {
  ApplicationSessionContext,
  ApplicationSessionInputs,
} from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import type { ChartStorageOutput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import { selectOptionBaseline } from "../../../src/components/General/Table/Chart/compatibility/optionState";

export function sessionFixture(
  storage: ChartStorageOutput = {},
): ApplicationSessionContext {
  const address = {
    widgetId: "widget",
    stateKey: "partition",
    stateAddress: '["widget","partition"]',
  };
  const range = {
    columnIds: ["period", "revenue", "income"],
    originalRange: { columns: ["period", "revenue", "income"] },
  };
  const columns = [
    { id: "period", label: "Period", role: "category" as const },
    { id: "other", label: "Other category", role: "category" as const },
    { id: "revenue", label: "Revenue", role: "number" as const },
    { id: "income", label: "Income", role: "number" as const },
  ];
  const axes = {
    categoryAxisType: "category" as const,
    axes: [
      {
        id: "category" as const,
        direction: "x" as const,
        type: "category" as const,
        position: "bottom" as const,
        options: {},
      },
      {
        id: "number" as const,
        direction: "y" as const,
        type: "number" as const,
        position: "left" as const,
        options: {},
      },
    ],
  };
  const inputs: ApplicationSessionInputs = {
    address,
    api: undefined,
    dataRevision: 0,
    family: "groupedColumn",
    range,
    categoryColumnId: "period",
    columns,
    precision: 0,
    generated: {},
    initialAxes: axes,
    display: {
      category: (v) => v,
      numericAxis: (v) => `$${v}`,
      crosshair: (v) => `$${v}`,
      legend: (v) => v,
      seriesLabel: (v) => `$${v}`,
      tooltipNumber: (v) => `$${v}`,
    },
    theme: {
      name: "openbb-light",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
        textColor: "#000000",
        chartBackgroundColor: "#ffffff",
      },
      palette: { fills: ["#123456", "#abcdef"], strokes: ["#112233", "#445566"] },
      overrides: {},
    },
  };
  const partition = storage.partition as Record<string, unknown> | undefined;
  const baseline = selectOptionBaseline({
    kind: "initialize",
    stateAddress: address.stateAddress,
    initialChartType: inputs.family,
    partitionModel: partition?.chartModel,
  });
  if (!baseline.valid) throw new Error(baseline.error);
  return {
    inputs,
    local: {
      stamp: { address, generation: 1, dataRevision: 0, renderRevision: 0 },
      baseline: baseline.value,
      range,
      axes,
      manualRotations: { category: undefined, number: undefined },
    },
    capture: {
      stateAddress: address.stateAddress,
      dataRevision: 0,
      originalModel: {},
      sourceMode: "flat",
      selectedColumnIds: range.columnIds,
      categoryColumnId: "period",
      columns: columns.filter((column) => column.id !== "other"),
      selectedRange: range.originalRange,
      rows: [
        { id: "r1", category: 2024, values: { revenue: 100, income: 20 } },
        { id: "r2", category: 2024, values: { revenue: 120, income: 25 } },
      ],
    },
  };
}
