import type {
  ChartSnapshot,
  ResolvedSnapshotInput,
  ValidateSnapshot,
} from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import type {
  CaptionAppearance,
  CaptionTypography,
  CartesianSeriesAppearance,
  LineMarkerStyle,
  ResolvedCartesianStyle,
  SeriesAppearance,
  TranslateCartesian,
  ValidateCartesianStyle,
} from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";
import { validSnapshotInput, validStyle } from "./snapshot.fixtures";

const input: ResolvedSnapshotInput = validSnapshotInput;
const style: ResolvedCartesianStyle = validStyle;
function readonlyContracts(snapshot: ChartSnapshot) {
  // @ts-expect-error Observations cannot be reordered by consumers.
  snapshot.rows.reverse();
  // @ts-expect-error Missing cells cannot be filled by consumers.
  snapshot.rows[0].values.revenue = 0;
  if (
    snapshot.originalModel !== null &&
    typeof snapshot.originalModel === "object" &&
    !Array.isArray(snapshot.originalModel)
  ) {
    // @ts-expect-error Provenance object fields are deeply readonly.
    snapshot.originalModel.changed = true;
  }
  // @ts-expect-error Selection identity is immutable.
  snapshot.selectedColumnIds.push("costs");
  // @ts-expect-error Style overrides are immutable.
  style.series.revenue!.lineWidth = 3;
}
function resultContracts(validate: ValidateSnapshot, translate: TranslateCartesian) {
  const result = validate(input);
  if (result.valid) {
    const translated = translate(result.snapshot, "line", style);
    if (translated.status === "supported") void translated.options;
    else void translated.diagnostics[0].path;
  } else void result.diagnostics[0].path;
}
void readonlyContracts;
void resultContracts;

function appearanceContracts() {
  const disabled: LineMarkerStyle = { enabled: false };
  // @ts-expect-error Enabled markers require explicit size and shape.
  const incomplete: LineMarkerStyle = { enabled: true };
  // @ts-expect-error Complete caption typography is required.
  const partial: CaptionTypography = { color: "red" };
  // @ts-expect-error Projected marker supports only circle.
  const shape: CartesianSeriesAppearance = { itemStyle: {}, symbol: "square" };
  void [disabled, incomplete, partial, shape];
}
void appearanceContracts;

function appearanceHelperContracts(
  validate: ValidateCartesianStyle,
  series: SeriesAppearance,
  captions: CaptionAppearance,
) {
  const result = validate(style, "line");
  if (result.status === "valid") {
    const appearance = series(result.style, "revenue", 0, "line");
    const caption = captions(result.style);
    const color: string = caption.legendText.color;
    // @ts-expect-error Appearance consumers cannot mutate projected colors.
    appearance.itemStyle.color = color;
    void appearance;
  } else {
    const status: "invalid" | "unsupported" = result.status;
    void [status, result.diagnostics[0].path];
  }
}
void appearanceHelperContracts;

function rejectedAppearanceFields() {
  // @ts-expect-error Title visibility is boolean.
  const title: ResolvedCartesianStyle = { ...style, titleEnabled: "false" };
  // @ts-expect-error Color must remain a string.
  const fill: ResolvedCartesianStyle = { ...style, series: { revenue: { fill: 7 } } };
  const width: ResolvedCartesianStyle = {
    ...style,
    // @ts-expect-error Widths are numeric at the boundary.
    series: { revenue: { markerStrokeWidth: "1" } },
  };
  // @ts-expect-error Null does not mean omitted optional appearance.
  const nullLine: ResolvedCartesianStyle = { ...style, line: null };
  void [title, fill, width, nullLine];
}
void rejectedAppearanceFields;
