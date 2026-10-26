import type { ApplicationChartReady } from "../application/applicationChartSessionTypes";
import type { ApplicationSessionInputs } from "../application/applicationSessionTypes";
import type { ApplicationChartFamily } from "../application/comboSessionTypes";
import type { useApplicationChartSession } from "../application/useApplicationChartSession";
import { ApplicationChartEditor } from "../editor/ApplicationChartEditor";
import type { useCallerDock } from "./useCallerDock";

export function LiveChartEditor({
  ready,
  session,
  inputs,
  dock,
}: {
  readonly ready: ApplicationChartReady;
  readonly session: ReturnType<
    typeof useApplicationChartSession<ApplicationChartFamily>
  >;
  readonly inputs: ApplicationSessionInputs<ApplicationChartFamily>;
  readonly dock: ReturnType<typeof useCallerDock>;
}) {
  if (ready.kind === "funnel")
    return (
      <ApplicationChartEditor
        {...dock}
        kind="funnel"
        themeResetKey={inputs.theme.name}
        state={ready.editor}
        onIntent={session.onIntent}
        setupProps={{ ...ready.setupProps, onEdit: session.onSetup }}
      />
    );
  if (ready.kind === "heatmap")
    return (
      <ApplicationChartEditor
        {...dock}
        kind="heatmap"
        themeResetKey={inputs.theme.name}
        state={ready.editor}
        onIntent={session.onIntent}
        setupProps={{ ...ready.setupProps, onEdit: session.onSetup }}
      />
    );
  if (ready.kind === "hierarchy")
    return (
      <ApplicationChartEditor
        {...dock}
        kind="hierarchy"
        themeResetKey={inputs.theme.name}
        state={ready.editor}
        onIntent={session.onIntent}
        setupProps={{ ...ready.setupProps, onEdit: session.onHierarchySetup }}
      />
    );
  return (
    <ApplicationChartEditor
      {...dock}
      themeResetKey={inputs.theme.name}
      state={ready.editor}
      mode={
        ready.kind === "nightingale" || ready.kind === "radial"
          ? {
              kind: ready.kind,
              ...ready.editor.groupType,
              onEdit: (value) =>
                session.onIntent({
                  panel:
                    ready.kind === "radial"
                      ? "radialGroupType"
                      : "nightingaleGroupType",
                  edit: { value },
                }),
            }
          : ready.kind === "range"
            ? { kind: "range", ...ready.range, onEdit: session.onRange }
            : ready.kind === "waterfall"
              ? {
                  kind: "waterfall",
                  controls: ready.waterfall.controls,
                  onEdit: session.onWaterfall,
                }
              : ready.kind === "boxPlot"
                ? {
                    kind: "boxPlot",
                    controls: ready.boxPlot.controls,
                    onEdit: session.onBoxPlot,
                  }
                : ready.kind === "pie"
                  ? {
                      kind: "pie",
                      canSwitchCategorySeries: inputs.family !== "pie",
                    }
                  : ready.kind === "histogram"
                    ? {
                        kind: "histogram",
                        ...ready.histogram,
                        onEdit: session.onHistogram,
                      }
                    : ready.kind === "xy"
                      ? { kind: "xy", ...ready.xy, onEdit: session.onXy }
                      : ready.kind === "combo"
                        ? {
                            kind: "combo",
                            ...ready.combo,
                            onAssignment: session.onComboAssignment,
                            onGeometry: session.onComboGeometry,
                          }
                        : { kind: "ordinary" }
      }
      onIntent={session.onIntent}
      onAxisStructure={session.onAxisStructure}
      setupProps={{ ...ready.setupProps, onEdit: session.onSetup }}
    />
  );
}
