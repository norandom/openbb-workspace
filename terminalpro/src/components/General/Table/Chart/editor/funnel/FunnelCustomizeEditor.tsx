import type {
  FunnelEditIntent,
  FunnelEditorState,
} from "../../application/funnelEditorTypes";
import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import { ChartBackgroundPanel } from "../background/ChartBackgroundPanel";
import { ChartLabelsPanel } from "../labels/ChartLabelsPanel";
import { ChartPaddingPanel } from "../padding/ChartPaddingPanel";
import { ChartSeriesStylePanel } from "../series/ChartSeriesStylePanel";
import { ChartShadowPanel } from "../shadow/ChartShadowPanel";
import { ChartTitlesPanel } from "../titles/ChartTitlesPanel";
import { ChartTooltipsPanel } from "../tooltips/ChartTooltipsPanel";
import { FunnelDropOffPanel } from "./FunnelDropOffPanel";
export interface FunnelCustomizeEditorProps {
  readonly state: FunnelEditorState;
  readonly onEdit: (intent: FunnelEditIntent) => void;
}
export function FunnelCustomizeEditor({ state, onEdit }: FunnelCustomizeEditorProps) {
  return (
    <>
      <ApplicationEditorGroup label="Chart Style">
        <ChartPaddingPanel
          {...state.padding}
          onEdit={(edit) => onEdit({ panel: "padding", edit })}
        />
        <ChartBackgroundPanel
          {...state.background}
          onEdit={(edit) => onEdit({ panel: "background", edit })}
        />
      </ApplicationEditorGroup>
      <ChartTitlesPanel
        {...state.titles}
        onEdit={(edit) => {
          if (edit.caption === "title" || edit.caption === "subtitle")
            onEdit({ panel: "titles", edit: { ...edit, caption: edit.caption } });
        }}
      />
      <ApplicationEditorGroup label="Series">
        <ChartSeriesStylePanel
          {...state.series}
          onEdit={(edit) => onEdit({ panel: "series", edit })}
        />
        <ChartLabelsPanel
          {...state.labels}
          onEdit={(edit) => onEdit({ panel: "labels", edit })}
        />
        <ChartLabelsPanel
          {...state.stageLabels}
          label="Stage Labels"
          onEdit={(edit) => onEdit({ panel: "stageLabels", edit })}
        />
        {state.dropOff && (
          <FunnelDropOffPanel
            state={state.dropOff}
            onEdit={(edit) => onEdit({ panel: "funnelDropOff", edit })}
          />
        )}
        {state.shadow && (
          <ChartShadowPanel
            {...state.shadow}
            onEdit={(edit) => onEdit({ panel: "shadow", edit })}
          />
        )}
        <ChartTooltipsPanel
          {...state.tooltips}
          onEdit={(edit) => onEdit({ panel: "tooltips", edit })}
        />
      </ApplicationEditorGroup>
    </>
  );
}
