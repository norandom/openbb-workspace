import { useState } from "react";
import DraggableCard from "~/components/DraggableCard";
import { Button } from "~/components/ds/atoms/Button";
import { Input } from "~/components/ds/atoms/Input";
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
      <fieldset className="flex flex-wrap items-end gap-3" aria-label="Document query">
        {(widget.params ?? [])
          .filter((p) => p.show !== false && p.paramName !== "provider")
          .map((param) => {
            const name = param.label ?? param.paramName;
            return (
              // Design-system field: visible associated label, bordered input, no clear button
              // so keyboard order stays one stop per query parameter.
              <Input
                key={param.paramName}
                className="w-36"
                size="sm"
                clearable={false}
                label={name}
                aria-label={name}
                type={
                  param.type === "number"
                    ? "number"
                    : param.type === "date"
                      ? "date"
                      : "text"
                }
                step={param.type === "number" ? 1 : undefined}
                value={String(draft[param.paramName] ?? "")}
                onChange={(value) =>
                  setDraft((previous) => ({ ...previous, [param.paramName]: value }))
                }
              />
            );
          })}
        <Button type="submit" size="sm">
          Apply query
        </Button>
      </fieldset>
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
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!!query.validationError || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh documents
        </Button>
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
