import { useId, useState } from "react";
import type { SankeySetupPanelProps } from "../../application/sankeyTypes";
import { SankeyMetadataFields } from "./SankeyMetadataFields";
import "../setup/chartSetupPanel.css";
import "../titles/chartTitlesPanel.css";

const mappings = [
  ["sourceColumnId", "Source"],
  ["targetColumnId", "Target"],
  ["valueColumnId", "Value"],
] as const;
const UNKNOWN_SCOPE =
  "Units or allocation scope unspecified; numerical balance is not financial reconciliation";

export function SankeySetupPanel(props: SankeySetupPanelProps) {
  const { columns, selection, diagnostics, onEdit } = props;
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const m = selection.metadata;
  const unknown =
    (["unit", "scale", "period", "measure"] as const).some(
      (field) => m[field] === null && !selection.metadataColumnIds[field],
    ) ||
    (m.unit === "currency" &&
      m.currency === null &&
      !selection.metadataColumnIds.currency);
  return (
    <div className="chart-setup-panel">
      <section className="chart-setup-group" aria-label="Flow mappings">
        <div className="chart-setup-content">
          {mappings.map(([field, label]) => {
            const selected = selection[field] ?? "";
            const choices = columns.filter(
              (column) => field !== "valueColumnId" || column.role === "number",
            );
            return (
              <label key={field} className="chart-caption-row">
                <span>{label}</span>
                <select
                  aria-label={label}
                  value={selected}
                  onChange={(event) =>
                    onEdit({
                      kind: "mapping",
                      field,
                      value: event.target.value || null,
                    })
                  }
                >
                  <option value="">Select a column</option>
                  {selected && !choices.some((column) => column.id === selected) && (
                    <option value={selected}>Unavailable column: {selected}</option>
                  )}
                  {choices.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <p>Duplicate source/target links use Sum.</p>
        </div>
      </section>
      {unknown && !diagnostics.some((d) => d.message === UNKNOWN_SCOPE) && (
        <p role="status">{UNKNOWN_SCOPE}</p>
      )}
      {diagnostics.map((diagnostic, index) => (
        <p
          key={`${diagnostic.code}-${index}`}
          role={diagnostic.severity === "error" ? "alert" : "status"}
        >
          {diagnostic.message}
          {diagnostic.rowIds.length > 0 && ` Rows: ${diagnostic.rowIds.join(", ")}.`}
        </p>
      ))}
      <section className="chart-setup-group">
        <button
          type="button"
          className="chart-setup-heading"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          <span aria-hidden="true">{expanded ? "⌄" : "›"}</span>Metadata
        </button>
        {expanded && (
          <div id={id}>
            <SankeyMetadataFields {...props} />
          </div>
        )}
      </section>
    </div>
  );
}
