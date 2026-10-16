import type { ChartModel, RuntimeOptions } from "./legacyTypes";
import type { OptionBaseline, SelectOptionBaseline } from "./optionStateTypes";

type Data = Record<string, unknown>;

function fields(value: unknown, path: string): Data {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must be a plain object`);
  }
  const result: Data = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error(`${path} must contain enumerable data properties`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function copy(
  value: unknown,
  path: string,
  runtime: boolean,
  ancestors = new Set<object>(),
): unknown {
  if (value === undefined && runtime) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null)
    throw new Error(`${path} has an invalid value`);
  if (ancestors.has(value)) throw new Error(`${path} contains a cycle`);
  ancestors.add(value);
  const result = Array.isArray(value)
    ? copyArray(value, path, runtime, ancestors)
    : copyObject(value, path, runtime, ancestors);
  ancestors.delete(value);
  return result;
}

function copyArray(
  value: unknown[],
  path: string,
  runtime: boolean,
  ancestors: Set<object>,
): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype)
    throw new Error(`${path} must be a plain array`);
  const result: unknown[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error(`${path} must contain data properties`);
    }
    Object.defineProperty(result, key, {
      value: copy(descriptor.value, `${path}.${key}`, runtime, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  result.length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  return result;
}

function copyObject(
  value: object,
  path: string,
  runtime: boolean,
  ancestors: Set<object>,
): Data {
  const result: Data = {};
  for (const [key, item] of Object.entries(fields(value, path))) {
    Object.defineProperty(result, key, {
      value: copy(item, `${path}.${key}`, runtime, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function options(value: unknown, path: string): RuntimeOptions {
  fields(value, path);
  return copy(value, path, true) as RuntimeOptions;
}

function model(value: unknown, path: string): ChartModel {
  const data = fields(value, path);
  const result: Data = {};
  const ancestors = new Set<object>([value as object]);
  for (const [key, item] of Object.entries(data)) {
    let copied: unknown;
    if (key === "chartOptions") {
      copied = item == null ? item : options(item, `${path}.chartOptions`);
    } else {
      if (key === "chartType" && item !== null && typeof item !== "string") {
        throw new Error(`${path}.chartType must be a string or null`);
      }
      copied = copy(item, `${path}.${key}`, false, ancestors);
    }
    Object.defineProperty(result, key, {
      value: copied,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result as ChartModel;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value;
}

function previousBaseline(value: unknown): OptionBaseline {
  const data = fields(value, "previous");
  return {
    stateAddress: text(data.stateAddress, "previous.stateAddress"),
    model: model(data.model, "previous.model"),
    options: options(data.options, "previous.options"),
    chartType: text(data.chartType, "previous.chartType"),
  };
}

function transition(data: Data): OptionBaseline {
  const stateAddress = text(data.stateAddress, "stateAddress");
  const partition =
    data.partitionModel == null
      ? undefined
      : model(data.partitionModel, "partitionModel");
  if (data.kind === "initialize") {
    const root =
      data.rootModel == null ? undefined : model(data.rootModel, "rootModel");
    const fallback =
      data.rootOptions == null ? undefined : options(data.rootOptions, "rootOptions");
    return {
      stateAddress,
      model: partition ?? root ?? {},
      options: options(partition?.chartOptions ?? fallback ?? {}, "selectedOptions"),
      chartType: text(data.initialChartType, "initialChartType"),
    };
  }
  if (data.kind !== "synchronize")
    throw new Error("kind must be initialize or synchronize");
  const previous = previousBaseline(data.previous);
  const populated = partition !== undefined && Object.keys(partition).length > 0;
  const chartType = partition?.chartType;
  return {
    stateAddress,
    model: populated ? partition : previous.model,
    options: populated
      ? options(partition.chartOptions ?? {}, "selectedOptions")
      : previous.options,
    chartType:
      typeof chartType === "string" && chartType.length > 0
        ? chartType
        : previous.chartType,
  };
}

function errorMessage(error: unknown): string {
  try {
    if (error !== null && typeof error === "object") {
      const descriptor = Object.getOwnPropertyDescriptor(error, "message");
      if (descriptor && "value" in descriptor && typeof descriptor.value === "string")
        return descriptor.value;
    }
  } catch {
    // Inspection itself can throw a hostile value; errors must stay data-only.
  }
  return "Unable to inspect baseline input";
}

export const selectOptionBaseline: SelectOptionBaseline = (input) => {
  try {
    return { valid: true, value: transition(fields(input, "input")) };
  } catch (error) {
    return {
      valid: false,
      error: errorMessage(error),
    };
  }
};
