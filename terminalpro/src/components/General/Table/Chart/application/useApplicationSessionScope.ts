import type { ApplicationChartFamily } from "./comboSessionTypes";
import { useLayoutEffect, useRef, useState } from "react";
import type { WidgetTransactionAdapter } from "../../../../widgetSync/transactions";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import {
  initialApplicationSession,
  nextSessionStamp,
  sessionAppearanceKey,
  sessionDataKey,
  synchronizeApplicationSession,
} from "./applicationSessionRuntime";
import { captureApplicationSession } from "./applicationSessionCapture";
import { validateSessionStamp } from "./sessionState";
import { latestWidgetRangeInputs } from "./applicationSessionRange";

function scopeValue(
  owner: WidgetTransactionAdapter,
  token: symbol | undefined,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
): ApplicationSessionState | undefined {
  if (!token || owner.scope?.token !== token) return;
  const value = owner.scope.value as ApplicationSessionState;
  if (
    value.local.stamp.address.stateAddress !== inputs.address.stateAddress ||
    (value.local.baseline.chartType !== inputs.family &&
      value.sourceFamily !== inputs.family)
  )
    return;
  return value;
}
function useScopeSynchronization(
  owner: WidgetTransactionAdapter,
  token: symbol | undefined,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
) {
  const dataKey = sessionDataKey(inputs);
  const appearanceKey = sessionAppearanceKey(inputs);
  useLayoutEffect(() => {
    if (!token) return;
    owner.transact(token, (widget, value: ApplicationSessionState) => {
      try {
        return {
          widget,
          value: synchronizeApplicationSession(
            widget.storage as ChartStorageOutput,
            latestWidgetRangeInputs(inputs, widget),
            value,
          ),
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid chart state";
        return {
          widget,
          value:
            value.error === message
              ? value
              : { ...value, capture: undefined, error: message },
        };
      }
    });
  }, [
    token,
    owner.transact,
    owner.widget.storage,
    dataKey,
    appearanceKey,
    inputs.family,
  ]);
}
function useScopeCapture(
  owner: WidgetTransactionAdapter,
  token: symbol | undefined,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState | undefined,
) {
  useLayoutEffect(() => {
    if (
      !token ||
      !state ||
      state.capture ||
      state.error ||
      state.dataKey !== sessionDataKey(inputs)
    )
      return;
    const captured = captureApplicationSession(inputs, state);
    if (captured.status === "waiting") return;
    owner.transact(token, (widget, value: ApplicationSessionState) => {
      if (
        validateSessionStamp(state.local.stamp, value.local.stamp).status !==
        "ready"
      )
        return { widget, value };
      return {
        widget,
        value:
          captured.status === "ready"
            ? { ...value, capture: captured.value, error: undefined }
            : {
                ...value,
                error:
                  "diagnostics" in captured
                    ? captured.diagnostics[0].message
                    : "Stale grid capture",
              },
      };
    });
  }, [
    token,
    owner.transact,
    inputs.api,
    state?.local.stamp,
    state?.capture,
    state?.dataKey,
  ]);
}

function useDisplayRefresh(
  owner: WidgetTransactionAdapter,
  token: symbol | undefined,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
) {
  const previous = useRef(inputs.display);
  useLayoutEffect(() => {
    if (previous.current === inputs.display) return;
    previous.current = inputs.display;
    if (!token) return;
    owner.transact(token, (widget, value: ApplicationSessionState) => ({
      widget,
      value: {
        ...value,
        local: {
          ...value.local,
          stamp: nextSessionStamp(value.local.stamp, "render"),
        },
      },
    }));
  }, [inputs.display, token, owner.transact]);
}
export function useApplicationSessionScope(
  owner: WidgetTransactionAdapter,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
) {
  const [token, setToken] = useState<symbol>();
  const generation = useRef(0);
  useLayoutEffect(() => {
    const identity = Symbol("application-chart-session");
    const nextGeneration = ++generation.current;
    setToken(identity);
    owner.register(identity, (widget) =>
      initialApplicationSession(
        widget.storage as ChartStorageOutput,
        latestWidgetRangeInputs(inputs, widget),
        nextGeneration,
      ),
    );
    return () => owner.release(identity);
  }, [owner.register, owner.release, inputs.address.stateAddress, inputs.api]);
  const state = scopeValue(owner, token, inputs);
  useScopeSynchronization(owner, token, inputs);
  useScopeCapture(owner, token, inputs, state);
  useDisplayRefresh(owner, token, inputs);
  return { token, state };
}
