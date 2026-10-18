import { color } from "echarts";
import { deriveAppearanceColors } from "./appearanceColors";
import type { AppearanceColorTokens } from "./appearanceContracts";

function rgba(value: string): number[] {
  const result = color.parse(value);
  if (!result) throw new Error(`Unresolved application theme color: ${value}`);
  return result;
}

// AG Color.mix interpolates unpremultiplied normalized RGBA, including alpha.
export function mixAppearanceColor(
  foreground: string,
  background: string,
  ratio: number,
): string {
  const fg = rgba(foreground);
  const bg = rgba(background);
  const channels = fg.map((channel, index) =>
    index === 3
      ? channel * (1 - ratio) + bg[index] * ratio
      : (channel / 255) * (1 - ratio) + (bg[index] / 255) * ratio,
  );
  const rgb = channels
    .slice(0, 3)
    .map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255));
  const hex = `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return channels[3] === 1
    ? hex
    : `rgba(${rgb.join(", ")}, ${Math.round(channels[3] * 1000) / 1000})`;
}

export function applicationColors(tokens: AppearanceColorTokens) {
  const accepted = deriveAppearanceColors(tokens);
  if (accepted.status === "invalid")
    throw new Error("Invalid selected theme color tokens");
  const dark = tokens.base === "ag-default-dark";
  if (tokens.base !== "ag-default" && !dark)
    throw new Error("Unresolved selected base theme");
  return {
    grid:
      accepted.status === "resolved"
        ? accepted.gridLineColor
        : mixAppearanceColor(
            tokens.foregroundColor,
            tokens.backgroundColor,
            dark ? 0.743 : 0.9,
          ),
    subtle:
      accepted.status === "resolved"
        ? accepted.subtleTextColor
        : mixAppearanceColor(
            tokens.textColor,
            tokens.chartBackgroundColor,
            dark ? 0.57 : 0.38,
          ),
    axis: mixAppearanceColor(
      tokens.foregroundColor,
      tokens.backgroundColor,
      dark ? 0.263 : 0.675,
    ),
  };
}
