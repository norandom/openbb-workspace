import type { ChartSnapshot, ResolvedSnapshotInput, ValidateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import type { ResolvedCartesianStyle, TranslateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";
import { validSnapshotInput, validStyle } from "./snapshot.fixtures";
const input: ResolvedSnapshotInput = validSnapshotInput;
const style: ResolvedCartesianStyle = validStyle;
function readonlyContracts(snapshot: ChartSnapshot) {
  // @ts-expect-error Observations cannot be reordered by consumers.
  snapshot.rows.reverse();
  // @ts-expect-error Missing cells cannot be filled by consumers.
  snapshot.rows[0].values.revenue = 0;
  if (snapshot.originalModel !== null && typeof snapshot.originalModel === "object" && !Array.isArray(snapshot.originalModel)) {
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

