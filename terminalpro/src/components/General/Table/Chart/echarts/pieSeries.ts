import {
  color,
  type PieSeriesOption,
  type TooltipComponentOption,
} from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type {
  PieDatum,
  PieGeometry,
  PieMappingInput,
  PieRing,
} from "./pieTypes";

function alpha(value: string, opacity: number): string {
  const parsed = color.parse(value);
  return (parsed && color.modifyAlpha(value, parsed[3] * opacity)) || value;
}
function paint(input: PieMappingInput, datum: PieDatum) {
  const p = input.style.series.paint;
  const palette = input.style.application.palette;
  const i = datum.metadata.paletteIndex;
  return {
    color: alpha(
      p.fill ?? palette.fills[i % palette.fills.length],
      p.fillOpacity,
    ),
    borderColor: alpha(
      p.stroke ?? palette.strokes[i % palette.strokes.length],
      p.strokeOpacity,
    ),
    borderWidth: p.strokeWidth,
    borderType: [...p.lineDash],
    shadowColor: p.shadow.color,
    shadowBlur: p.shadow.enabled ? p.shadow.blur : 0,
    shadowOffsetX: p.shadow.enabled ? p.shadow.xOffset : 0,
    shadowOffsetY: p.shadow.enabled ? p.shadow.yOffset : 0,
  };
}
function fits(
  x: number,
  y: number,
  width: number,
  height: number,
  inner: number,
  outer: number,
  start: number,
  span: number,
): boolean {
  return [-width / 2, width / 2].every((dx) =>
    [-height / 2, height / 2].every((dy) => {
      const px = x + dx;
      const py = y + dy;
      const radius = Math.hypot(px, py);
      const angle =
        (((Math.atan2(py, px) - start) % (2 * Math.PI)) + 2 * Math.PI) %
        (2 * Math.PI);
      return (
        radius >= inner &&
        radius <= outer &&
        (span >= 2 * Math.PI - 1e-10 || angle <= span + 1e-10)
      );
    }),
  );
}
function sectorPositions(
  input: PieMappingInput,
  ring: PieRing,
  geometry: PieGeometry,
  index: number,
) {
  const s = input.style.series.sectorLabel;
  const radius = geometry.rings[index];
  let angle = ((-90 + (input.style.series.rotation % 360)) * Math.PI) / 180;
  const enabledCount = ring.data.filter((d) => d.enabled).length;
  return ring.data.map((d) => {
    const span = d.value * Math.PI * 2;
    const mid = angle + span / 2;
    const distance =
      radius.inner +
      (radius.outer - radius.inner) * s.positionRatio +
      s.positionOffset;
    const centered = enabledCount === 1 && radius.inner === 0;
    const x = centered ? 0 : Math.cos(mid) * distance;
    const y = centered ? 0 : Math.sin(mid) * distance;
    const box = measureText(d.sectorText, s);
    const show =
      s.enabled &&
      radius.drawable &&
      span > 0 &&
      fits(
        x,
        y,
        box.width,
        box.height,
        radius.inner,
        radius.outer,
        angle,
        span,
      );
    angle += span;
    return { x: geometry.center[0] + x, y: geometry.center[1] + y, show };
  });
}
function base(
  input: PieMappingInput,
  ring: PieRing,
  geometry: PieGeometry,
  index: number,
): PieSeriesOption {
  const radius = geometry.rings[index];
  return {
    id: ring.id,
    type: "pie",
    center: geometry.center,
    radius: radius.inner > radius.outer ? [0, 0] : [radius.inner, radius.outer],
    clockwise: true,
    startAngle: 90 - (input.style.series.rotation % 360),
    minAngle: 0,
    stillShowZeroSum: false,
    showEmptyCircle: false,
    selectedOffset: 0,
    animation: false,
    emphasis: { disabled: true, scale: false },
    selectedMode: false,
    avoidLabelOverlap: true,
    data: ring.data.map((d) => ({
      ...d,
      value: radius.drawable ? d.value : 0,
    })),
  };
}
function main(
  input: PieMappingInput,
  ring: PieRing,
  geometry: PieGeometry,
  index: number,
): PieSeriesOption {
  const s = input.style.series;
  const radius = geometry.rings[index];
  return {
    ...base(input, ring, geometry, index),
    label: {
      ...fontStyle(s.calloutLabel),
      show: s.calloutLabel.enabled,
      position: "outside",
      opacity: 1,
      distanceToLabelLine: s.calloutLabel.offset,
      formatter: (p) => (p.data as unknown as PieDatum).calloutText,
    },
    labelLine: {
      show: s.calloutLabel.enabled,
      length: s.calloutLine.length,
      length2: 0,
      lineStyle: { width: s.calloutLine.strokeWidth, opacity: 1 },
    },
    minShowLabelAngle: s.calloutLabel.minAngle,
    data: ring.data.map((d) => ({
      ...d,
      value: radius.drawable ? d.value : 0,
      itemStyle: paint(input, d),
      label: {
        show:
          s.calloutLabel.enabled &&
          radius.drawable &&
          d.value > 0 &&
          d.value * 360 >= s.calloutLabel.minAngle,
      },
      labelLine: {
        lineStyle: {
          color:
            s.calloutLine.colors?.[
              d.metadata.paletteIndex % s.calloutLine.colors.length
            ] ??
            input.style.application.palette.strokes[
              d.metadata.paletteIndex %
                input.style.application.palette.strokes.length
            ],
        },
      },
    })),
  };
}
function companion(
  input: PieMappingInput,
  ring: PieRing,
  geometry: PieGeometry,
  index: number,
): PieSeriesOption {
  const s = input.style.series.sectorLabel;
  const positions = sectorPositions(input, ring, geometry, index);
  const radius = geometry.rings[index];
  return {
    ...base(input, ring, geometry, index),
    id: `${ring.id}:sector-labels`,
    silent: true,
    tooltip: { show: false },
    avoidLabelOverlap: false,
    color: ["transparent"],
    itemStyle: {
      color: "transparent",
      borderWidth: 0,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
    label: {
      ...fontStyle(s),
      position: "inside",
      opacity: 1,
      rotate: 0,
      align: "center",
      verticalAlign: "middle",
      formatter: (p) => (p.data as unknown as PieDatum).sectorText,
    },
    labelLine: { show: false },
    labelLayout: (p) => ({
      x: positions[p.dataIndex ?? 0].x,
      y: positions[p.dataIndex ?? 0].y,
      rotate: 0,
      align: "center",
      verticalAlign: "middle",
    }),
    data: ring.data.map((d, i) => ({
      ...d,
      value: radius.drawable ? d.value : 0,
      label: { show: positions[i].show },
    })),
  };
}
export function pieSeries(
  input: PieMappingInput,
  rings: readonly PieRing[],
  geometry: PieGeometry,
): PieSeriesOption[] {
  return rings.flatMap((ring, i) => [
    main(input, ring, geometry, i),
    ...(input.style.series.sectorLabel.enabled
      ? [companion(input, ring, geometry, i)]
      : []),
  ]);
}
export function pieTooltip(input: PieMappingInput): TooltipComponentOption {
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item",
    formatter: (params) => {
      const datum = (params as unknown as { data?: PieDatum }).data;
      return datum?.tooltipText ?? "";
    },
  };
}
