import type {
  SankeyAppearanceIntent,
  SankeyEditorState,
} from "../../application/sankeySessionTypes";
import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import { ChartBackgroundPanel } from "../background/ChartBackgroundPanel";
import { ChartPaddingPanel } from "../padding/ChartPaddingPanel";
import { ChartTitlesPanel } from "../titles/ChartTitlesPanel";
import { ChartTooltipsPanel } from "../tooltips/ChartTooltipsPanel";

export function SankeyCustomizePanel({
  state,
  onEdit,
}: {
  readonly state: SankeyEditorState;
  readonly onEdit: (intent: SankeyAppearanceIntent) => void;
}) {
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
      <ChartTooltipsPanel
        {...state.tooltips}
        onEdit={(edit) => onEdit({ panel: "tooltips", edit })}
      />
    </>
  );
}
