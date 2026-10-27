import type {
  SankeyAppearanceIntent,
  SankeyEditorProjection,
} from "../application/sankeySessionTypes";
import type { SankeySetupEdit } from "../application/sankeyTypes";
import { ChartEditorDock, type ChartEditorDockProps } from "../editor/ChartEditorDock";
import { SankeyCustomizePanel } from "../editor/sankey/SankeyCustomizePanel";
import { SankeySetupPanel } from "../editor/sankey/SankeySetupPanel";

export function SankeyChartEditor({
  projection,
  dock,
  onSetup,
  onIntent,
}: {
  readonly projection: SankeyEditorProjection;
  readonly dock: Omit<ChartEditorDockProps, "setup" | "customize">;
  readonly onSetup: (edit: SankeySetupEdit) => void;
  readonly onIntent: (intent: SankeyAppearanceIntent) => void;
}) {
  return (
    <ChartEditorDock
      {...dock}
      setup={<SankeySetupPanel {...projection.setupProps} onEdit={onSetup} />}
      customize={
        projection.editor ? (
          <SankeyCustomizePanel state={projection.editor} onEdit={onIntent} />
        ) : (
          <p role="status">
            {projection.diagnostics[0]?.message ?? "Waiting for chart settings"}
          </p>
        )
      }
    />
  );
}
export function SankeyChartNotice({
  projection,
}: {
  readonly projection: SankeyEditorProjection;
}) {
  const warnings = projection.diagnostics.filter(
    (issue) => issue.severity === "warning",
  );
  return (
    <>
      {warnings.length > 0 && (
        <div role="status" aria-live="polite" className="text-xs px-2 shrink-0">
          {warnings.map((issue, index) => (
            <p key={`${issue.code}-${index}`}>
              {issue.message}
              {issue.rowIds.length ? ` Rows: ${issue.rowIds.join(", ")}.` : ""}
            </p>
          ))}
        </div>
      )}
      {projection.notice && (
        <p role="status" className="text-sm text-center shrink-0">
          {projection.notice}
        </p>
      )}
    </>
  );
}
