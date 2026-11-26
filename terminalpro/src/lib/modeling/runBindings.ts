import { useEffect, useRef, useState } from "react";
import { FCF_OUTPUT, savedSelection, type SavedSelection } from "./contract";
import type { EvaluationClient, FcfParameters } from "./evaluationClient";

type NativeParams = Record<string, unknown>;
type ParameterKey = keyof FcfParameters | "run_id" | "output_id" | "expected_run_id";

export function parameter(params: NativeParams, name: ParameterKey, fallback = "") {
  const value = params[name];
  return typeof value === "string" ? value : fallback;
}

export function selectSavedOutput(params: NativeParams, evaluate: boolean) {
  const result = savedSelection.safeParse({
    run_id: parameter(params, "run_id").trim(),
    output_id: evaluate ? FCF_OUTPUT : parameter(params, "output_id"),
    expected_run_id: evaluate
      ? undefined
      : parameter(params, "expected_run_id").trim() || undefined,
  });
  return result.success ? result.data : undefined;
}

export function updateModelParameter(
  params: NativeParams,
  name: ParameterKey,
  value: string,
) {
  // An edit invalidates the saved binding without discarding the historical run ID.
  return { ...params, [name]: value, ...(name !== "run_id" && { evaluated: "" }) };
}

export function bindEvaluation(
  params: NativeParams,
  submitted: FcfParameters,
  runId: string,
) {
  const matches = Object.entries(submitted).every(
    ([key, value]) => params[key] === value,
  );
  return { ...params, run_id: runId, evaluated: matches ? runId : "" };
}

type Result = Awaited<ReturnType<EvaluationClient["read"]>>;
type Reading = {
  key: string;
  result?: Result;
  error?: string;
  pending: boolean;
};

export function useSavedOutput(
  client: EvaluationClient,
  selection: SavedSelection | undefined,
  refresh: number,
  sessionId: string | undefined,
) {
  const { run_id, output_id, expected_run_id } = selection ?? {};
  const key = JSON.stringify([sessionId, run_id, output_id, expected_run_id]);
  const [reading, setReading] = useState<Reading>();
  useEffect(() => {
    if (!run_id || !output_id || !sessionId) return;
    const controller = new AbortController();
    setReading((previous) => ({
      key,
      pending: true,
      result: previous?.key === key ? previous.result : undefined,
    }));
    client
      .read(
        { run_id, output_id, ...(expected_run_id && { expected_run_id }) },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setReading({ key, result, pending: false });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          setReading((previous) => ({
            ...previous,
            key,
            error: error.message,
            pending: false,
          }));
        }
      });
    return () => controller.abort();
  }, [client, key, run_id, output_id, expected_run_id, refresh, sessionId]);
  return reading?.key === key ? reading : undefined;
}

export function useExplicitEvaluation(
  client: EvaluationClient,
  bind: (submitted: FcfParameters, runId: string) => void,
  sessionId: string | undefined,
) {
  const active = useRef<AbortController>();
  const [state, setState] = useState<{ pending: boolean; error?: string }>({
    pending: false,
  });

  useEffect(() => {
    setState({ pending: false });
    return () => {
      active.current?.abort();
      active.current = undefined;
    };
  }, [sessionId]);

  async function evaluate(params: FcfParameters) {
    if (active.current || !sessionId) return;
    const controller = new AbortController();
    active.current = controller;
    setState({ pending: true });
    try {
      const run = await client.evaluate(params, sessionId, controller.signal);
      if (!controller.signal.aborted) bind(params, run.run_id);
    } catch (error) {
      if (!controller.signal.aborted)
        setState({ pending: false, error: (error as Error).message });
      return;
    } finally {
      if (active.current === controller) active.current = undefined;
    }
    if (!controller.signal.aborted) setState({ pending: false });
  }

  return { ...state, evaluate };
}
