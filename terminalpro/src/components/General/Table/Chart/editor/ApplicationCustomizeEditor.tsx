import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import { Switch } from "../../../../ds/atoms/Switch";
import { ChartTitlesPanel } from "./titles/ChartTitlesPanel";
import { ChartLegendPanel } from "./legend/ChartLegendPanel";
import { ChartPaddingPanel } from "./padding/ChartPaddingPanel";
import { ChartBackgroundPanel } from "./background/ChartBackgroundPanel";
import { ChartTooltipsPanel } from "./tooltips/ChartTooltipsPanel";
import { ChartSeriesStylePanel } from "./series/ChartSeriesStylePanel";
import { ChartShadowPanel } from "./shadow/ChartShadowPanel";
import { ChartLabelsPanel } from "./labels/ChartLabelsPanel";
import { ChartMarkersPanel } from "./markers/ChartMarkersPanel";
import { ApplicationEditorGroup } from "./ApplicationEditorGroup";
import { ApplicationAxisEditor } from "./ApplicationAxisEditor";

export interface ApplicationCustomizeEditorProps {
  state: ApplicationEditorState;
  onIntent: (intent: ApplicationEditorIntent) => void;
  onAxisStructure: (event: ApplicationAxisStructureEvent) => void;
}
function Series({ state, onIntent }: ApplicationCustomizeEditorProps) {
  const eligibility = state.eligibility;
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
export function ApplicationCustomizeEditor(props: ApplicationCustomizeEditorProps) {
  const { state, onIntent } = props;
  return (
    <>
      <ApplicationEditorGroup label="Chart Style">
        <ChartPaddingPanel
          {...state.padding}
          onEdit={(edit) => onIntent({ panel: "padding", edit })}
        />
        <ChartBackgroundPanel
          {...state.background}
          onEdit={(edit) => onIntent({ panel: "background", edit })}
        />
      </ApplicationEditorGroup>
      <ChartTitlesPanel
        {...state.titles}
        onEdit={(edit) => onIntent({ panel: "titles", edit })}
      />
      {state.eligibility.legend && (
        <ChartLegendPanel
          {...state.legend}
          onEdit={(edit) => onIntent({ panel: "legend", edit })}
        />
      )}
      <Series {...props} />
      <ApplicationAxisEditor {...props} axis="category" />
      <ApplicationAxisEditor {...props} axis="number" />
    </>
  );
}
