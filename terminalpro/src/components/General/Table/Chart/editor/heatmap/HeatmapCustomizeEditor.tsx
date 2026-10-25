import type {
  HeatmapEditIntent,
  HeatmapEditorState,
} from "../../application/heatmapTypes";
import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import { ChartBackgroundPanel } from "../background/ChartBackgroundPanel";
import { HierarchyGradientLegendPanel } from "../hierarchy/HierarchyGradientLegendPanel";
import { ChartLabelsPanel } from "../labels/ChartLabelsPanel";
import { ChartPaddingPanel } from "../padding/ChartPaddingPanel";
import { ChartSeriesStylePanel } from "../series/ChartSeriesStylePanel";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import { ChartTitlesPanel } from "../titles/ChartTitlesPanel";
import { ChartTooltipsPanel } from "../tooltips/ChartTooltipsPanel";
import { HeatmapAxisEditor } from "./HeatmapAxisEditor";
export interface HeatmapCustomizeEditorProps {
  readonly state: HeatmapEditorState;
  readonly onEdit: (intent: HeatmapEditIntent) => void;
}
export function HeatmapCustomizeEditor({ state, onEdit }: HeatmapCustomizeEditorProps) {
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
        onEdit={(edit) => onEdit({ panel: "titles", edit })}
      />
      <HierarchyGradientLegendPanel
        {...state.gradientLegend}
        onEdit={(edit) => onEdit({ panel: "gradientLegend", edit })}
      />
      <ApplicationEditorGroup label="Series">
        <ChartLabelsPanel
          {...state.labels}
          onEdit={(edit) => onEdit({ panel: "labels", edit })}
        />
        <CaptionColorInput
          value={state.series.stroke}
          onChange={(value) =>
            onEdit({ panel: "heatmapLine", edit: { field: "stroke", value } })
          }
        />
        <ChartSeriesStylePanel
          {...state.series}
          onEdit={(edit) => {
            if (edit.field === "strokeWidth" || edit.field === "strokeOpacity")
              onEdit({
                panel: "heatmapLine",
                edit: { field: edit.field, value: edit.value },
              });
          }}
        />
        <ChartTooltipsPanel
          {...state.tooltips}
          onEdit={(edit) => onEdit({ panel: "tooltips", edit })}
        />
      </ApplicationEditorGroup>
      <HeatmapAxisEditor axis="x" state={state} onEdit={onEdit} />
      <HeatmapAxisEditor axis="y" state={state} onEdit={onEdit} />
    </>
  );
}
