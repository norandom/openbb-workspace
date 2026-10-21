import type { CustomSeriesOption, CustomSeriesRenderItemAPI } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { markerDimensions, markerSymbol } from "./cartesianMarkers";
import { rangeCategoryDomain, rangeCoordinate, rangeTransport } from "./rangeAreaAxes";
import { areaPaths, finitePoints, type Point, partition } from "./rangeAreaPaths";
import type {
  RangeAreaFieldStyle,
  RangeAreaMappingInput,
  RangeAreaProjection,
} from "./rangeAreaTypes";
import type { RangeBarText } from "./rangeBarTypes";

type Plot = { x: number; y: number; width: number; height: number };
type Coord = CustomSeriesRenderItemAPI["coord"];
function point(
  slot: number,
  value: number,
  input: RangeAreaMappingInput,
  coord: Coord,
): Point {
  const p = coord([slot, rangeCoordinate(value, input)]);
  const result: Point = [p[0], p[1]];
  finitePoints([result]);
  return result;
}
function marker(p: Point, s: RangeAreaFieldStyle) {
  const m = s.marker;
  const symbol = markerSymbol(m.shape);
  const dim = markerDimensions(m.shape, m.size);
  const [width, height] = typeof dim === "number" ? [dim, dim] : dim;
  const style = {
    fill: m.fill,
    fillOpacity: m.fillOpacity,
    stroke: m.stroke,
    strokeOpacity: m.strokeOpacity,
    lineWidth: m.strokeWidth,
  };
  return symbol === "circle"
    ? {
        type: "circle" as const,
        silent: true,
        shape: { cx: p[0], cy: p[1], r: m.size / 2 },
        style,
      }
    : {
        type: "path" as const,
        silent: true,
        shape: {
          pathData: symbol.slice(7),
          x: p[0] - width / 2,
          y: p[1] - height / 2,
          width,
          height,
          layout: "cover" as const,
        },
        style,
      };
}
function labels(
  points: readonly Point[],
  s: RangeAreaFieldStyle,
  text: readonly [string, string] | null,
) {
  if (!text) return [];
  const outside = s.label.placement === "outside";
  const d = (s.label.spacing + s.label.padding) * (outside ? 1 : -1);
  return points.map((p, i) => ({
    type: "text" as const,
    silent: true,
    style: {
      ...fontStyle(s.label),
      fill: s.label.color,
      text: text[i],
      x: p[0],
      y: p[1] + (i === 0 ? d : -d),
      align: "center" as const,
      verticalAlign: (i === 0) === outside ? ("top" as const) : ("bottom" as const),
    },
  }));
}
function glyphs(
  input: RangeAreaMappingInput,
  projection: RangeAreaProjection,
  index: number,
  text: RangeBarText,
  coord: Coord,
) {
  const f = projection.fields[index];
  const s = input.style.fields[f.descriptor.id];
  const runs = partition(
    f.data.map((d) => (d.summary ? d : null)),
    s.connectMissingData,
  );
  return runs.flatMap((run) => {
    const low = run.map((d) => point(d.groupSlot, d.summary!.min, input, coord));
    const high = run.map((d) => point(d.groupSlot, d.summary!.max, input, coord));
    const paths = areaPaths(low, high, s.interpolation);
    const children: ReturnType<typeof labels>[number][] = [];
    const spans =
      run.length > 1
        ? [
            {
              type: "path" as const,
              silent: true,
              shape: { pathData: paths.fill },
              style: {
                fill: s.fill,
                opacity: s.fillOpacity,
                shadowColor: s.shadow.enabled ? s.shadow.color : "transparent",
                shadowBlur: s.shadow.enabled ? s.shadow.blur : 0,
                shadowOffsetX: s.shadow.xOffset,
                shadowOffsetY: s.shadow.yOffset,
              },
            },
            {
              type: "path" as const,
              silent: true,
              shape: { pathData: paths.outline },
              style: {
                fill: "none",
                stroke: s.stroke,
                opacity: s.strokeOpacity,
                lineWidth: s.strokeWidth,
                lineDash: [...s.lineDash],
                lineDashOffset: s.lineDashOffset,
                lineCap: "round" as const,
                lineJoin: "round" as const,
              },
            },
          ]
        : [];
    run.forEach((d, i) =>
      children.push(
        ...labels([low[i], high[i]], s, text.endpoints[index][d.groupSlot]),
      ),
    );
    return [
      ...spans,
      ...(s.marker.enabled
        ? low.flatMap((p, i) => [marker(p, s), marker(high[i], s)])
        : []),
      ...children,
    ];
  });
}
function hit(
  input: RangeAreaMappingInput,
  projection: RangeAreaProjection,
  index: number,
  slot: number,
  plot: Plot,
  coord: Coord,
) {
  const d = projection.fields[index].data[slot];
  if (!d.summary) return;
  const a = point(slot, d.summary.min, input, coord);
  const b = point(slot, d.summary.max, input, coord);
  const previous =
    slot === 0 ? plot.x : (a[0] + point(slot - 1, d.summary.min, input, coord)[0]) / 2;
  const next =
    slot === projection.groups.length - 1
      ? plot.x + plot.width
      : (a[0] + point(slot + 1, d.summary.min, input, coord)[0]) / 2;
  const lo = Math.min(a[1], b[1]);
  const hi = Math.max(a[1], b[1]);
  if (hi < plot.y || lo > plot.y + plot.height) return;
  const y = Math.max(plot.y, lo === hi ? lo - 0.5 : lo);
  const end = Math.min(plot.y + plot.height, lo === hi ? hi + 0.5 : hi);
  return {
    type: "rect" as const,
    silent: false,
    shape: {
      x: Math.max(plot.x, previous),
      y,
      width: Math.min(plot.x + plot.width, next) - Math.max(plot.x, previous),
      height: end - y,
    },
    style: { fill: "rgba(0,0,0,0)" },
  };
}
export function rangeAreaSeries(
  input: RangeAreaMappingInput,
  projection: RangeAreaProjection,
  text: RangeBarText,
): CustomSeriesOption[] {
  return projection.fields.flatMap((f, index) => {
    const visible: CustomSeriesOption = {
      type: "custom",
      silent: true,
      clip: true,
      data: [0],
      encode: { x: -1, y: -1 },
      tooltip: { show: false },
      renderItem: (params, api) => {
        if (!f.enabled || !input.style.valueScale) return;
        const plot = params.coordSys as unknown as Plot;
        if (!(plot.width > 0 && plot.height > 0))
          throw Error("Invalid Cartesian plot.");
        finitePoints([
          [plot.x, plot.y],
          [plot.width, plot.height],
        ]);
        return {
          type: "group",
          $mergeChildren: false,
          silent: true,
          children: glyphs(input, projection, index, text, api.coord),
          clipPath: { type: "rect", shape: { ...plot } },
        };
      },
    };
    const targets: CustomSeriesOption = {
      type: "custom",
      name: f.descriptor.label,
      clip: true,
      dimensions: ["slot"],
      encode: { x: 0, y: -1, tooltip: [] },
      data: [...f.data].reverse().map((d) => ({
        value: [d.groupSlot],
        metadata: { fieldId: f.descriptor.id, groupSlot: d.groupSlot },
      })),
      renderItem: (params, api) => {
        if (!f.enabled || !input.style.valueScale) return;
        const slot = f.data.length - 1 - params.dataIndex;
        return hit(
          input,
          projection,
          index,
          slot,
          params.coordSys as unknown as Plot,
          api.coord,
        );
      },
    };
    return [visible, targets];
  });
}
export function preflightRangeArea(
  input: RangeAreaMappingInput,
  projection: RangeAreaProjection,
  text: RangeBarText,
): void {
  const p = input.context.plot;
  for (const s of Object.values(input.style.fields))
    finitePoints([
      [
        s.label.spacing + s.label.padding + p.height,
        s.marker.size + s.marker.strokeWidth + p.width,
      ],
      [
        s.shadow.blur + Math.abs(s.shadow.xOffset) + p.width,
        Math.abs(s.shadow.yOffset) + p.height,
      ],
      [
        s.lineDash.reduce((a, b) => a + b, Math.abs(s.lineDashOffset)),
        s.strokeWidth + p.width,
      ],
    ]);
  if (!input.style.valueScale) return;
  const [min, max] = rangeTransport(input);
  const [a, b] = rangeCategoryDomain(input, projection.groups.length);
  const coord: Coord = (data) => {
    if (!Array.isArray(data)) throw Error("Expected pair.");
    return [
      p.left + ((Number(data[0]) - a) / (b - a)) * p.width,
      p.top + (1 - (Number(data[1]) - min) / (max - min)) * p.height,
    ];
  };
  projection.fields.forEach((f, i) => {
    if (f.enabled) glyphs(input, projection, i, text, coord);
  });
}
