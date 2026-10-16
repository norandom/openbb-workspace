/** Serialized unknown fields remain JSON; runtime event options also preserve undefined. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export type RuntimeOptionValue = undefined | null | boolean | number | string | RuntimeOptionValue[] | RuntimeOptions;
export interface RuntimeOptions { [key: string]: RuntimeOptionValue }

export interface IntegratedStateInput {
  readonly storage: ChartStorageOutput;
  /** Already resolved by the original state-key helper; collisions retain source write ordering. */
  readonly stateKey: string;
  readonly currentModel?: ChartModel;
  readonly resolvedOptions: RuntimeOptions;
  /** Only undefined defaults to {}; nested null and undefined retain lodash merge semantics. */
  readonly eventOptions?: RuntimeOptions;
  readonly chartType: string;
  readonly totalSeries: number;
  readonly isPivotMode: boolean;
}
export interface DetachedStateInput {
  readonly storage: ChartStorageOutput;
  readonly eventOptions?: RuntimeOptions;
  readonly chartType: string;
  readonly totalSeries: number;
}

// Runtime outputs may contain an own undefined options property (detached callback).
// They are not a new persisted envelope; serialization remains the caller's responsibility.
declare const runtimeStorage: unique symbol;
declare const runtimeModel: unique symbol;
/** Type-only proof of the narrow runtime option slots; no symbol is added to storage.
 * Reducers construct source-equivalent storage and assert this type at their return boundary.
 * Untrusted inputs must pass validation before receiving this proof. */
export type ChartStorageOutput = JsonObject | (RuntimeOptions & { readonly [runtimeStorage]: true });
export type ChartModel = JsonObject | (RuntimeOptions & { readonly [runtimeModel]: true });
export type IntegratedStateReducer = (input: IntegratedStateInput) => ChartStorageOutput;
export type DetachedStateReducer = (input: DetachedStateInput) => ChartStorageOutput;
export type ValidationResult<T> =
  | { readonly valid: true; readonly value: T }
  | { readonly valid: false; readonly error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValue(value: unknown, allowUndefined: boolean, ancestors = new Set<object>()): boolean {
  if (value === undefined) return allowUndefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value) && !isObject(value)) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid = Reflect.ownKeys(value).every((key) => {
    if (Array.isArray(value) && key === "length") return true;
    if (typeof key !== "string") return false;
    const descriptor = descriptors[key];
    return descriptor.enumerable && "value" in descriptor && isValue(descriptor.value, allowUndefined, ancestors);
  });
  ancestors.delete(value);
  return valid;
}

function isOptions(value: unknown): value is RuntimeOptions {
  return isObject(value) && isValue(value, true);
}

function isDataObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === "string" && descriptor?.enumerable === true && "value" in descriptor;
  });
}
function isModel(value: unknown): boolean {
  if (!isDataObject(value)) return false;
  if (isValue(value, false)) return true;
  return Object.entries(value).every(([key, item]) =>
    isValue(item, false) || (key === "chartOptions" && (item === undefined || isOptions(item))),
  );
}

function isPartition(value: unknown): boolean {
  if (!isDataObject(value)) return isValue(value, false);
  return Object.entries(value).every(([key, item]) =>
    isValue(item, false) || (key === "chartModel" && isModel(item)),
  );
}

function isStorage(value: unknown): boolean {
  if (!isDataObject(value)) return false;
  if (isValue(value, false)) return true;
  return Object.entries(value).every(([key, item]) => {
    if (isValue(item, false)) return true;
    if (key === "chartOptions") return item === undefined || isOptions(item);
    if (key === "chartModel") return isModel(item) || isPartition(item);
    return isValue(item, false) || isPartition(item);
  });
}
function commonError(value: Record<string, unknown>): string | undefined {
  if (!isStorage(value.storage)) return "storage must contain JSON outside known chart option slots";
  if (typeof value.chartType !== "string") return "chartType must be a string";
  if (typeof value.totalSeries !== "number" || !Number.isFinite(value.totalSeries) || value.totalSeries < 0) return "totalSeries must be a finite nonnegative count";
  if (value.eventOptions !== undefined && !isOptions(value.eventOptions)) return "eventOptions must be an object or undefined";
  return undefined;
}

/** Validate without cloning, defaulting or rewriting the original input. */
export function validateDetachedInput(value: unknown): ValidationResult<DetachedStateInput> {
  if (!isObject(value)) return { valid: false, error: "input must be an object" };
  const error = commonError(value);
  if (error) return { valid: false, error };
  return { valid: true, value: value as unknown as DetachedStateInput };
}

export function validateIntegratedInput(value: unknown): ValidationResult<IntegratedStateInput> {
  if (!isObject(value)) return { valid: false, error: "input must be an object" };
  const error = commonError(value);
  if (error) return { valid: false, error };
  if (typeof value.stateKey !== "string") return { valid: false, error: "stateKey must be resolved by the caller" };
  if (typeof value.isPivotMode !== "boolean") return { valid: false, error: "isPivotMode must be boolean" };
  if (!isOptions(value.resolvedOptions)) return { valid: false, error: "resolvedOptions must be an object" };
  if (value.currentModel !== undefined && !isModel(value.currentModel)) return { valid: false, error: "currentModel must contain JSON outside chartOptions or be undefined" };
  return { valid: true, value: value as unknown as IntegratedStateInput };
}
