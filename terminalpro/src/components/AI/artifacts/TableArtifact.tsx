import { AgGridReact } from "ag-grid-react";
import { memo, useMemo } from "react";
import { toast } from "sonner";
import { useShallowCopilotStore } from "~/lib/state/copilot";
import { useShallowThemeStore } from "~/lib/state/theme";
import { cn } from "../../ds/utils";
import { getColumnDefs } from "../../General/Table/AgGridUtils";
import { useAgThemes } from "../../General/Table/Chart/themes";

import { ArtifactActions, type ArtifactProps } from "./ArtifactShared";

const defaultColDef = {
  minWidth: 100,
  resizable: true,
  sortable: true,
  filter: true,
  suppressAutoSize: true,
  suppressHeaderMenuButton: true,
};

export const TableArtifact = memo<ArtifactProps<"table">>(
  ({ artifact, inAiMessage }) => {
    const theme = useShallowThemeStore((state) => state.theme);
    const decimalDigits = useShallowThemeStore((state) => state.decimalDigits);
    const agTheme = useAgThemes(theme)?.agTheme;

    const isHighlighted = useShallowCopilotStore(
      (s) => s.hoveredCitationWidgetId === artifact.name,
    );

    const { rowData, colDefs, heights, totalHeight } = useMemo(() => {
      if (!(artifact?.content?.length > 0)) return {};

      // Reuse the widget table colDef builder so artifacts inherit the same
      // number formatting (decimalDigits), numeric alignment and humanized
      // headers as dashboard tables. Empty widget => no widget-context renderer.
      const colDefs = getColumnDefs(artifact.content, {}, decimalDigits);

      const heights = { row: 32, header: 32, max: 200 };
      const totalHeight = artifact.content.length * heights.row + heights.header;
      return { rowData: artifact.content, colDefs, heights, totalHeight };
    }, [artifact.content, decimalDigits]);

    if (!rowData) return null;

    return (
      <div
        id={artifact.name}
        className={cn("mt-1 p-[3px]", {
          "outline-2 outline-brand-main rounded": isHighlighted,
          "dark:bg-dark-400 rounded bg-light-100": inAiMessage,
          "dark:bg-dark-800 bg-light-50": !inAiMessage,
        })}
      >
        <div
          className="grid overflow-auto"
          style={{
            height: `${Math.min(totalHeight, heights.max) + 5}px`,
          }}
        >
          <AgGridReact
            className="_ag-grid-artifact"
            theme={agTheme}
            domLayout="normal"
            headerHeight={heights.header}
            rowHeight={heights.row}
            rowData={rowData}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            suppressContextMenu={true}
            suppressFieldDotNotation={true}
            alwaysShowVerticalScroll={false}
            alwaysShowHorizontalScroll={true}
            suppressHorizontalScroll={false}
          />
        </div>
        <ArtifactActions
          copyTooltip="Copy table to clipboard"
          createTooltip="Create widget from table"
          copyTestId="copy-table-button"
          createTestId="create-widget-from-table-button"
          onCopy={() => {
            navigator.clipboard
              .writeText(
                artifact.content.map((row) => Object.values(row).join("\t")).join("\n"),
              )
              .then(() => toast.success("Table copied to clipboard"))
              .catch((err) =>
                toast.error("Failed to copy table to clipboard", {
                  description: err.message,
                }),
              );
          }}
          createWidgetParams={{
            widgetType: "table",
            content: artifact.content,
            metadata: {
              uuid: artifact.uuid,
              name: artifact.name,
              description: artifact.description,
            },
          }}
        />
      </div>
    );
  },
);

TableArtifact.displayName = "TableArtifact";
