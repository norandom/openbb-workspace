import type { ApplicationCustomizeEditorProps } from "./ApplicationCustomizeEditor";
import { ComboGeometryControl } from "./combo/ComboGeometryControl";
import { Switch } from "../../../../ds/atoms/Switch";
import { ChartTooltipsPanel } from "./tooltips/ChartTooltipsPanel";
import { ChartSeriesStylePanel } from "./series/ChartSeriesStylePanel";
import { ChartShadowPanel } from "./shadow/ChartShadowPanel";
import { ChartLabelsPanel } from "./labels/ChartLabelsPanel";
import { ChartMarkersPanel } from "./markers/ChartMarkersPanel";
import { ApplicationEditorGroup } from "./ApplicationEditorGroup";
export function ApplicationSeriesEditor({
  state,
  onIntent,
  mode,
}: ApplicationCustomizeEditorProps) {
  const eligibility = state.eligibility;
  return (
    <ApplicationEditorGroup label="Series">
      {mode?.kind === "combo" && <ComboGeometryControl mode={mode} />}
      <ChartTooltipsPanel
        {...state.tooltips}
        onEdit={(edit) => onIntent({ panel: "tooltips", edit })}
      />
      <ChartSeriesStylePanel
        {...state.series}
        onEdit={(edit) => onIntent({ panel: "series", edit })}
      />
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
      {eligibility.markers && (
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
