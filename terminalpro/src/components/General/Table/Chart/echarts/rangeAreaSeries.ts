import type { CustomSeriesOption, CustomSeriesRenderItemAPI } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { markerDimensions, markerSymbol } from "./cartesianMarkers";
import { rangeTransport } from "./rangeAreaAxes";
import {
  type AreaPlot,
  areaCategoryCoordinate,
  areaPoint,
  rangeAreaHit,
} from "./rangeAreaHit";
import { areaPaths, finitePoints, type Point, partition } from "./rangeAreaPaths";
import type {
  RangeAreaFieldStyle,
  RangeAreaMappingInput,
  RangeAreaProjection,
} from "./rangeAreaTypes";
import type { RangeBarText } from "./rangeBarTypes";
import { rangeCategoryTransport } from "./rangeCategoryCoordinates";
import type { RangeCategoryPlan } from "./rangeCategoryTypes";

type Coord = CustomSeriesRenderItemAPI["coord"];
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
  reverse: boolean,
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
      y: p[1] + ((i === 0) !== reverse ? d : -d),
      align: "center" as const,
      verticalAlign:
        ((i === 0) !== reverse) === outside ? ("top" as const) : ("bottom" as const),
    },
  }));
}
function glyphs(
  input: RangeAreaMappingInput,
  projection: RangeAreaProjection,
  index: number,
  text: RangeBarText,
  category: RangeCategoryPlan,
  coord: Coord,
) {
  const f = projection.fields[index];
  const s = input.style.fields[f.descriptor.id];
  const runs = partition(
    f.data
      .filter((d) => areaCategoryCoordinate(category, d.groupSlot) !== null)
      .map((d) => (d.summary ? d : null)),
    s.connectMissingData,
  );
  return runs.flatMap((run) => {
    const low = run.map((d) =>
      areaPoint(d.groupSlot, d.summary!.min, input, category, coord),
    );
    const high = run.map((d) =>
      areaPoint(d.groupSlot, d.summary!.max, input, category, coord),
    );
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
        ...labels(
          [low[i], high[i]],
          s,
          text.endpoints[index][d.groupSlot],
          input.style.valueScale?.reverse ?? false,
        ),
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
export function rangeAreaSeries(
  input: RangeAreaMappingInput,
  projection: RangeAreaProjection,
  text: RangeBarText,
  category: RangeCategoryPlan,
): CustomSeriesOption[] {
  return projection.fields.flatMap((f, index) => {
    const visible: CustomSeriesOption = {
      id: JSON.stringify([f.descriptor.id, "visible"]),
      name: f.descriptor.id,
      itemStyle: { color: input.style.fields[f.descriptor.id].fill },
      type: "custom",
      silent: true,
      clip: true,
      data: [0],
      encode: { x: -1, y: -1 },
      tooltip: { show: false },
      renderItem: (params, api) => {
        if (!f.enabled || !input.style.valueScale) return;
        const plot = params.coordSys as unknown as AreaPlot;
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
          children: glyphs(input, projection, index, text, category, api.coord),
          clipPath: { type: "rect", shape: { ...plot } },
        };
      },
    };
    const targets: CustomSeriesOption = {
      type: "custom",
      id: JSON.stringify([f.descriptor.id, "targets"]),
      name: f.descriptor.id,
      clip: true,
      dimensions: ["coordinate", "slot"],
      encode: { x: 0, y: -1, tooltip: [] },
      data: [...f.data].reverse().flatMap((d) => {
        const coordinate = areaCategoryCoordinate(category, d.groupSlot);
        return coordinate === null
          ? []
          : [
              {
                value: [coordinate, d.groupSlot],
                metadata: { fieldId: f.descriptor.id, groupSlot: d.groupSlot },
              },
            ];
      }),
      renderItem: (params, api) => {
        if (!f.enabled || !input.style.valueScale) return;
        const slot = api.value(1);
        if (typeof slot !== "number" || !Number.isInteger(slot))
          throw Error("Invalid Range Area slot metadata.");
        return rangeAreaHit(
          input,
          projection,
          index,
          slot,
          category,
          params.coordSys as unknown as AreaPlot,
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
  category: RangeCategoryPlan,
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
  const transport = rangeCategoryTransport(category);
  if (!input.style.valueScale || !transport) return;
  const [min, max] = rangeTransport(input);
  const [a, b] = transport;
  const coord: Coord = (data) => {
    if (!Array.isArray(data)) throw Error("Expected pair.");
    const x = (Number(data[0]) - a) / (b - a);
    const y = (Number(data[1]) - min) / (max - min);
    return [
      p.left + (category.reverse ? 1 - x : x) * p.width,
      p.top + (input.style.valueScale?.reverse ? y : 1 - y) * p.height,
    ];
  };
  projection.fields.forEach((f, i) => {
    if (!f.enabled) return;
    glyphs(input, projection, i, text, category, coord);
    f.data.forEach((d) =>
      rangeAreaHit(
        input,
        projection,
        i,
        d.groupSlot,
        category,
        { x: p.left, y: p.top, width: p.width, height: p.height },
        coord,
      ),
    );
  });
}
