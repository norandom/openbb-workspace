import merge from "lodash.merge";
import { selectOptionBaseline } from "../compatibility/optionState";
import type { ResolveHierarchyAppearance } from "./hierarchyAppearanceTypes";
import { composeAppearanceOptions } from "./appearanceComposition";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import {
  at,
  bool,
  child,
  number,
  object,
  type ReadAppearance,
} from "./effectiveAppearanceValues";
import { hierarchyAppearanceDefaults } from "./hierarchyAppearanceDefaults";
import {
  choice,
  freezeHierarchy,
  hierarchyAutoLabel,
  hierarchyGradient,
  hierarchyLabel,
  hierarchyPaint,
  hierarchyPalette,
  validateHierarchyPalettes,
} from "./hierarchyAppearanceValues";

export const resolveHierarchyAppearance: ResolveHierarchyAppearance = (input) => {
  try {
    if (input.family !== "treemap" && input.family !== "sunburst")
      throw Error("Invalid hierarchy family");
    const composed = composeAppearanceOptions(input);
    if (!composed.valid) return composed;
    // Theme options enter the same data-only validation boundary as persisted options.
    const theme = selectOptionBaseline({
      kind: "synchronize",
      stateAddress: "theme",
      previous: { ...input.baseline, options: input.theme.overrides },
    });
    if (!theme.valid) return theme;
    const palette = selectOptionBaseline({
      kind: "synchronize",
      stateAddress: "palette",
      previous: { ...input.baseline, options: { palette: input.themePalette } },
    });
    if (!palette.valid) return palette;
    const safe = {
      ...input,
      themePalette: palette.value.options
        .palette as unknown as typeof input.themePalette,
    };
    const overrides = [
      object(theme.value.options.common),
      object(theme.value.options[input.family]),
      object(composed.value.common),
      object(composed.value[input.family]),
    ];
    // Stock palette strokes do not opt into borders; explicit option strokes do.
    const layers = [
      hierarchyAppearanceDefaults(safe, {
        paletteStroke: overrides.some(
          (layer) => at(layer, "series.strokes.0") !== undefined,
        ),
        tileStroke: overrides.some(
          (layer) => at(layer, "series.tile.stroke") !== undefined,
        ),
      }),
      ...overrides,
    ];
    validateHierarchyPalettes(layers);
    const effective = merge({}, ...layers);
    const read: ReadAppearance = (path) => at(effective, path);
    const chrome = resolveAppearanceChrome(layers, input.theme.palette, 0);
    const base = {
      common: {
        textColor: input.theme.colors.textColor,
        fontFamily: chrome.title.font,
        fontSize: chrome.title.size,
        precision: number(input.precision),
      },
      application: {
        title: chrome.title,
        subtitle: chrome.subtitle,
        padding: chrome.padding,
        background: chrome.background,
      },
      tooltip: {
        enabled: chrome.tooltip.enabled,
        mode: choice(chrome.tooltip.mode, ["single", "shared", "compact"]),
      },
      palette: hierarchyPalette(effective),
      gradientLegend: hierarchyGradient(child(read, "gradientLegend")),
    };
    if (input.family === "treemap")
      return {
        valid: true,
        value: freezeHierarchy({
          ...base,
          family: "treemap",
          group: {
            ...hierarchyPaint(child(read, "series.group")),
            interactive: bool(read("series.group.interactive")),
            label: hierarchyLabel(child(read, "series.group.label")),
          },
          tile: {
            ...hierarchyPaint(child(read, "series.tile")),
            verticalAlign: choice(read("series.tile.verticalAlign"), [
              "top",
              "middle",
              "bottom",
            ]),
            label: hierarchyAutoLabel(child(read, "series.tile.label")),
          },
        }),
      };
    return {
      valid: true,
      value: freezeHierarchy({
        ...base,
        family: "sunburst",
        series: {
          label: hierarchyAutoLabel(child(read, "series.label")),
          fillOpacity: number(read("series.fillOpacity"), 0, 1),
          strokeWidth: number(read("series.strokeWidth")),
          strokeOpacity: number(read("series.strokeOpacity"), 0, 1),
          cornerRadius: number(read("series.cornerRadius")),
          sectorSpacing: number(read("series.sectorSpacing")),
          padding: number(read("series.padding")),
        },
      }),
    };
  } catch {
    return { valid: false, error: "Invalid hierarchy appearance" };
  }
};
