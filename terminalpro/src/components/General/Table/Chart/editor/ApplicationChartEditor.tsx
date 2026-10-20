import { ChartEditorDock, type ChartEditorDockProps } from "./ChartEditorDock";
import {
  ChartSetupPanel,
  type ChartSetupPanelProps,
} from "./setup/ChartSetupPanel";
import {
  ApplicationCustomizeEditor,
  type ApplicationCustomizeEditorProps,
} from "./ApplicationCustomizeEditor";

export interface ApplicationChartEditorProps
  extends Omit<ChartEditorDockProps, "setup" | "customize">,
    ApplicationCustomizeEditorProps {
  setupProps: ChartSetupPanelProps;
}
/** The session supplies values and commits edits; this composition owns only panel expansion. */
export function ApplicationChartEditor({
  state,
  onIntent,
  onAxisStructure,
  setupProps,
  mode = { kind: "ordinary" },
  ...dock
}: ApplicationChartEditorProps) {
  return (
    <ChartEditorDock
      {...dock}
      setup={<ChartSetupPanel {...setupProps} mode={mode} />}
      customize={
        <ApplicationCustomizeEditor
          mode={mode}
          state={state}
          onIntent={onIntent}
          onAxisStructure={onAxisStructure}
        />
      }
    />
  );
}
