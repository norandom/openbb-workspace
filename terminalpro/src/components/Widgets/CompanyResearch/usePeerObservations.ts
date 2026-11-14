import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useJsonData } from "~/lib/api";
import {
  type CompanyResearchConfig,
  decodeResearchConfig,
  type ResearchPeer,
  researchListingKey,
} from "~/lib/companyResearch/config";
import { useEvidenceLifecycle } from "~/lib/companyResearch/useEvidenceLifecycle";
import type { CompanyRequestContext } from "../../General/Table/NavBar/companySelection.contract";

export type PeerObservationsProps = {
  config: CompanyResearchConfig;
  source: CompanyRequestContext | null;
};
export type PeerDataset = "metrics" | "ratios";
export type PeerJob = {
  id: string;
  peer: ResearchPeer;
  dataset: PeerDataset;
  url: string;
};

export function peerEndpoint(source: CompanyRequestContext | null): string | null {
  if (
    !source ||
    (source.requestInit.method ?? "GET").toUpperCase() !== "GET" ||
    source.requestInit.body != null
  )
    return null;
  try {
    const url = new URL(source.searchEndpoint);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith("/equity/search")
    )
      return null;
    return `${url.href.slice(0, -"search".length)}fundamental/`;
  } catch {
    return null;
  }
}

// This private comparison includes credentials but never enters cache keys or rendered text.
export function peerContext(props: PeerObservationsProps): string {
  return JSON.stringify([
    props.config.period,
    props.config.limit,
    props.source && {
      ...props.source,
      requestInit: {
        ...props.source.requestInit,
        headers: Array.from(
          new Headers(props.source.requestInit.headers).entries(),
        ).sort(),
      },
    },
  ]);
}

export function usePeerObservations({ config, source }: PeerObservationsProps) {
  const endpoint = peerEndpoint(source);
  const jobs = useMemo(
    () =>
      !endpoint || decodeResearchConfig(config).kind !== "valid"
        ? []
        : config.peers
            .filter((peer) => peer.identity.sourceKey === source?.sourceKey)
            .flatMap((peer) =>
              (["metrics", "ratios"] as const).map((dataset) => ({
                id: JSON.stringify([
                  researchListingKey(peer.identity),
                  peer.identity.exchange,
                  peer.identity.exchangeShortName,
                  peer.identity.listingId,
                  peer.identity.issuerId,
                  peer.identity.currency,
                  dataset,
                ]),
                peer,
                dataset,
                url: endpoint + dataset,
              })),
            ),
    [config, source?.sourceKey, endpoint],
  );
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());
  const [refresh, setRefresh] = useState(0);
  const order = useRef<readonly string[]>([]);
  const ids = new Set(jobs.map((job) => job.id));
  // Membership edits remove only their own work; reordering never evicts an admitted request.
  order.current = [
    ...order.current.filter((id) => ids.has(id)),
    ...jobs.map((job) => job.id).filter((id) => !order.current.includes(id)),
  ];
  useEffect(() => {
    const currentIds = new Set(jobs.map((job) => job.id));
    setCompleted((previous) => {
      const next = new Set([...previous].filter((id) => currentIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [jobs]);
  const active = order.current.filter((id) => !completed.has(id)).slice(0, 2);
  const settle = useCallback(
    (id: string) => setCompleted((previous) => new Set([...previous, id])),
    [],
  );
  const reload = () => {
    if (active.length) return;
    setCompleted(new Set());
    setRefresh((value) => value + 1);
  };
  return { jobs, active, settle, reload, refresh, busy: active.length > 0 };
}

export function usePeerDataset(
  job: PeerJob,
  props: PeerObservationsProps,
  active: boolean,
  refresh: number,
  settle: (id: string) => void,
) {
  const client = useQueryClient();
  const observer = useId();
  const queryKey = useMemo(
    () => ["peer-observation", observer, job.id],
    [observer, job.id],
  );
  const contextKey = JSON.stringify(queryKey);
  const headers = Object.fromEntries(
    new Headers(props.source?.requestInit.headers).entries(),
  );
  const query = useJsonData<unknown>(
    {
      url: job.url,
      endpointHeaders: headers,
      queryKey,
      ignoreRefresh: true,
      params: {
        symbol: job.peer.identity.symbol,
        provider: job.peer.identity.provider,
        period: props.config.period,
        limit: props.config.limit,
        ttm: "exclude",
      },
    },
    {
      enabled: false,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      gcTime: 0,
    },
  );
  useEffect(() => {
    if (!active) return;
    let current = true;
    const adapter = client.getQueryCache().find({ queryKey, exact: true });
    // The disabled observer installs the authenticated adapter before effects run.
    if (!adapter?.options.queryFn) throw new Error("Peer adapter query is unavailable");
    void client
      .fetchQuery({ ...adapter.options, queryKey, staleTime: 0 })
      .catch(() => {})
      .finally(() => {
        if (current) settle(job.id);
      });
    return () => {
      current = false;
      void client.cancelQueries({ queryKey, exact: true });
    };
  }, [active, refresh, client, queryKey, job.id, settle]);
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey, exact: true });
    },
    [client, queryKey],
  );
  return useEvidenceLifecycle(contextKey, true, {
    ...query,
    responseContextKey: contextKey,
  });
}
