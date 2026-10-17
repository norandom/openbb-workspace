import type {
  DeriveAppearanceColors,
  DerivedAppearanceColors,
} from "./appearanceContracts";

const tokenFields = [
  "base",
  "foregroundColor",
  "backgroundColor",
  "textColor",
  "chartBackgroundColor",
] as const;
type TokenField = (typeof tokenFields)[number];
type TokenStrings = Record<TokenField, string>;
type Failure = Exclude<DerivedAppearanceColors, { status: "resolved" }>;
type Inspection = { status: "valid"; fields: TokenStrings } | Failure;

function failure(
  status: "invalid" | "unresolved",
  path: readonly string[],
  message: string,
): Failure {
  return {
    status,
    diagnostics: [{ code: `${status}-appearance-colors`, path, message }],
  };
}

function inspect(value: unknown): Inspection {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failure("invalid", [], "Color tokens must be a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return failure("invalid", [], "Color tokens must be a plain object");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !tokenFields.includes(key as TokenField)) {
      return failure(
        "invalid",
        typeof key === "string" ? [key] : [],
        "Unknown color token field",
      );
    }
  }
  const fields: TokenStrings = Object.create(null);
  for (const field of tokenFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      return failure(
        "invalid",
        [field],
        "Color token must be an own string data property",
      );
    }
    fields[field] = descriptor.value;
  }
  return { status: "valid", fields };
}

function mixColor(foreground: string, background: string, t: number): string {
  let color = "#";
  for (const offset of [1, 3, 5]) {
    const fg = Number.parseInt(foreground.slice(offset, offset + 2), 16);
    const bg = Number.parseInt(background.slice(offset, offset + 2), 16);
    // Normalizing before interpolation preserves the original rounding edges.
    const channel = (fg / 255) * (1 - t) + (bg / 255) * t;
    const byte = Math.round(Math.min(1, Math.max(0, channel)) * 255);
    color += byte.toString(16).padStart(2, "0");
  }
  return color;
}

export const deriveAppearanceColors: DeriveAppearanceColors = (tokens) => {
  try {
    const inspected = inspect(tokens);
    if (inspected.status !== "valid") return inspected;
    const fields = inspected.fields;
    if (fields.base !== "ag-default" && fields.base !== "ag-default-dark") {
      return failure(
        "unresolved",
        ["base"],
        "Base is outside the captured color derivation domain",
      );
    }
    for (const field of tokenFields) {
      if (field === "base") continue;
      const color = fields[field];
      if (color.length !== 7 || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return failure(
          "unresolved",
          [field],
          "Color is outside the captured opaque six-digit hex domain",
        );
      }
    }
    const dark = fields.base === "ag-default-dark";
    return {
      status: "resolved",
      gridLineColor: mixColor(
        fields.foregroundColor,
        fields.backgroundColor,
        dark ? 1 - 0.257 : 1 - 0.1,
      ),
      subtleTextColor: mixColor(
        fields.textColor,
        fields.chartBackgroundColor,
        dark ? 0.57 : 0.38,
      ),
    };
  } catch {
    return failure("invalid", [], "Unable to inspect color tokens");
  }
};
