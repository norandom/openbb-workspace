import type {
  HierarchyAcceptedEditIntent,
  HierarchyEditorState,
} from "../../application/hierarchyEditorTypes";
import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import { ChartBackgroundPanel } from "../background/ChartBackgroundPanel";
import { ChartPaddingPanel } from "../padding/ChartPaddingPanel";
import { ChartTitlesPanel } from "../titles/ChartTitlesPanel";
import { ChartTooltipsPanel } from "../tooltips/ChartTooltipsPanel";
import { HierarchyGradientLegendPanel } from "./HierarchyGradientLegendPanel";
import { HierarchySpacingControls } from "./HierarchySpacingControls";

export interface HierarchyCustomizeEditorProps {
  readonly state: HierarchyEditorState;
  readonly onEdit: (intent: HierarchyAcceptedEditIntent) => void;
}

export function HierarchyCustomizeEditor({
  state,
  onEdit,
}: HierarchyCustomizeEditorProps) {
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
      <HierarchyGradientLegendPanel
        {...state.gradientLegend}
        onEdit={(edit) => onEdit({ panel: "hierarchyGradientLegend", edit })}
      />
      <ApplicationEditorGroup label="Series">
        <ChartTooltipsPanel
          {...state.tooltips}
          onEdit={(edit) => onEdit({ panel: "tooltips", edit })}
        />
        {state.family === "treemap" && (
          <HierarchySpacingControls
            controls={state.spacing}
            onEdit={(edit) => onEdit({ panel: "hierarchySpacing", edit })}
          />
        )}
      </ApplicationEditorGroup>
    </>
  );
}
