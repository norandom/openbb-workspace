import { Switch } from "../../../../ds/atoms/Switch";
import type { ApplicationCustomizeEditorProps } from "./ApplicationCustomizeEditor";
import { ApplicationEditorGroup } from "./ApplicationEditorGroup";
import { BoxPlotControls } from "./box/BoxPlotControls";
import { ComboGeometryControl } from "./combo/ComboGeometryControl";
import { HistogramBinControls } from "./histogram/HistogramBinControls";
import { ChartLabelsPanel } from "./labels/ChartLabelsPanel";
import { ChartMarkersPanel } from "./markers/ChartMarkersPanel";
import { PieLabelControls } from "./pie/PieLabelControls";
import { RangeControls } from "./range/RangeControls";
import { ChartSeriesStylePanel } from "./series/ChartSeriesStylePanel";
import { ChartShadowPanel } from "./shadow/ChartShadowPanel";
import { ChartTooltipsPanel } from "./tooltips/ChartTooltipsPanel";
import { WaterfallControls } from "./waterfall/WaterfallControls";
import { XyPointControls } from "./xy/XyPointControls";
export function ApplicationSeriesEditor({
  state,
  onIntent,
  mode,
}: ApplicationCustomizeEditorProps) {
  if (!("axes" in state))
    return (
      <ApplicationEditorGroup label="Series">
        <ChartTooltipsPanel
          {...state.tooltips}
          onEdit={(edit) => onIntent({ panel: "tooltips", edit })}
        />
        <ChartSeriesStylePanel
          {...state.series}
          onEdit={(edit) => onIntent({ panel: "series", edit })}
        />
        <PieLabelControls {...state} onIntent={onIntent} />
        <ChartShadowPanel
          {...state.shadow}
          onEdit={(edit) => onIntent({ panel: "shadow", edit })}
        />
      </ApplicationEditorGroup>
    );
  const eligibility = state.eligibility;
  return (
    <ApplicationEditorGroup label="Series">
      {mode?.kind === "combo" && <ComboGeometryControl mode={mode} />}
      <ChartTooltipsPanel
        {...state.tooltips}
        onEdit={(edit) => onIntent({ panel: "tooltips", edit })}
      />
      {mode?.kind === "histogram" && <HistogramBinControls mode={mode} />}
      {mode?.kind === "xy" ? (
        <XyPointControls mode={mode} />
      ) : mode?.kind === "waterfall" ? (
        <WaterfallControls value={mode.controls} onEdit={mode.onEdit} />
      ) : (
        <ChartSeriesStylePanel
          {...state.series}
          onEdit={(edit) => onIntent({ panel: "series", edit })}
        />
      )}
      {mode?.kind === "boxPlot" && (
        <BoxPlotControls value={mode.controls} onEdit={mode.onEdit} />
      )}
      {mode?.kind === "range" && <RangeControls mode={mode} />}
      {eligibility.connectMissingData && (
        <div className="chart-caption-toggle">
          <Switch
            label="Connect Missing Data"
            checked={state.connectMissingData}
            onCheckedChange={(value) =>
              onIntent({ panel: "connectMissingData", value })
            }
          />
        </div>
      )}
      {eligibility.markers && mode?.kind !== "xy" && (
        <ChartMarkersPanel
          {...state.markers}
          onEdit={(edit) => onIntent({ panel: "markers", edit })}
        />
      )}
      {eligibility.labels && (
        <ChartLabelsPanel
          {...state.labels}
          onEdit={(edit) => onIntent({ panel: "labels", edit })}
        />
      )}
      {eligibility.shadow && (
        <ChartShadowPanel
          {...state.shadow}
          onEdit={(edit) => onIntent({ panel: "shadow", edit })}
        />
      )}
    </ApplicationEditorGroup>
  );
}
