import { useRef } from "react";
import {
  type EvidenceLifecycle,
  type FinancialEvidence,
  parseFinancialEvidence,
} from "./financialEnvelope";

export type EvidenceQuerySnapshot = {
  data: unknown;
  responseContextKey: string;
  dataUpdatedAt: number;
  error: unknown;
  errorUpdatedAt: number;
  isFetching: boolean;
};

// Evidence is observer-local; widget storage remains the sole persisted choice owner.
export function useEvidenceLifecycle(
  contextKey: string,
  enabled: boolean,
  query: EvidenceQuerySnapshot,
): EvidenceLifecycle {
  const retained = useRef<{
    key: string;
    updatedAt: number;
    data: unknown;
    evidence: FinancialEvidence;
  } | null>(null);
  if (!enabled || retained.current?.key !== contextKey) retained.current = null;
  if (!enabled) return { status: "idle", contextKey, evidence: null };
  const current = query.responseContextKey === contextKey;
  if (
    current &&
    query.data !== undefined &&
    query.dataUpdatedAt > 0 &&
    (retained.current?.data !== query.data ||
      retained.current?.updatedAt !== query.dataUpdatedAt)
  ) {
    retained.current = {
      key: contextKey,
      data: query.data,
      updatedAt: query.dataUpdatedAt,
      evidence: parseFinancialEvidence(contextKey, query.data),
    };
  }
  const evidence = retained.current?.evidence ?? null;
  if (current && query.error && !query.isFetching) {
    const failedAt = new Date(query.errorUpdatedAt).toISOString();
    return evidence
      ? { status: "stale", contextKey, evidence, failedAt, error: query.error }
      : { status: "error", contextKey, evidence: null, failedAt, error: query.error };
  }
  if (evidence)
    return {
      status: query.isFetching ? "refreshing" : "success",
      contextKey,
      evidence,
    };
  return { status: "loading", contextKey, evidence: null };
}
