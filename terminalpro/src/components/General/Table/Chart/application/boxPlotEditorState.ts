import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type { EditorSelectionInput } from "../compatibility/editorBindings/types";
import type { ChartModel } from "../compatibility/legacyTypes";
import { sessionBindings } from "./applicationSessionSelection";
import type { resolveBoxPlotAppearance } from "./boxPlotAppearance";
import type { ResolvedRange } from "./types";
export function projectBoxPlotEditorState(
  box: ReturnType<typeof resolveBoxPlotAppearance>,
  model: ChartModel,
  range: ResolvedRange,
) {
  const bindings = sessionBindings(box.axisRuntime);
  const axes = {
    type: false,
    timeFormat: false,
    position: true,
    grid: true,
    ticks: false,
    tickLength: false,
    autoRotate: true,
  };
  const selection: EditorSelectionInput = {
    family: "boxPlot",
    style: { application: box.application },
    model,
    range,
    metadata: createEditorMetadata(box.application, bindings),
    eligibility: {
      legend: true,
      shadow: false,
      labels: false,
      markers: false,
      connectMissingData: false,
      axes: { category: axes, number: { ...axes, autoRotate: false } },
    },
  };
  const editor = selectApplicationEditorState(selection);
  if (!editor.valid) throw Error(editor.error);
  return { selection, bindings, editor: editor.value };
}
