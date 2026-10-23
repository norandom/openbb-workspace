import { deriveEditorEligibility } from "../compatibility/editorBindings/eligibility";
import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import {
  sessionBaseline,
  sessionBindings,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { restoreAxisSettings } from "./axisPersistence";
import { projectOrdinarySetup } from "./setupProjection";
import type { SetupSelection } from "./setupTypes";
import { resolveWaterfallAppearance } from "./waterfallAppearance";

/** First-field admission is transient; the complete saved range remains available on family changes. */
export function waterfallSelection(setup: SetupSelection): SetupSelection {
  return {
    ...setup,
    seriesIds: setup.seriesIds.slice(0, 1),
    switchCategorySeries: false,
  };
}

export function selectWaterfallSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<"waterfall">,
) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const effective = waterfallSelection(setup);
  const projected = projectOrdinarySetup(
    context.capture,
    effective,
    "waterfall-observations",
  );
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const paint = context.inputs.theme.waterfallPaint;
  if (!paint) throw Error("Missing original Waterfall theme paint");
  const appearanceInput = {
    baseline,
    generated: context.inputs.generated,
    theme: context.inputs.theme,
    precision: context.inputs.precision,
    seriesIds: effective.seriesIds,
    axisRuntime: restoreAxisSettings(baseline.model, context.local.axes),
    paint,
    legendEnabled: context.local.legendEnabled,
  };
  const resolved = resolveWaterfallAppearance(appearanceInput);
  if (resolved.status !== "resolved") throw Error(resolved.diagnostics[0].message);
  const appearance = resolved.value;
  const bindings = sessionBindings(appearance.axisRuntime);
  const snapshot = projected.value.snapshot;
  const selection = {
    family: "waterfall" as const,
    style: { application: appearance.application },
    model: baseline.model,
    range,
    metadata: createEditorMetadata(appearance.application, bindings),
    eligibility: deriveEditorEligibility({
      family: "waterfall",
      firstDatum: { category: snapshot.rows[0]?.category },
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
  return {
    baseline,
    range,
    setup,
    projection: projected.value,
    appearance,
    appearanceInput,
    selection,
    bindings,
    editor: editor.value,
    fieldId: effective.seriesIds.length ? effective.seriesIds[0] : undefined,
  };
}
