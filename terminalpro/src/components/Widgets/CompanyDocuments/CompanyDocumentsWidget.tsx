import { useState } from "react";
import DraggableCard from "~/components/DraggableCard";
import { useWidgetContext } from "~/components/Widget.context";
import { documentChoices } from "~/lib/utils/documentTemplateState";
import CompanyDocuments from "./CompanyDocuments";
import { useCompanyDocuments } from "./useCompanyDocuments";

function DocumentControls() {
  const { widget, updateWidget } = useWidgetContext();
  const [draft, setDraft] = useState<Record<string, string | number>>(() => ({
    ...Object.fromEntries(
      (widget.params ?? []).map((p) => [p.paramName, p.value ?? ""]),
    ),
    ...widget.storage?.params,
  }));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        updateWidget?.((previous) => ({
          ...previous,
          storage: {
            params: documentChoices({ ...previous, storage: { params: draft } }),
          },
        }));
      }}
    >
      <fieldset className="flex flex-wrap gap-3" aria-label="Document query">
        {(widget.params ?? [])
          .filter((p) => p.show !== false && p.paramName !== "provider")
          .map((param) => {
            const value = draft[param.paramName] ?? "";
            return (
              <label key={param.paramName}>
                {param.label ?? param.paramName}
                <input
                  aria-label={param.label ?? param.paramName}
                  type={
                    param.type === "number"
                      ? "number"
                      : param.type === "date"
                        ? "date"
                        : "text"
                  }
                  step={param.type === "number" ? 1 : undefined}
                  value={String(value)}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      [param.paramName]: event.target.value,
                    }))
                  }
                />
              </label>
            );
          })}
      </fieldset>
      <button type="submit">Apply query</button>
    </form>
  );
}

export default function CompanyDocumentsWidget() {
  const { widget } = useWidgetContext();
  const query = useCompanyDocuments();
  const status =
    query.validationError ??
    (query.isError
      ? query.rows.length
        ? "Stale documents: refresh failed. Retry to update this evidence."
        : "Document acquisition failed. Retry to recover."
      : query.isFetching
        ? "Loading documents…"
        : null);
  return (
    <DraggableCard title={widget.name}>
      <section className="p-3 space-y-3 min-w-0 overflow-auto">
        <DocumentControls key={JSON.stringify(widget.storage?.params)} />
        <button
          type="button"
          disabled={!!query.validationError || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh documents
        </button>
        {status && (
          <p role={query.isError || query.validationError ? "alert" : "status"}>
            {status}
          </p>
        )}
        <CompanyDocuments
          kind={query.kind}
          rows={query.rows}
          contextKey={query.contextKey}
          provider="FMP"
        />
      </section>
    </DraggableCard>
  );
}
