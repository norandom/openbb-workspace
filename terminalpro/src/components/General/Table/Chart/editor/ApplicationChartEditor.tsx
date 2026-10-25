import type {
  HeatmapEditIntent,
  HeatmapEditorState,
} from "../application/heatmapTypes";
import type {
  HierarchyAcceptedEditIntent,
  HierarchyEditorState,
} from "../application/hierarchyEditorTypes";
import {
  ApplicationCustomizeEditor,
  type ApplicationCustomizeEditorProps,
} from "./ApplicationCustomizeEditor";
import { ChartEditorDock, type ChartEditorDockProps } from "./ChartEditorDock";
import { HeatmapCustomizeEditor } from "./heatmap/HeatmapCustomizeEditor";
import { HierarchyCustomizeEditor } from "./hierarchy/HierarchyCustomizeEditor";
import {
  HierarchySetupPanel,
  type HierarchySetupPanelProps,
} from "./hierarchy/HierarchySetupPanel";
import { ChartSetupPanel, type ChartSetupPanelProps } from "./setup/ChartSetupPanel";

interface OrdinaryChartEditorProps
  extends Omit<ChartEditorDockProps, "setup" | "customize">,
    ApplicationCustomizeEditorProps {
  kind?: "ordinary";
  setupProps: ChartSetupPanelProps;
}
export type ApplicationChartEditorProps =
  | OrdinaryChartEditorProps
  | (Omit<ChartEditorDockProps, "setup" | "customize"> & {
      kind: "heatmap";
      state: HeatmapEditorState;
      setupProps: ChartSetupPanelProps;
      onIntent: (intent: HeatmapEditIntent) => void;
    })
  | (Omit<ChartEditorDockProps, "setup" | "customize"> & {
      kind: "hierarchy";
      state: HierarchyEditorState;
      setupProps: HierarchySetupPanelProps;
      onIntent: (intent: HierarchyAcceptedEditIntent) => void;
    });
/** The session supplies values and commits edits; this composition owns only panel expansion. */
export function ApplicationChartEditor(props: ApplicationChartEditorProps) {
  if (props.kind === "heatmap") {
    const { kind: _kind, state, setupProps, onIntent, ...dock } = props;
    return (
      <ChartEditorDock
        {...dock}
        setup={<ChartSetupPanel {...setupProps} mode={{ kind: "heatmap" }} />}
        customize={<HeatmapCustomizeEditor state={state} onEdit={onIntent} />}
      />
    );
  }
  if (props.kind === "hierarchy") {
    const { kind: _kind, state, setupProps, onIntent, ...dock } = props;
    return (
      <ChartEditorDock
        {...dock}
        setup={<HierarchySetupPanel {...setupProps} />}
        customize={<HierarchyCustomizeEditor state={state} onEdit={onIntent} />}
      />
    );
  }
  return <OrdinaryChartEditor {...props} />;
}
function OrdinaryChartEditor({
  state,
  onIntent,
  onAxisStructure,
  setupProps,
  mode = { kind: "ordinary" },
  ...dock
}: OrdinaryChartEditorProps) {
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
