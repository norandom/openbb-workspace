import merge from "lodash.merge";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { ApplicationConcreteAxis } from "./axisStructureTypes";
import type { ResolvedApplicationAxis } from "./appearanceModel";
import {
  at,
  bool,
  caption,
  child,
  dash,
  font,
  number,
  text,
  type ReadAppearance,
} from "./effectiveAppearanceValues";

/** The original editor reads bottom/top or left/right for each leaf, not by displayed position. */
function axisReader(
  layers: readonly RuntimeOptions[],
  axis: ApplicationConcreteAxis,
): ReadAppearance {
  const positions = axis.direction === "x" ? ["bottom", "top"] : ["left", "right"];
  return (path) => {
    let value: unknown;
    for (const layer of layers) {
      const root = at(layer, `axes.${axis.type}`);
      const inherited = at(root, path);
      if (inherited !== undefined)
        value =
          path === "gridLine.style" && Array.isArray(inherited)
            ? merge([], value, inherited)
            : inherited;
      for (const position of positions) {
        const positioned = at(root, `${position}.${path}`);
        if (positioned === undefined) continue;
        value =
          path === "gridLine.style" && Array.isArray(positioned)
            ? merge([], value, positioned)
            : positioned;
        break;
      }
    }
    return value;
  };
}

function gridStyles(read: ReadAppearance): ResolvedApplicationAxis["gridStyles"] {
  const styles = read("gridLine.style");
  if (!Array.isArray(styles) || styles.length === 0)
    throw new Error("Missing axis grid styles");
  return styles.map((style) => ({
    stroke: text(at(style, "stroke")),
    lineDash: dash(at(style, "lineDash") ?? []),
  }));
}

function rotation(
  axis: ApplicationConcreteAxis,
  read: ReadAppearance,
): number | undefined {
  const label = at(axis.options, "label");
  // An own undefined rotation is the source current-interaction auto-rotate reset.
  const value =
    label && typeof label === "object" && Object.hasOwn(label, "rotation")
      ? at(label, "rotation")
      : read("label.rotation");
  return value === undefined ? undefined : number(value, Number.NEGATIVE_INFINITY);
}

export function resolveAppearanceAxis(
  layers: readonly RuntimeOptions[],
  axis: ApplicationConcreteAxis,
): ResolvedApplicationAxis {
  const read = axisReader(layers, axis);
  const styles = gridStyles(read);
  return {
    fields: {
      type: axis.type,
      position: axis.position,
      timeFormat: text(at(axis.options, "label.format") ?? ""),
      color: text(read("line.stroke")),
      thickness: number(read("line.width")),
    },
    title: caption(child(read, "title")),
    labels: {
      ...font(child(read, "label")),
      padding: number(read("label.spacing")),
      autoRotate: bool(
        at(axis.options, "label.autoRotate") ?? read("label.autoRotate"),
      ),
      rotation: rotation(axis, read),
    },
    grid: {
      enabled: bool(read("gridLine.enabled")),
      color: styles[0].stroke,
      thickness: number(read("gridLine.width")),
      lineDash: styles[0].lineDash[0] ?? 0,
    },
    ticks: {
      enabled: bool(read("tick.enabled")),
      color: text(read("tick.stroke")),
      width: number(read("tick.width")),
      length: number(read("tick.size")),
    },
    gridStyles: styles,
    lineEnabled: bool(read("line.enabled")),
  };
}
