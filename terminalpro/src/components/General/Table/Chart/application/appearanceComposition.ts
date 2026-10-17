import merge from "lodash.merge";
import { selectOptionBaseline } from "../compatibility/optionState";
import type { ComposeAppearanceOptions } from "./appearanceContracts";

function inputFields(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("appearance input must be a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("appearance input must be a plain object");
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error("appearance input must contain enumerable data properties");
    }
    result[key] = descriptor.value;
  }
  return result;
}

export const composeAppearanceOptions: ComposeAppearanceOptions = (input) => {
  try {
    const fields = inputFields(input);
    // An empty synchronization keeps the selected options and validates/copies the
    // complete baseline without choosing model.chartOptions as a new operand.
    const saved = selectOptionBaseline({
      kind: "synchronize",
      stateAddress: "appearance",
      previous: fields.baseline,
    });
    if (!saved.valid) return saved;
    const generated = selectOptionBaseline({
      kind: "synchronize",
      stateAddress: "appearance",
      previous: {
        stateAddress: "appearance",
        chartType: "appearance",
        model: {},
        options: fields.generated,
      },
    });
    if (!generated.valid) return generated;
    const savedOptions = saved.value.options;
    const generatedOptions = generated.value.options;
    // The owned hook replaces common before merging. Only detached copies may
    // receive those mutations; rendering options never replace stored state.
    savedOptions.common = generatedOptions.common;
    return { valid: true, value: merge(generatedOptions, savedOptions) };
  } catch {
    return { valid: false, error: "Unable to inspect appearance composition input" };
  }
};
