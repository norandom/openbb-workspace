import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import {
  sessionBaseline,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { resolveBoxPlotAppearance } from "./boxPlotAppearance";
import { projectBoxPlotEditorState } from "./boxPlotEditorState";
import { projectOrdinarySetup } from "./setupProjection";
export function selectBoxPlotSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<"boxPlot">,
) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(context.capture, setup, "box-observations");
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const resolved = resolveBoxPlotAppearance({
    ...context.inputs,
    baseline,
    seriesIds: setup.seriesIds,
    axisRuntime: context.local.axes,
  });
  const application =
    context.local.legendEnabled === undefined
      ? resolved.application
      : {
          ...resolved.application,
          legend: {
            ...resolved.application.legend,
            enabled: context.local.legendEnabled,
          },
        };
  const boxPlot = {
    ...resolved,
    application,
    style: { ...resolved.style, application },
  };
  return {
    baseline,
    range,
    setup,
    projection: projected.value,
    boxPlot,
    ...projectBoxPlotEditorState(boxPlot, baseline.model, range),
  };
}
