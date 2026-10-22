import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import {
  rangeCategoryModelOverride,
  resolveRangeCategoryKind,
} from "../compatibility/rangeCategoryProvenance";
import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import type { RangeFamily } from "../echarts/rangeApplicationTypes";
import {
  sessionBaseline,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { resolveRangeAppearance } from "./rangeAppearance";
import { projectRangeEditorState } from "./rangeEditorState";
import { resolveRangeSeriesAppearance } from "./rangeSeriesAppearance";
import { projectOrdinarySetup } from "./setupProjection";

export class RangeSessionSelectionError extends Error {
  constructor(
    readonly status: "invalid" | "unsupported",
    readonly diagnostics: readonly SnapshotDiagnostic[],
  ) {
    super(diagnostics[0]?.message ?? "Invalid Range session selection");
  }
}

export function selectRangeSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<RangeFamily>,
) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(
    context.capture,
    setup,
    "statistical-observations",
  );
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const snapshot = projected.value.snapshot;
  if (!snapshot.rangeCategory)
    throw new RangeSessionSelectionError("unsupported", [
      {
        code: "range-category-provenance",
        path: [],
        message: "Range requires category capture provenance",
      },
    ]);
  const kind = resolveRangeCategoryKind(
    snapshot.rangeCategory,
    rangeCategoryModelOverride(baseline.model),
  );
  if (!kind.valid) throw new RangeSessionSelectionError("invalid", [kind.diagnostic]);
  const series = resolveRangeSeriesAppearance({
    family: context.inputs.family,
    generated: context.inputs.generated,
    theme: context.inputs.theme,
    baseline,
    seriesIds: setup.seriesIds.length ? setup.seriesIds : ["__range_editor"],
  });
  if (series.status !== "resolved")
    throw new RangeSessionSelectionError(series.status, series.diagnostics);
  const resolved = resolveRangeAppearance(
    {
      family: context.inputs.family,
      generated: context.inputs.generated,
      theme: context.inputs.theme,
      precision: context.inputs.precision,
      baseline,
      axisRuntime: context.local.axes,
      legendEnabled: context.local.legendEnabled,
    },
    setup.seriesIds,
    kind.kind,
    series.family === "rangeBar" && series.direction === "horizontal",
  );
  const field = Object.values(series.fields)[0];
  const application = {
    ...resolved.application,
    series: {
      ...resolved.application.series,
      strokeWidth: field.strokeWidth,
      strokeOpacity: field.strokeOpacity,
      fillOpacity: field.fillOpacity,
      lineDash: field.lineDash,
      labels: field.label,
      ...(series.family === "rangeArea"
        ? {
            markers: Object.values(series.fields)[0].marker,
            shadow: Object.values(series.fields)[0].shadow,
            connectMissingData: Object.values(series.fields)[0].connectMissingData,
          }
        : {}),
    },
  };
  const rangeAppearance = { ...resolved, application };
  const rangeEditor = {
    family: context.inputs.family,
    controls: {
      direction:
        series.family === "rangeBar" ? series.direction : ("vertical" as const),
      labelPlacement: field.label.placement,
      labelPadding: field.label.padding,
      interpolation:
        series.family === "rangeArea"
          ? Object.values(series.fields)[0].interpolation
          : { type: "linear" as const },
    },
  };
  return {
    baseline,
    range,
    setup,
    projection: projected.value,
    series,
    rangeAppearance,
    rangeEditor,
    ...projectRangeEditorState(
      context.inputs.family,
      rangeAppearance,
      baseline.model,
      range,
      snapshot,
    ),
  };
}
