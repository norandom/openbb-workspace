import type {
  ChartModel,
  RuntimeOptions,
  ValidationResult,
} from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type {
  ColumnEditorEvent,
  ColumnEditorInput,
  InitializeOptionBaselineInput,
  MapColumnEditorEvent,
  OptionBaseline,
  OptionBaselineInput,
  SelectOptionBaseline,
  SynchronizeOptionBaselineInput,
} from "../../../src/components/General/Table/Chart/compatibility/optionStateTypes";

declare const baseline: OptionBaseline;
declare const model: ChartModel;
declare const options: RuntimeOptions;
declare const select: SelectOptionBaseline;
declare const map: MapColumnEditorEvent;

const initialize: InitializeOptionBaselineInput = {
  kind: "initialize",
  stateAddress: "default",
  partitionModel: null,
  rootModel: model,
  rootOptions: options,
  initialChartType: "line",
};
const synchronize: SynchronizeOptionBaselineInput = {
  kind: "synchronize",
  stateAddress: "other",
  partitionModel: undefined,
  previous: baseline,
};
const transition: OptionBaselineInput = synchronize;
const selected: ValidationResult<OptionBaseline> = select(initialize);
const mapped: ValidationResult<RuntimeOptions> = map({
  chartType: "stackedColumn",
  event: { kind: "stroke-width", value: 0.5 },
});
const events: ColumnEditorEvent[] = [
  { kind: "title-text", value: "" },
  { kind: "title-enabled", value: false },
  ...(["top", "bottom", "left", "right"] as const).map((value) => ({
    kind: "legend-position" as const,
    value,
  })),
  { kind: "stroke-width", value: 0 },
];
const editor: ColumnEditorInput = { chartType: "groupedColumn", event: events[0] };
// Nested values remain compatible with reducers; ownership is protected by copying.
baseline.model.chartType = "line";
baseline.options.custom = undefined;
// @ts-expect-error outer baseline fields are readonly
baseline.stateAddress = "changed";
// @ts-expect-error model replacement is readonly
baseline.model = model;
// @ts-expect-error options replacement is readonly
baseline.options = options;
// @ts-expect-error chart type replacement is readonly
baseline.chartType = "line";
// @ts-expect-error synchronization needs explicit prior state
const missingPrevious: OptionBaselineInput = {
  kind: "synchronize",
  stateAddress: "default",
};
// @ts-expect-error initialization needs independently resolved initial type
const missingInitialType: OptionBaselineInput = {
  kind: "initialize",
  stateAddress: "default",
};
const rootFallback: SynchronizeOptionBaselineInput = {
  ...synchronize,
  // @ts-expect-error synchronization has no root fallback
  rootOptions: options,
};
// @ts-expect-error text and enablement are separate typed events
const invalidText: ColumnEditorEvent = { kind: "title-text", value: true };
// @ts-expect-error enablement requires boolean
const invalidEnabled: ColumnEditorEvent = { kind: "title-enabled", value: "true" };
// @ts-expect-error legend positions are a closed domain
const invalidPosition: ColumnEditorEvent = { kind: "legend-position", value: "center" };
// @ts-expect-error width requires a number
const invalidWidth: ColumnEditorEvent = { kind: "stroke-width", value: "4" };
// @ts-expect-error discriminator must match an observed control
const invalidKind: ColumnEditorEvent = { kind: "title", value: "text" };
// @ts-expect-error mapper supports columns only
const invalidFamily: ColumnEditorInput = { chartType: "line", event: events[0] };
void [
  transition,
  selected,
  mapped,
  editor,
  missingPrevious,
  missingInitialType,
  rootFallback,
  invalidText,
  invalidEnabled,
  invalidPosition,
  invalidWidth,
  invalidKind,
  invalidFamily,
];
