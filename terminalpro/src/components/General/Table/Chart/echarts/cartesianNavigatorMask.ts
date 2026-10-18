import { color, type EChartsOption } from "echarts";
import type { ApplicationThemeInput } from "../application/appearanceModel";

type Mask = {
  id: string;
  type: "group";
  left: number;
  bottom: number;
  z: number;
  silent: boolean;
  children: {
    id: string;
    type: "rect";
    invisible?: boolean;
    shape: { x: number; y: number; width: number; height: number; r?: number[] };
    style: { fill: string };
  }[];
};
const ID = "openbb-navigator-mask";

export function navigatorBorder(theme: ApplicationThemeInput): string {
  if (theme.navigatorBorderColor) return theme.navigatorBorderColor;
  if (theme.colors.base === "ag-default")
    return color.modifyAlpha(theme.colors.foregroundColor, 0.15)!;
  const foreground = color.parse(theme.colors.foregroundColor)!;
  const background = color.parse(theme.colors.backgroundColor)!;
  const channels = foreground.map(
    (value, i) => value * 0.216 + background[i] * (1 - 0.216),
  );
  return `rgba(${channels.slice(0, 3).map(Math.round).join(",")},${channels[3]})`;
}
/** Original shading covers the excluded range, leaving the selected observations clear. */
export function navigatorMask(
  left: number,
  right: number,
  bottom: number,
  height: number,
  width: number,
  foreground: string,
): EChartsOption["graphic"] {
  const trackWidth = Math.max(0, width - left - right);
  const fill = color.modifyAlpha(foreground, 0.1)!;
  return [
    {
      id: ID,
      type: "group",
      left,
      bottom,
      z: 3,
      silent: true,
      children: [
        {
          id: `${ID}-track`,
          type: "rect",
          invisible: true,
          shape: { x: 0, y: 0, width: trackWidth, height },
          style: { fill: "transparent" },
        },
        {
          id: `${ID}-left`,
          type: "rect",
          shape: { x: 0, y: 0, width: 0, height, r: [4, 0, 0, 4] },
          style: { fill },
        },
        {
          id: `${ID}-right`,
          type: "rect",
          shape: { x: trackWidth, y: 0, width: 0, height, r: [0, 4, 4, 0] },
          style: { fill },
        },
      ],
    },
  ] as EChartsOption["graphic"];
}
export function rangedNavigatorMask(
  graphic: EChartsOption["graphic"],
  start: number,
  end: number,
): EChartsOption["graphic"] {
  if (!Array.isArray(graphic)) return graphic;
  return graphic.map((item) => {
    const mask = item as Mask;
    if (mask.id !== ID) return item;
    const width = mask.children[0].shape.width;
    return {
      ...mask,
      children: mask.children.map((child, i) =>
        i === 0
          ? child
          : {
              ...child,
              shape: {
                ...child.shape,
                x: i === 1 ? 0 : (width * end) / 100,
                width: (width * (i === 1 ? start : 100 - end)) / 100,
              },
            },
      ),
    };
  }) as EChartsOption["graphic"];
}
