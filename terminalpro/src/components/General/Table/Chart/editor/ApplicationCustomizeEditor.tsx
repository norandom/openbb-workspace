import type { ApplicationEditorMode } from "./combo/comboEditorMode";
import { ApplicationSeriesEditor } from "./ApplicationSeriesEditor";
import {
  horizontalAxisId,
  verticalAxisId,
} from "../compatibility/editorBindings/metadata";
import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import { ChartTitlesPanel } from "./titles/ChartTitlesPanel";
import { ChartLegendPanel } from "./legend/ChartLegendPanel";
import { ChartPaddingPanel } from "./padding/ChartPaddingPanel";
import { ChartBackgroundPanel } from "./background/ChartBackgroundPanel";
import { ApplicationEditorGroup } from "./ApplicationEditorGroup";
import { ApplicationAxisEditor } from "./ApplicationAxisEditor";

export interface ApplicationCustomizeEditorProps {
  mode?: ApplicationEditorMode;
  state: ApplicationEditorState;
  onIntent: (intent: ApplicationEditorIntent) => void;
  onAxisStructure: (event: ApplicationAxisStructureEvent) => void;
}
export function ApplicationCustomizeEditor(
  props: ApplicationCustomizeEditorProps,
) {
  const { state, onIntent } = props;
  const horizontal = horizontalAxisId(state.axes);
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
      <ApplicationSeriesEditor {...props} />
      <ApplicationAxisEditor {...props} axis={horizontal} />
      <ApplicationAxisEditor {...props} axis={verticalAxisId(horizontal)} />
    </>
  );
}
