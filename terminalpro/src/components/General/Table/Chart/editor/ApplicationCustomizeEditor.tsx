import type {
  PieEditIntent,
  PieEditorState,
} from "../application/pieSessionTypes";
import {
  horizontalAxisId,
  verticalAxisId,
} from "../compatibility/editorBindings/metadata";
import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import type {
  NightingaleEditIntent,
  NightingaleEditorState,
} from "../compatibility/nightingaleContracts";
import type {
  RadarEditIntent,
  RadarEditorState,
} from "../compatibility/radarContracts";
import type {
  RadialEditIntent,
  RadialEditorState,
} from "../compatibility/radialContracts";
import { ApplicationAxisEditor } from "./ApplicationAxisEditor";
import { ApplicationEditorGroup } from "./ApplicationEditorGroup";
import { ApplicationSeriesEditor } from "./ApplicationSeriesEditor";
import { ChartBackgroundPanel } from "./background/ChartBackgroundPanel";
import type { ApplicationEditorMode } from "./combo/comboEditorMode";
import { ChartLegendPanel } from "./legend/ChartLegendPanel";
import { NightingaleControls } from "./nightingale/NightingaleControls";
import { ChartPaddingPanel } from "./padding/ChartPaddingPanel";
import { RadarControls } from "./radar/RadarControls";
import { RadialControls } from "./radial/RadialControls";
import { ChartTitlesPanel } from "./titles/ChartTitlesPanel";

export interface ApplicationCustomizeEditorProps {
  mode?: ApplicationEditorMode;
  state:
    | ApplicationEditorState
    | PieEditorState
    | RadarEditorState
    | NightingaleEditorState
    | RadialEditorState;
  onIntent: (
    intent:
      | ApplicationEditorIntent
      | PieEditIntent
      | RadarEditIntent
      | NightingaleEditIntent
      | RadialEditIntent,
  ) => void;
  onAxisStructure: (event: ApplicationAxisStructureEvent) => void;
}
export function ApplicationCustomizeEditor(
  props: ApplicationCustomizeEditorProps,
) {
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
      {"kind" in state && state.kind === "radial" && (
        <RadialControls {...state.polarAxis} onEdit={onIntent} />
      )}
      {"kind" in state && state.kind === "nightingale" && (
        <NightingaleControls {...state.polarAxis} onEdit={onIntent} />
      )}
      {"kind" in state && state.kind === "radar" && (
        <RadarControls {...state.polarAxis} onEdit={onIntent} />
      )}
      {axisState && horizontal && (
        <>
          <ApplicationAxisEditor
            {...props}
            state={axisState}
            axis={horizontal}
          />
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
