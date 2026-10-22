import { deriveEditorEligibility } from "../compatibility/editorBindings/eligibility";
import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type { EditorSelectionInput } from "../compatibility/editorBindings/types";
import type { ChartModel } from "../compatibility/legacyTypes";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type { RangeFamily } from "../echarts/rangeApplicationTypes";
import { sessionBindings } from "./applicationSessionSelection";
import type { RangeAppearance } from "./rangeAppearance";
import type { ResolvedRange } from "./types";

export function projectRangeEditorState(
  family: RangeFamily,
  appearance: RangeAppearance,
  model: ChartModel,
  range: ResolvedRange,
  snapshot: ChartSnapshot,
) {
  const bindings = sessionBindings(appearance.axisRuntime);
  const raw = snapshot.rangeCategory?.firstCategoryIsDate
    ? new Date(0)
    : snapshot.rows[0]?.category;
  const selection: EditorSelectionInput = {
    family,
    style: { application: appearance.application },
    model,
    range,
    metadata: createEditorMetadata(appearance.application, bindings),
    eligibility: deriveEditorEligibility({
      family,
      firstDatum: raw === undefined ? undefined : { category: raw },
      dimensionIds: ["category"],
      grouping: false,
      categorySeriesSwitched: false,
      axisTypes: {
        category: bindings.category.optionType,
        number: bindings.number.optionType,
      },
    }),
  };
  const editor = selectApplicationEditorState(selection);
  if (!editor.valid) throw Error(editor.error);
  return { selection, bindings, editor: editor.value };
}
