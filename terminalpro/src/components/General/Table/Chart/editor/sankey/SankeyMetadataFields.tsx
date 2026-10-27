import type { SankeySetupPanelProps } from "../../application/sankeyTypes";
import type { SankeyMetadataKey } from "../../compatibility/sankeyContracts";

const fields: readonly [SankeyMetadataKey, string][] = [
  ["unit", "Unit"],
  ["currency", "Currency"],
  ["scale", "Scale"],
  ["period", "Period"],
  ["measure", "Measure"],
];

export function SankeyMetadataFields({
  columns,
  selection,
  onEdit,
}: Omit<SankeySetupPanelProps, "diagnostics">) {
  return (
    <div className="chart-setup-content">
      <p>Declare the common allocation scope. Scale is base units per stored amount.</p>
      <p>
        Blank bound cells remain unknown; conflicting declarations or row values require
        correction.
      </p>
      {fields.map(([field, label]) => {
        const binding = selection.metadataColumnIds[field] ?? "";
        const choices = columns.filter(
          (column) => column.role === (field === "scale" ? "number" : "category"),
        );
        return (
          <div key={field} className="chart-caption-fields">
            <label className="chart-caption-row">
              <span>{label}</span>
              <input
                aria-label={label}
                type={field === "scale" ? "number" : "text"}
                step={field === "scale" ? "any" : undefined}
                placeholder="Unknown"
                value={selection.metadata[field] ?? ""}
                onChange={(event) =>
                  onEdit({
                    kind: "metadata",
                    field,
                    value:
                      event.target.value === ""
                        ? null
                        : field === "scale"
                          ? event.target.valueAsNumber
                          : event.target.value,
                  })
                }
              />
            </label>
            <label className="chart-caption-row">
              <span>{label} column</span>
              <select
                aria-label={`${label} column`}
                value={binding}
                onChange={(event) =>
                  onEdit({
                    kind: "metadata-column",
                    field,
                    value: event.target.value || null,
                  })
                }
              >
                <option value="">No column binding</option>
                {binding && !choices.some((column) => column.id === binding) && (
                  <option value={binding}>Unavailable column: {binding}</option>
                )}
                {choices.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      })}
    </div>
  );
}
