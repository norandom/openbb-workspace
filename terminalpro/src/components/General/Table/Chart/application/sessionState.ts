import cloneDeep from "lodash/cloneDeep";
import { mapColumnEditorEvent } from "../compatibility/editorEvents";
import { reduceIntegratedState } from "../compatibility/integratedState";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { validateIntegratedInput } from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import type {
  AdvanceSessionStamp,
  ApplyColumnEdit,
  ApplyRangeTransition,
  SelectSessionBaseline,
  SessionResult,
  SessionStamp,
  ValidateSessionStamp,
} from "./types";

function invalid(message: string): SessionResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "invalid-session", path: [], message }],
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor?.enumerable || !("value" in descriptor))
      return undefined;
    result[key] = descriptor.value;
  }
  return result;
}

function parseStamp(value: unknown): SessionStamp | undefined {
  const data = record(value);
  const address = record(data?.address);
  if (
    !data ||
    !address ||
    typeof address.widgetId !== "string" ||
    typeof address.stateKey !== "string"
  )
    return undefined;
  if (address.stateAddress !== JSON.stringify([address.widgetId, address.stateKey]))
    return undefined;
  for (const key of ["generation", "dataRevision", "renderRevision"]) {
    const counter = data[key];
    if (
      typeof counter !== "number" ||
      !Number.isSafeInteger(counter) ||
      counter < (key === "generation" ? 1 : 0)
    )
      return undefined;
  }
  return {
    address: {
      widgetId: address.widgetId,
      stateKey: address.stateKey,
      stateAddress: address.stateAddress as string,
    },
    generation: data.generation as number,
    dataRevision: data.dataRevision as number,
    renderRevision: data.renderRevision as number,
  };
}

export const validateSessionStamp: ValidateSessionStamp = (stamp, currentStamp) => {
  try {
    const captured = parseStamp(stamp);
    const current = parseStamp(currentStamp);
    if (!captured || !current)
      return invalid("Session address or counters are invalid");
    if (
      captured.address.stateAddress !== current.address.stateAddress ||
      captured.generation !== current.generation ||
      captured.renderRevision !== current.renderRevision ||
      captured.dataRevision !== current.dataRevision
    )
      return { status: "stale" };
    return { status: "ready", stamp: current, value: captured };
  } catch {
    return invalid("Session stamp could not be safely inspected");
  }
};

export const advanceSessionStamp: AdvanceSessionStamp = (stamp, change) => {
  const checked = validateSessionStamp(stamp, stamp);
  if (checked.status !== "ready") return checked;
  const next = { ...checked.value };
  if (change === "generation") {
    next.generation += 1;
    next.dataRevision = 0;
    next.renderRevision = 0;
  } else if (change === "data" || change === "render") {
    next.renderRevision += 1;
    if (change === "data") next.dataRevision += 1;
  } else return invalid("Unknown session change");
  return validateSessionStamp(next, next);
};

export const selectSessionBaseline: SelectSessionBaseline = (input) => {
  const checked = validateSessionStamp(input.stamp, input.currentStamp);
  if (checked.status !== "ready") return checked;
  if (input.baseline.stateAddress !== checked.stamp.address.stateAddress)
    return invalid("Baseline address does not match the session");
  const result = selectOptionBaseline(input.baseline);
  return result.valid
    ? { status: "ready", stamp: checked.stamp, value: result.value }
    : invalid(result.error);
};

function isTooltipMode(event: unknown): boolean {
  const fields = record(event);
  return (
    !!fields &&
    Object.keys(fields).length === 2 &&
    fields.kind === "tooltip-mode" &&
    (fields.value === "single" ||
      fields.value === "shared" ||
      fields.value === "compact")
  );
}

export const applyColumnEdit: ApplyColumnEdit = (input) => {
  const checked = validateSessionStamp(input.command.stamp, input.currentStamp);
  if (checked.status !== "ready") return checked;
  try {
    const command = record(input.command);
    const chartType = command?.chartType;
    if (!command || (chartType !== "groupedColumn" && chartType !== "stackedColumn"))
      return invalid("Column command chartType must be groupedColumn or stackedColumn");
    // Only this exact valid event lacks reference behavior for the stacked family.
    if (chartType === "stackedColumn" && isTooltipMode(command.event))
      return {
        status: "unresolved",
        diagnostics: [
          {
            code: "unresolved-family",
            path: ["command", "chartType"],
            message: "tooltip-mode is unresolved for stackedColumn",
          },
        ],
      };
    const mapped = mapColumnEditorEvent({ chartType, event: command.event });
    if (!mapped.valid) return invalid(mapped.error);
    const reducerInput = {
      storage: input.storage,
      stateKey: checked.stamp.address.stateKey,
      currentModel: input.currentModel,
      resolvedOptions: input.resolvedOptions,
      eventOptions: mapped.value,
      chartType,
      totalSeries: input.totalSeries,
      isPivotMode: input.isPivotMode,
    };
    const validated = validateIntegratedInput(reducerInput);
    if (!validated.valid) return invalid(validated.error);
    return {
      status: "ready",
      stamp: checked.stamp,
      value: reduceIntegratedState(validated.value),
    };
  } catch {
    return invalid("Column command or event could not be safely inspected");
  }
};

export const applyRangeTransition: ApplyRangeTransition = (input) => {
  const checked = validateSessionStamp(input.stamp, input.currentStamp);
  if (checked.status !== "ready") return checked;
  const stateKey = checked.stamp.address.stateKey;
  const partition = input.storage[stateKey] as Record<string, unknown> | undefined;
  const family = partition?.[input.chartType] as Record<string, unknown> | undefined;
  // Original JSON is provenance; persisted selection uses the resolved IDs and bounds.
  const original = record(input.range.originalRange);
  if (!original) return invalid("Range JSON must be an object");
  const cellRange: Record<string, unknown> = {
    ...cloneDeep(original),
    columns: [...input.range.columnIds],
  };
  if (input.range.rowStartIndex !== undefined)
    cellRange.rowStartIndex = input.range.rowStartIndex;
  if (input.range.rowEndIndex !== undefined)
    cellRange.rowEndIndex = input.range.rowEndIndex;
  const value = {
    ...input.storage,
    [stateKey]: { ...partition, [input.chartType]: { ...family, cellRange } },
  } as ChartStorageOutput;
  return { status: "ready", stamp: checked.stamp, value };
};
