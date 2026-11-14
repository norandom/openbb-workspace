import { useMemo, useState } from "react";
import DraggableCard from "~/components/DraggableCard";
import { createCompanyRequestContext } from "~/components/General/Table/NavBar/companySearch";
import {
  type CompanyRequestContext,
  createSourceKey,
} from "~/components/General/Table/NavBar/companySelection.contract";
import type { WidgetT } from "~/components/types";
import { useWidgetContext } from "~/components/Widget.context";
import {
  type CompanyResearchConfig,
  companyResearchConfigSchema,
  decodeResearchConfig,
} from "~/lib/companyResearch/config";
import { type Source, useBackendConnectorStore } from "~/lib/state/backendConnector";
import { createURLString, createWidgetEndpoint } from "~/lib/utils/widgetParams";
import { PeerEditor } from "./PeerEditor";
import { PeerObservations } from "./PeerObservations";

function researchSource(source: Source | undefined): CompanyRequestContext | null {
  if (!source) return null;
  const declaration = source.widgets?.equity_search_fmp_obb;
  const endpoint = "/api/v1/equity/search";
  const sourceKey = createSourceKey(source.id, source.url);
  if (!sourceKey || declaration?.endpoint !== endpoint) return null;
  // Query-based credentials cannot be propagated by the peer observation contract.
  if (source.endpointHeaders?.some((header) => header.location === "query"))
    return null;
  const transient = {
    ...declaration,
    endpoint: createWidgetEndpoint(
      createURLString(declaration.endpoint, source.url),
      source.endpointHeaders ?? [],
    ),
  } as WidgetT;
  return createCompanyRequestContext(
    transient,
    { widgetId: "equity_search_fmp_obb", endpoint, multiple: false },
    sourceKey,
  );
}

type ControlsProps = {
  config: CompanyResearchConfig;
  onChange: (config: CompanyResearchConfig) => void;
};
function ResearchControls({ config, onChange }: ControlsProps) {
  const [error, setError] = useState<string | null>(null);
  function change(next: CompanyResearchConfig) {
    const parsed = companyResearchConfigSchema.safeParse(next);
    if (!parsed.success) {
      setError("Choose an annual or quarterly period and a limit from 1 to 20.");
      return;
    }
    try {
      onChange(parsed.data);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Research configuration could not be saved.",
      );
    }
  }
  return (
    <section aria-label="Peer research controls" className="flex flex-wrap gap-3">
      <label>
        Peer period{" "}
        <select
          aria-label="Peer period"
          value={config.period}
          onChange={(event) =>
            change({
              ...config,
              period: event.target.value as CompanyResearchConfig["period"],
            })
          }
        >
          <option value="annual">Annual</option>
          <option value="quarter">Quarterly</option>
        </select>
      </label>
      <label>
        Peer observation limit{" "}
        <input
          aria-label="Peer observation limit"
          type="number"
          min={1}
          max={20}
          step={1}
          value={config.limit}
          onChange={(event) => change({ ...config, limit: Number(event.target.value) })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function PeerResearch() {
  const { widget, updateWidget } = useWidgetContext();
  const connector = useBackendConnectorStore((state) =>
    state.apiSources.find((source) => source.id === widget.sourceId),
  );
  const source = useMemo(() => researchSource(connector), [connector]);
  const resolution = useMemo(
    () => decodeResearchConfig(widget.storage?.companyResearch),
    [widget.storage?.companyResearch],
  );
  function save(config: CompanyResearchConfig) {
    const validated = companyResearchConfigSchema.parse(config);
    if (!updateWidget)
      throw new Error("Research configuration cannot be saved in this view.");
    updateWidget((previous) => ({
      ...previous,
      storage: { ...previous.storage, companyResearch: validated },
    }));
  }
  return (
    <DraggableCard title={widget.name}>
      <div className="p-3 space-y-4 min-w-0 overflow-auto">
        {resolution.kind === "unresolved" ? (
          <p role="alert">
            {resolution.reason} The original saved configuration is retained; no default
            company or peers have been substituted.
          </p>
        ) : (
          <>
            <ResearchControls config={resolution.config} onChange={save} />
            <PeerEditor config={resolution.config} source={source} onChange={save} />
            <PeerObservations config={resolution.config} source={source} />
          </>
        )}
      </div>
    </DraggableCard>
  );
}
