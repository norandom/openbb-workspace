import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEvidenceLifecycle } from "../../src/lib/companyResearch/useEvidenceLifecycle";
const response = { results: [{ amount: -2 }, { amount: -2 }] };
const success = {
  data: response as unknown,
  dataUpdatedAt: 10,
  error: null as unknown,
  errorUpdatedAt: 0,
  isFetching: false,
  responseContextKey: "A",
};
describe("context-bound table evidence", () => {
  it("keeps provider acquisition time distinct from cache and failure clocks", () => {
    const acquiredAt = "2026-11-01T12:00:00Z";
    const envelope = {
      ...response,
      extra: {
        results_metadata: {
          __qopenbb_financial__: {
            schema_version: 1,
            dataset: "income",
            provider: "fmp",
            retrieved_at: acquiredAt,
            source: {},
            bounds: { returned_count: 2 },
          },
        },
      },
    };
    const { result, rerender } = renderHook(
      ({ query }) => useEvidenceLifecycle("A", true, query),
      {
        initialProps: { query: { ...success, data: envelope as unknown } },
      },
    );
    expect(result.current.evidence?.acquiredAt).toBe(acquiredAt);
    rerender({ query: { ...success, data: undefined, isFetching: true } });
    expect(result.current.status).toBe("refreshing");
    expect(result.current.evidence?.acquiredAt).toBe(acquiredAt);
    rerender({
      query: {
        ...success,
        data: undefined,
        error: new Error("offline"),
        errorUpdatedAt: 500,
      },
    });
    expect(result.current.evidence?.acquiredAt).toBe(acquiredAt);
    expect("failedAt" in result.current && result.current.failedAt).toBe(
      new Date(500).toISOString(),
    );
  });
  it("clears immediately and ignores tagged late previous responses", () => {
    const { result, rerender } = renderHook(
      ({ key, query }) => useEvidenceLifecycle(key, true, query),
      { initialProps: { key: "A", query: success } },
    );
    expect(result.current.evidence?.originalResponse).toBe(response);
    rerender({ key: "B", query: success });
    expect(result.current.evidence).toBeNull();
    rerender({ key: "B", query: { ...success, responseContextKey: "B" } });
    expect(result.current.evidence?.contextKey).toBe("B");
  });
  it("retains only same-context successful evidence on failed refresh", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useEvidenceLifecycle("A", true, query),
      { initialProps: { query: success } },
    );
    rerender({
      query: {
        ...success,
        data: undefined,
        error: new Error("offline"),
        errorUpdatedAt: 100,
      },
    });
    expect(result.current.status).toBe("stale");
    expect(result.current.evidence?.originalRows).toEqual(response.results);
    expect(result.current.evidence?.acquiredAt).toBeNull();
    expect("failedAt" in result.current && result.current.failedAt).toBe(
      new Date(100).toISOString(),
    );
  });
  it("blocks evidence on disabled identity and leaves initial failures empty", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useEvidenceLifecycle("A", enabled, success),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    expect(result.current.evidence).toBeNull();
    const failed = renderHook(() =>
      useEvidenceLifecycle("X", true, {
        ...success,
        data: undefined,
        error: new Error("failed"),
        errorUpdatedAt: 100,
        responseContextKey: "X",
      }),
    );
    expect(failed.result.current.status).toBe("error");
    expect(failed.result.current.evidence).toBeNull();
  });
});
