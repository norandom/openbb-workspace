import cloneDeep from "lodash/cloneDeep";
import type { HierarchyPalette } from "../application/hierarchyAppearanceTypes";
import { projectCallerTheme } from "./themeInputs";

const lightHierarchy = ["#fff", "#e0e5ea", "#c1ccd5", "#a3b4c1", "#859cad"];
const darkHierarchy = ["#192834", "#253746", "#324859", "#3f596c", "#4d6a80"];
const lightSecond = ["#fff", "#c5cbd1", "#a4b1bd", "#8498a9", "#648096"];
const darkSecond = ["#192834", "#3b5164", "#496275", "#577287", "#668399"];
const diverging = ["#ffa03a", "#e1cc00", "#459d55"];

/** Pinned AG Charts 12.1.1 hierarchy tokens use the selected theme's base. */
export function projectHierarchyThemePalette(
  mode: "dark" | "light",
  names: readonly string[],
  themes: Record<string, any>,
): HierarchyPalette {
  const name = names[0] ?? `openbb-${mode}`;
  const selected = themes[name] ?? {};
  const dark = selected.baseTheme
    ? selected.baseTheme === "ag-default-dark"
    : mode === "dark";
  const common = projectCallerTheme(mode, names, themes);
  const palette = selected.palette ?? {};
  return cloneDeep({
    fills: common.palette.fills,
    strokes: common.palette.strokes,
    hierarchyColors: palette.hierarchyColors ?? (dark ? darkHierarchy : lightHierarchy),
    secondHierarchyColors:
      palette.secondHierarchyColors ?? (dark ? darkSecond : lightSecond),
    colorRange: palette.divergingColors ?? diverging,
  });
}
