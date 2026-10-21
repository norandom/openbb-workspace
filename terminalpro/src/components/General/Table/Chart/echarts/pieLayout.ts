import type { EChartsOption, LegendComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type { PieGeometry, PieMappingInput, PieRing } from "./pieTypes";

function legendSpace(
  input: PieMappingInput,
  rings: readonly PieRing[],
  width: number,
): number {
  const l = input.style.application.legend;
  const sizes = rings.flatMap((r) =>
    r.data.map((d) => measureText(d.legendText, l)),
  );
  if (l.position === "left" || l.position === "right")
    return (
      Math.max(0, ...sizes.map((s) => s.width)) +
      (sizes.length ? l.markerSize + l.itemSpacing : 0)
    );
  let rows = sizes.length ? 1 : 0;
  let used = 0;
  for (const s of sizes) {
    const item = s.width + l.markerSize + l.itemSpacing;
    if (used && used + item > width) {
      rows++;
      used = 0;
    }
    used += item + l.horizontalSpacing;
  }
  return (
    rows * Math.max(l.markerSize, ...sizes.map((s) => s.height), 0) +
    Math.max(rows - 1, 0) * l.verticalSpacing
  );
}
function calloutSpace(
  input: PieMappingInput,
  rings: readonly PieRing[],
): { x: number; y: number } {
  const c = input.style.series.calloutLabel;
  const line = input.style.series.calloutLine;
  if (!c.enabled) return { x: 0, y: 0 };
  const sizes = rings.flatMap((r) =>
    r.data
      .filter((d) => d.value > 0 && d.value * 360 >= c.minAngle)
      .map((d) => measureText(d.calloutText, c)),
  );
  if (!sizes.length) return { x: 0, y: 0 };
  return {
    x: Math.max(...sizes.map((s) => s.width)) + line.length + c.offset,
    y: Math.max(...sizes.map((s) => s.height)) / 2 + line.length + c.offset,
  };
}
function ringGeometry(
  input: PieMappingInput,
  rings: readonly PieRing[],
  radius: number,
): PieGeometry["rings"] {
  const p = input.style.series;
  return rings.map((ring) => {
    const offsets = ring.assignment.ring;
    const outer = Math.max(
      radius * p.outerRadiusRatio + (offsets?.outerRadiusOffset ?? 0),
      0,
    );
    const candidate = offsets
      ? radius * (p.innerRadiusRatio ?? 1) + offsets.innerRadiusOffset
      : 0;
    const inner = candidate < 0 || candidate === radius ? 0 : candidate;
    return { inner, outer, drawable: inner < outer && outer > 0 && radius > 0 };
  });
}
function legend(
  input: PieMappingInput,
  rings: readonly PieRing[],
  captionSpace: number,
): LegendComponentOption {
  const a = input.style.application;
  const l = a.legend;
  const data = rings.flatMap((r) => r.data);
  const labels = new Map(data.map((d) => [d.name, d.legendText]));
  const vertical = l.position === "left" || l.position === "right";
  const rowPadding =
    (l.verticalSpacing +
      Math.max(0, l.markerSize - measureText("M", l).height)) /
    2;
  return {
    show: l.enabled,
    data: data.map((d) => ({ name: d.name, icon: "circle" })),
    selected: Object.fromEntries(data.map((d) => [d.name, d.enabled])),
    formatter: (name) => labels.get(name) ?? name,
    orient: vertical ? "vertical" : "horizontal",
    [l.position]:
      a.padding[l.position as keyof typeof a.padding] +
      (l.position === "top" ? captionSpace : 0),
    ...(vertical ? { top: "middle" } : { left: "center" }),
    padding: 0,
    itemWidth: l.markerSize,
    itemHeight: l.markerSize,
    itemGap: 0,
    textStyle: {
      ...fontStyle(l),
      backgroundColor: "transparent",
      padding: [rowPadding, l.horizontalSpacing, rowPadding, l.itemSpacing - 5],
    },
    itemStyle: { borderWidth: a.legendMarkerStrokeWidth },
  };
}
function outlines(
  input: PieMappingInput,
  rings: readonly PieRing[],
  geometry: PieGeometry,
): EChartsOption["graphic"] {
  return rings.flatMap((r, i) => {
    if (r.positive) return [];
    const radii = [geometry.rings[i].outer];
    const ratio = input.style.series.innerRadiusRatio;
    if (ratio !== undefined && ratio > 0 && ratio !== 1)
      radii.push(geometry.rings[i].inner);
    return radii.map((radius, index) => ({
      id: `${r.id}:empty:${index}`,
      type: "circle" as const,
      silent: true,
      shape: { cx: geometry.center[0], cy: geometry.center[1], r: radius },
      style: {
        fill: "none",
        stroke: input.style.series.calloutLabel.color,
        lineWidth: 1,
        opacity: 1,
      },
    }));
  });
}
export function pieLayout(input: PieMappingInput, rings: readonly PieRing[]) {
  const a = input.style.application;
  const viewport = input.context.viewport;
  const captions = [a.title, a.subtitle].filter(
    (c) => c.enabled && c.text !== "",
  );
  const captionSpace = captions.reduce(
    (sum, c) => sum + measureText(c.text, c).height + c.spacing,
    0,
  );
  const padding = { ...a.padding, top: a.padding.top + captionSpace };
  if (a.legend.enabled)
    padding[a.legend.position as keyof typeof padding] +=
      legendSpace(
        input,
        rings,
        Math.max(0, viewport.width - a.padding.left - a.padding.right),
      ) + a.legend.spacing;
  const width = Math.max(0, viewport.width - padding.left - padding.right);
  const height = Math.max(0, viewport.height - padding.top - padding.bottom);
  const room = calloutSpace(input, rings);
  const radius = Math.max(0, Math.min(width / 2 - room.x, height / 2 - room.y));
  const geometry: PieGeometry = {
    center: [
      Math.min(viewport.width, padding.left + width / 2),
      Math.min(viewport.height, padding.top + height / 2),
    ],
    radius,
    rings: ringGeometry(input, rings, radius),
  };
  const options: Pick<
    EChartsOption,
    "backgroundColor" | "title" | "legend" | "graphic"
  > = {
    backgroundColor: a.background.visible ? a.background.fill : "transparent",
    title: {
      show: a.title.enabled || a.subtitle.enabled,
      text: a.title.enabled ? a.title.text : "",
      subtext: a.subtitle.enabled ? a.subtitle.text : "",
      textStyle: fontStyle(a.title),
      subtextStyle: fontStyle(a.subtitle),
      itemGap: a.title.enabled && a.title.text ? a.title.spacing : 0,
      padding: 0,
      top: a.padding.top,
      left: "center",
    },
    legend: legend(input, rings, captionSpace),
    graphic: outlines(input, rings, geometry),
  };
  return { geometry, options };
}
