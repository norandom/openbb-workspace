import type { GridApi } from "ag-grid-community";
import type {
  AdvanceSessionStamp,
  ApplyColumnEdit,
  ApplyRangeTransition,
  CaptureDisplayedChart,
  ChartDisplayPolicy,
  CreateChartDisplayPolicy,
  FinancialFormattingHelpers,
  GridCaptureInput,
  ResolveChartRange,
  ResolvedRange,
  SelectSessionBaseline,
  SessionResult,
  SessionStamp,
  ValidateSessionStamp,
} from "../../../src/components/General/Table/Chart/application/types";
import type { ChartStorageOutput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type { ResolvedSnapshotInput } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";

function captureContract(
  capture: CaptureDisplayedChart,
  api: GridApi<Record<string, unknown>>,
  stamp: SessionStamp,
  range: ResolvedRange,
) {
  const input: GridCaptureInput = {
    api,
    stamp,
    range,
    categoryColumnId: "date",
    columns: [],
    originalModel: {},
  };
  const result: SessionResult<ResolvedSnapshotInput> = capture(input);
  if (result.status === "ready") {
    const snapshot: ResolvedSnapshotInput = result.value;
    void snapshot;
    // @ts-expect-error Captured identities cannot be overwritten.
    result.stamp.generation = 2;
  }
  // @ts-expect-error Range capture cannot guess the category.
  capture({ api, stamp, range, columns: [], originalModel: {} });
  // @ts-expect-error Raw selected IDs cannot be mutated.
  range.columnIds.push("cost");
  return result;
}

function sessionContract(
  validate: ValidateSessionStamp,
  advance: AdvanceSessionStamp,
  baseline: SelectSessionBaseline,
  edit: ApplyColumnEdit,
  rangeWrite: ApplyRangeTransition,
  stamp: SessionStamp,
  storage: ChartStorageOutput,
) {
  validate(stamp, stamp);
  advance(stamp, "data");
  baseline({
    stamp,
    currentStamp: stamp,
    baseline: {
      kind: "initialize",
      stateAddress: stamp.address.stateAddress,
      initialChartType: "groupedColumn",
    },
  });
  const context = {
    currentStamp: stamp,
    storage,
    resolvedOptions: {},
    totalSeries: 1,
    isPivotMode: false,
  };
  const result: SessionResult<ChartStorageOutput> = edit({
    ...context,
    command: {
      stamp,
      chartType: "groupedColumn",
      event: { kind: "title-text", value: "Revenue" },
    },
  });
  rangeWrite({
    currentStamp: stamp,
    storage,
    stamp,
    chartType: "line",
    range: { columnIds: ["date", "revenue"], originalRange: {} },
  });
  edit({
    ...context,
    command: {
      stamp,
      // @ts-expect-error Editor group tokens are not saved chart families.
      chartType: "column",
      event: { kind: "title-text", value: "Revenue" },
    },
  });
  edit({
    ...context,
    command: {
      stamp,
      chartType: "groupedColumn",
      // @ts-expect-error Arbitrary path patches are not supported editor commands.
      event: { kind: "path", value: "line.series" },
    },
  });
  return result;
}

function rangeContract(resolve: ResolveChartRange) {
  resolve({
    generatedColumnIds: ["date", "revenue"],
    definitionColumnIds: ["date", "revenue"],
    configuredColumnIds: [],
    ignoreCellRange: false,
  });
  // @ts-expect-error Generated visibility/order must be explicitly supplied.
  resolve({ definitionColumnIds: ["date"] });
}

function displayContract(
  create: CreateChartDisplayPolicy,
  policy: ChartDisplayPolicy,
  helpers: FinancialFormattingHelpers,
) {
  create({
    helpers,
    chartType: "line",
    period: "quarterly",
    decimalDigits: 0,
    globalDecimalDigits: 3,
    category: { cellDataType: "dateString" },
  });
  const date = new Date("2026-01-01T00:00:00Z");
  const category: string | number | Date = policy.category(date);
  const axis: string | number | Date = policy.numericAxis(1000000);
  policy.crosshair("raw");
  policy.legend(date);
  policy.seriesLabel(date);
  const tooltip: string = policy.tooltipNumber(1.25);
  // @ts-expect-error Numeric tooltip observations do not accept preformatted text.
  policy.tooltipNumber("1.25%");
  // @ts-expect-error Policies preserve source raw values and cannot promise only strings.
  const stringOnly: (value: number) => string = policy.numericAxis;
  void [category, axis, tooltip, stringOnly];
}
void [captureContract, sessionContract, rangeContract, displayContract];
