import type {
  NightingaleEditorState,
  NightingaleEditIntent,
} from "../compatibility/nightingaleContracts";
import { NightingaleControls } from "./nightingale/NightingaleControls";
import type {
  RadarEditorState,
  RadarEditIntent,
} from "../compatibility/radarContracts";
import { RadarControls } from "./radar/RadarControls";
import type { PieEditorState, PieEditIntent } from "../application/pieSessionTypes";
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
  state:
    | ApplicationEditorState
    | PieEditorState
    | RadarEditorState
    | NightingaleEditorState;
  onIntent: (
    intent:
      | ApplicationEditorIntent
      | PieEditIntent
      | RadarEditIntent
      | NightingaleEditIntent,
  ) => void;
  onAxisStructure: (event: ApplicationAxisStructureEvent) => void;
}
export function ApplicationCustomizeEditor(props: ApplicationCustomizeEditorProps) {
  const { state, onIntent } = props;
  const axisState = "axes" in state ? state : undefined;
  const horizontal = axisState ? horizontalAxisId(axisState.axes) : undefined;
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
      {(!axisState || axisState.eligibility.legend) && (
        <ChartLegendPanel
          {...state.legend}
          onEdit={(edit) => onIntent({ panel: "legend", edit })}
        />
      )}
      <ApplicationSeriesEditor {...props} />
      {"kind" in state && state.kind === "nightingale" && (
        <NightingaleControls {...state.polarAxis} onEdit={onIntent} />
      )}
      {"kind" in state && state.kind === "radar" && (
        <RadarControls {...state.polarAxis} onEdit={onIntent} />
      )}
      {axisState && horizontal && (
        <>
          <ApplicationAxisEditor {...props} state={axisState} axis={horizontal} />
          <ApplicationAxisEditor
            {...props}
            state={axisState}
            axis={verticalAxisId(horizontal)}
          />
        </>
      )}
    </>
  );
}
