import type { WaterfallThemePaint } from "../application/waterfallTypes";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function color(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !value) throw Error("Invalid Waterfall theme color");
  return value;
}

/** Indexed palettes replace fills only; Waterfall outlines retain named theme tokens. */
export function waterfallThemePaint(
  value: unknown,
  dark: boolean,
): WaterfallThemePaint {
  const palette = object(value);
  const stockFills = ["#5090dc", "#ffa03a", "#b5b5b5"];
  const stockStrokes = dark
    ? ["#74a8e6", "#ffbe70", "#a1a1a1"]
    : ["#2b5c95", "#cc6f10", "#575757"];
  const indexed =
    !(palette.up || palette.down || palette.neutral) &&
    Boolean(palette.fills || palette.strokes);
  const item = (name: string, index: number) => {
    const named = object(palette[name]);
    return {
      fill: color(
        indexed && Array.isArray(palette.fills)
          ? (palette.fills[index] ?? palette.fills[0])
          : indexed
            ? undefined
            : named.fill,
        indexed && index === 2 ? "#459d55" : stockFills[index],
      ),
      stroke: color(named.stroke, stockStrokes[index]),
    };
  };
  const total = item("neutral", 2);
  return {
    positive: item("altUp", 0),
    negative: item("altDown", 1),
    total,
    connectorStroke: color(object(palette.neutral).stroke, stockStrokes[2]),
  };
}
