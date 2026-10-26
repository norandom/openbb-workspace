import type { FunnelFamily } from "../compatibility/funnelContracts";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { buildFunnelData } from "../echarts/funnelData";
import {
  sessionBaseline,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { resolveFunnelAppearance } from "./funnelAppearance";
import { projectFunnelEditorState } from "./funnelEditor";
import type { FunnelSessionSelection } from "./funnelSessionTypes";
import { projectOrdinarySetup } from "./setupProjection";
export function selectFunnelSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<FunnelFamily>,
): FunnelSessionSelection {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(context.capture, setup, "funnel-observations");
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  if (!context.inputs.funnelThemePaint)
    throw Error("Funnel requires caller theme paint");
  const resolved = resolveFunnelAppearance(
    {
      baseline,
      generated: context.inputs.generated,
      theme: context.inputs.theme,
      themePaint: context.inputs.funnelThemePaint,
      precision: context.inputs.precision,
    },
    context.inputs.family,
  );
  if (resolved.valid === false) throw Error(resolved.error);
  return {
    baseline,
    range,
    setup,
    projection: projected.value,
    data: buildFunnelData(projected.value, context.inputs.family),
    style: resolved.value,
    editor: projectFunnelEditorState(resolved.value),
  };
}
