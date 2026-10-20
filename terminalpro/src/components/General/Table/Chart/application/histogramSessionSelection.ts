import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type { EditorSelectionInput } from "../compatibility/editorBindings/types";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { sessionBaseline, sessionRange, sessionSetup, sessionBindings } from "./applicationSessionSelection";
import { projectOrdinarySetup } from "./setupProjection";
import { resolveHistogramAppearance } from "./histogramAppearance";
import { xyAxesRuntime } from "./xyAppearance";

export function selectHistogramSession(storage: ChartStorageOutput, context: ApplicationSessionContext<"histogram">) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(context.capture, setup, "histogram-observations");
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const resolved = resolveHistogramAppearance({ ...context.inputs, baseline,
    seriesIds: setup.seriesIds, axisRuntime: xyAxesRuntime });
  const axes = { type: false, timeFormat: false, position: true,
    grid: true, ticks: true, tickLength: true, autoRotate: false };
  const selection: EditorSelectionInput = {
    family: "histogram", style: { application: resolved.application }, model: baseline.model, range,
    metadata: createEditorMetadata(resolved.application, sessionBindings(xyAxesRuntime)),
    eligibility: { legend: true, shadow: true, labels: true, markers: false,
      connectMissingData: false, axes: { category: axes, number: axes } },
  };
  const editor = selectApplicationEditorState(selection);
  if (!editor.valid) throw Error(editor.error);
  return { baseline, range, setup, projection: projected.value,
    histogram: resolved, selection, editor: editor.value };
}
