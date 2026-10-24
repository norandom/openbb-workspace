import type { EChartsOption } from "echarts";
import type { RadarMappingInput } from "../compatibility/radarContracts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { linearRawTicks, linearTickDensity, niceLinearExtent } from "./linearTicks";
import type { RadarData } from "./radarData";
import { radarLegendData } from "./radarSeries";
export interface RadarGeometry {
  readonly center: readonly [number, number];
  readonly radius: number;
  readonly inner: number;
}
export function radarDomain(data: RadarData, input: RadarMappingInput, span: number) {
  const values = data.series
    .filter((s) => input.context.legendSelection?.[s.id] !== false)
    .flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (!values.length)
    return { extent: [0, 0] as [number, number], ticks: [] as number[] };
  let low = 0;
  let high = 0;
  for (const value of values) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const labelHeight = measureText("0123456789", input.style.polarAxis.labels).height;
  const density = linearTickDensity(span, Math.max(1, (labelHeight + 4) / 50));
  const extent =
    low === high
      ? ([low, high] as [number, number])
      : niceLinearExtent([low, high], density);
  return { extent, ticks: linearRawTicks(extent, density) };
}
/** Signed affine projection: numeric zero need not coincide with the geometric center. */
export function radarPoint(
  index: number,
  count: number,
  value: number,
  g: RadarGeometry,
  domain: readonly [number, number],
): [number, number] {
  const t =
    domain[0] === domain[1] ? 0.5 : (value - domain[0]) / (domain[1] - domain[0]);
  const radius = g.inner + t * (g.radius - g.inner);
  const angle = (index * Math.PI * 2) / Math.max(1, count) - Math.PI / 2;
  return [
    g.center[0] + Math.cos(angle) * radius,
    g.center[1] + Math.sin(angle) * radius,
  ];
}
function textStyle(input: RadarMappingInput) {
  const s = input.style.polarAxis.labels;
  return {
    fill: s.color,
    fontFamily: s.font,
    fontSize: s.size,
    fontWeight: s.fontWeight,
    fontStyle: s.fontStyle,
  };
}
function axisGraphics(
  input: RadarMappingInput,
  data: RadarData,
  g: RadarGeometry,
  domain: ReturnType<typeof radarDomain>,
) {
  const axis = input.style.polarAxis;
  const style = { fill: "none", stroke: axis.color, lineWidth: axis.thickness };
  const rings = domain.ticks.map((value) => {
    const p = radarPoint(0, data.categories.length, value, g, domain.extent);
    const radius = g.center[1] - p[1];
    return axis.shape === "circle"
      ? {
          type: "circle" as const,
          silent: true,
          shape: { cx: g.center[0], cy: g.center[1], r: radius },
          style,
        }
      : {
          type: "polygon" as const,
          silent: true,
          shape: {
            points: data.categories.map((_, i) =>
              radarPoint(i, data.categories.length, value, g, domain.extent),
            ),
          },
          style,
        };
  });
  const spokes = data.categories.map((category, i) => {
    const point = radarPoint(
      i,
      data.categories.length,
      1,
      { ...g, inner: g.radius, radius: g.radius },
      [0, 1],
    );
    const start = radarPoint(
      i,
      data.categories.length,
      0,
      { ...g, radius: g.inner },
      [0, 1],
    );
    const angle = (i * Math.PI * 2) / Math.max(1, data.categories.length);
    const label = radarPoint(
      i,
      data.categories.length,
      1,
      { ...g, inner: g.radius + 12, radius: g.radius + 12 },
      [0, 1],
    );
    const rotation =
      axis.labels.orientation === "fixed"
        ? 0
        : -angle + (axis.labels.orientation === "parallel" ? 0 : Math.PI / 2);
    return [
      {
        type: "line" as const,
        silent: true,
        shape: { x1: start[0], y1: start[1], x2: point[0], y2: point[1] },
        style,
      },
      {
        type: "text" as const,
        silent: true,
        x: label[0],
        y: label[1],
        rotation,
        style: {
          ...textStyle(input),
          text: input.context.display.category(category),
          align: "center" as const,
          verticalAlign: "middle" as const,
        },
      },
    ];
  });
  const ticks = domain.ticks.map((value) => {
    const p = radarPoint(0, data.categories.length, value, g, domain.extent);
    return {
      type: "text" as const,
      silent: true,
      x: p[0] + 5,
      y: p[1],
      style: {
        ...textStyle(input),
        text: input.context.display.numericAxis(value),
        verticalAlign: "middle" as const,
      },
    };
  });
  return [...rings, ...spokes.flat(), ...ticks];
}
function geometry(input: RadarMappingInput, data: RadarData) {
  const a = input.style.application;
  const p = { ...a.padding };
  p.top += captionSpace(input);
  if (a.legend.enabled) {
    const side = a.legend.position as keyof typeof p;
    const size =
      side === "left" || side === "right"
        ? Math.max(
            0,
            ...data.series.map(
              (s) =>
                measureText(String(input.context.display.legend(s.label)), a.legend)
                  .width,
            ),
          ) + 30
        : a.legend.size + 20;
    p[side] += size + a.legend.spacing;
  }
  const room = Math.max(
    12,
    ...data.categories.map(
      (c) =>
        measureText(
          String(input.context.display.category(c)),
          input.style.polarAxis.labels,
        ).width /
          2 +
        12,
    ),
  );
  const width = Math.max(0, input.context.viewport.width - p.left - p.right);
  const height = Math.max(0, input.context.viewport.height - p.top - p.bottom);
  const radius = Math.max(0, Math.min(width, height) / 2 - room);
  return {
    center: [p.left + width / 2, p.top + height / 2] as const,
    radius,
    inner: radius * input.style.polarAxis.innerRadiusRatio,
  };
}
export function radarLayout(input: RadarMappingInput, data: RadarData) {
  const a = input.style.application;
  const g = geometry(input, data);
  const domain = radarDomain(data, input, g.radius - g.inner);
  const vertical = a.legend.position === "left" || a.legend.position === "right";
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
    legend: {
      show: a.legend.enabled,
      type: "scroll",
      orient: vertical ? "vertical" : "horizontal",
      [a.legend.position]:
        a.padding[a.legend.position as keyof typeof a.padding] +
        (a.legend.position === "top" ? captionSpace(input) : 0),
      ...(vertical ? { top: "middle" } : { left: "center" }),
      data: radarLegendData(input, data),
      selected: { ...input.context.legendSelection },
      formatter: (id: string) =>
        String(
          input.context.display.legend(
            data.series.find((s) => s.id === id)?.label ?? id,
          ),
        ),
      textStyle: {
        ...fontStyle(a.legend),
        padding: [
          a.legend.verticalSpacing / 2,
          a.legend.horizontalSpacing,
          a.legend.verticalSpacing / 2,
          a.legend.itemSpacing - 5,
        ],
      },
      padding: 0,
      itemGap: 0,
      itemWidth:
        input.family === "radarLine"
          ? Math.max(25, a.legend.markerSize)
          : a.legend.markerSize,
      itemHeight: a.legend.markerSize,
    },
    graphic: axisGraphics(input, data, g, domain) as EChartsOption["graphic"],
  };
  return { geometry: g, domain, options };
}
function captionSpace(input: RadarMappingInput): number {
  return [input.style.application.title, input.style.application.subtitle].reduce(
    (total, c) =>
      total + (c.enabled && c.text ? measureText(c.text, c).height + c.spacing : 0),
    0,
  );
}
