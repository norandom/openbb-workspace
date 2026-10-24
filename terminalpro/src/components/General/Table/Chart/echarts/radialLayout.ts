import type { RadialMappingInput } from "../compatibility/radialContracts";
import { measureText } from "./cartesianLayout";
import { linearRawTicks, niceLinearExtent } from "./linearTicks";
import { barLegendSize, prepareBarLayout } from "./radialBarLayout";
import {
  finite,
  radialData,
  type RadialData,
  type RadialObservation,
} from "./radialData";
import type {
  PrepareRadialModel,
  RadialAxisAnchor,
  RadialBarMark,
  RadialColumnMark,
} from "./radialModel";
import {
  bands,
  barDomain,
  categoryGridRadii,
  columnTickDensity,
  columnWidth,
  connected,
  convert,
  modulo,
  radialAxisStrokes,
  TOP,
  TURN,
} from "./radialScale";
function padding(input: RadialMappingInput, data: RadialData) {
  const app = input.style.application;
  const p = { ...app.padding };
  for (const c of [app.title, app.subtitle]) {
    if (c.enabled && c.text) p.top += measureText(c.text, c).height + c.spacing;
  }
  if (app.legend.enabled) {
    const side = app.legend.position as keyof typeof p;
    const size =
      side === "left" || side === "right"
        ? Math.max(
            0,
            ...data.series.map(
              (s) =>
                measureText(
                  String(input.context.display.legend(s.label)),
                  app.legend,
                ).width,
            ),
          ) + 30
        : app.legend.size;
    p[side] +=
      (input.family === "radialBar"
        ? (barLegendSize(input, data) ?? size)
        : size) + app.legend.spacing;
  }
  return p;
}
function geometry(input: RadialMappingInput, data: RadialData) {
  const { category, numerical } = input.style.axes;
  const p = padding(input, data);
  const categoryRoom = Math.max(
    0,
    ...data.categories.map(
      (c) =>
        measureText(String(input.context.display.category(c)), category.labels)
          .width /
          2 +
        22,
    ),
  );
  const numericalRoom = Math.max(
    ...data.extent.map(
      (v) =>
        measureText(String(input.context.numericAxisLabel(v)), numerical.labels)
          .width /
          2 +
        22,
    ),
    measureText("0123456789", numerical.labels).height + 22,
  );
  const room = Math.max(12, categoryRoom, numericalRoom);
  const width = Math.max(
    0,
    finite(input.context.viewport.width) - p.left - p.right,
  );
  const height = Math.max(
    0,
    finite(input.context.viewport.height) - p.top - p.bottom,
  );
  const radius = finite(Math.max(0, Math.min(width, height) / 2 - room));
  const ratio =
    input.family === "radialColumn"
      ? numerical.innerRadiusRatio
      : category.innerRadiusRatio;
  if (ratio < 0 || ratio > 1 || !Number.isFinite(ratio) || radius > 1000000)
    throw Error("Invalid radial pixel bounds.");
  return {
    center: [finite(p.left + width / 2), finite(p.top + height / 2)] as [
      number,
      number,
    ],
    radius,
    hole: radius * ratio,
  };
}
type Geometry = ReturnType<typeof geometry>;
function scale(input: RadialMappingInput, data: RadialData, g: Geometry) {
  const density =
    input.family === "radialBar"
      ? {
          tickCount: 8,
          minTickCount: 0,
          maxTickCount: Number.POSITIVE_INFINITY,
        }
      : columnTickDensity(g.radius - g.hole);
  const domain =
    input.family === "radialBar"
      ? barDomain(data.extent)
      : data.extent[0] === data.extent[1]
        ? data.extent
        : niceLinearExtent(data.extent, density);
  finite(domain[1] - domain[0]);
  return { domain, ticks: linearRawTicks(domain, density) };
}
type Scale = ReturnType<typeof scale>;
function point(angle: number, radius: number) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
function groups(input: RadialMappingInput, data: RadialData) {
  const visible = data.series.filter((s) => s.visible);
  return {
    count: input.groupType === "grouped" ? visible.length : 1,
    index: (id: string) =>
      input.groupType === "grouped" ? visible.findIndex((s) => s.id === id) : 0,
  };
}
function columnBand(
  input: RadialMappingInput,
  data: RadialData,
  group: ReturnType<typeof groups>,
) {
  const span =
    (TURN / Math.max(1, data.categories.length)) *
    (1 - input.style.axes.category.paddingInner);
  return bands(
    -span / 2,
    span / 2,
    group.count,
    input.style.axes.category.groupPaddingInner,
  );
}
function columnMark(
  input: RadialMappingInput,
  observation: RadialObservation,
  g: Geometry,
  s: Scale,
  band: ReturnType<typeof bands>,
  groupIndex: number,
  count: number,
): RadialColumnMark | undefined {
  if (g.radius === 0 || g.radius === g.hole || band.width <= 0)
    return undefined;
  const ray = TOP + (observation.rowIndex * TURN) / count;
  const start = count === 1 ? TOP : ray + band.origin(groupIndex);
  const end = count === 1 ? TOP + TURN : start + band.width;
  const width = columnWidth(
    start,
    end,
    g.radius,
    input.style.column?.columnWidthRatio,
    input.style.column?.maxColumnWidthRatio,
  );
  if (!Number.isFinite(width) || width > 1000000)
    throw Error("Invalid radial column width.");
  if (width <= 0) return undefined;
  const startRadius = convert(
    observation.startValue,
    s.domain,
    g.hole,
    g.radius,
  );
  const endRadius = convert(observation.endValue, s.domain, g.hole, g.radius);
  const connectBaseline = connected(startRadius, g.hole, width);
  const label = point(start + band.width / 2, (startRadius + endRadius) / 2);
  return {
    ...observation,
    kind: "column",
    startRadius: connectBaseline ? g.hole : startRadius,
    endRadius,
    width,
    connectBaseline,
    rotation: modulo(start + modulo(end - start) / 2 + Math.PI / 2),
    labelX: label.x,
    labelY: label.y,
  };
}
function barMark(
  observation: RadialObservation,
  g: Geometry,
  s: Scale,
  category: ReturnType<typeof bands>,
  group: ReturnType<typeof bands>,
  groupIndex: number,
): RadialBarMark | undefined {
  if (g.radius === 0 || g.radius === g.hole || group.width <= 0)
    return undefined;
  const innerRadius =
    g.radius +
    g.hole -
    category.origin(observation.rowIndex) +
    group.origin(groupIndex);
  const outerRadius = innerRadius + group.width;
  const a = convert(observation.startValue, s.domain, TOP, TOP + TURN);
  const b = convert(observation.endValue, s.domain, TOP, TOP + TURN);
  const startAngle = Math.min(a, b);
  const endAngle = Math.max(a, b);
  const label = point(
    startAngle + modulo(endAngle - startAngle) / 2,
    (innerRadius + outerRadius) / 2,
  );
  return {
    ...observation,
    kind: "bar",
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    labelX: label.x,
    labelY: label.y,
  };
}
function prepareSeries(
  input: RadialMappingInput,
  data: RadialData,
  g: Geometry,
  s: Scale,
) {
  const group = groups(input, data);
  const column = columnBand(input, data, group);
  const a = input.style.axes.category;
  const category = bands(
    g.radius,
    g.hole,
    data.categories.length,
    a.paddingInner,
    a.paddingOuter,
  );
  const ring = bands(
    0,
    Math.abs(category.width),
    group.count,
    a.groupPaddingInner,
  );
  return data.series.map((series) => ({
    ...series,
    marks: series.marks.flatMap((observation) => {
      const mark =
        input.family === "radialColumn"
          ? columnMark(
              input,
              observation,
              g,
              s,
              column,
              group.index(series.id),
              data.categories.length,
            )
          : barMark(observation, g, s, category, ring, group.index(series.id));
      return mark ? [mark] : [];
    }),
  }));
}
function axisLabels(
  input: RadialMappingInput,
  data: RadialData,
  g: Geometry,
  s: Scale,
) {
  let categoryLabels: RadialAxisAnchor[];
  let numericalLabels: RadialAxisAnchor[];
  if (input.family === "radialColumn") {
    categoryLabels = data.categories.map((value, i) => {
      const angle = (i * TURN) / data.categories.length;
      return { value, ...point(TOP + angle, g.radius + 22), angle };
    });
    numericalLabels = s.ticks.map((value) => ({
      value,
      x: -10,
      y: -convert(value, s.domain, g.hole, g.radius),
    }));
  } else {
    const a = input.style.axes.category;
    const category = bands(
      g.radius,
      g.hole,
      data.categories.length,
      a.paddingInner,
      a.paddingOuter,
    );
    categoryLabels = data.categories.map((value, i) => ({
      value,
      x: -10,
      y: -(
        g.radius +
        g.hole -
        category.origin(i) +
        Math.abs(category.width) / 2
      ),
    }));
    numericalLabels = s.ticks
      .filter(
        (value, i) =>
          i === 0 || s.domain[0] === s.domain[1] || value !== s.domain[1],
      )
      .map((value) => {
        const angle = convert(value, s.domain, 0, TURN);
        return { value, ...point(TOP + angle, g.radius + 22), angle };
      });
  }
  return { categoryLabels, numericalLabels };
}
function validate(input: RadialMappingInput) {
  if (
    !["radialColumn", "radialBar"].includes(input.family) ||
    !["grouped", "stacked", "normalized"].includes(input.groupType)
  )
    throw Error("Invalid radial family or grouping.");
  const axis = input.style.axes.category;
  for (const value of [
    axis.paddingInner,
    axis.groupPaddingInner,
    axis.paddingOuter,
  ]) {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw Error("Invalid radial band padding.");
  }
  if (input.family === "radialColumn") {
    if (!input.style.column) throw Error("Missing radial Column ratios.");
    for (const value of Object.values(input.style.column)) {
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw Error("Invalid radial Column ratio.");
    }
  }
}
export const prepareRadialModel: PrepareRadialModel = (input) => {
  validate(input);
  const data = radialData(input);
  const initial = geometry(input, data);
  const s = scale(input, data, initial);
  const p = padding(input, data);
  const fitted =
    input.family === "radialBar"
      ? prepareBarLayout(input, data, s.domain, s.ticks, {
          x: p.left,
          y: p.top,
          width: Math.max(0, input.context.viewport.width - p.left - p.right),
          height: Math.max(0, input.context.viewport.height - p.top - p.bottom),
        })
      : null;
  const g = fitted
    ? {
        center: [...fitted.center] as [number, number],
        radius: fitted.radius,
        hole: fitted.hole,
      }
    : initial;
  return {
    center: g.center,
    outerRadius: g.radius,
    holeRadius: g.hole,
    ...s,
    numericalGridRadii:
      input.family === "radialColumn"
        ? s.ticks
            .filter((value) => value !== s.domain[1])
            .sort((a, b) => b - a)
            .map((value) => convert(value, s.domain, g.hole, g.radius))
        : [],
    categoryGridRadii:
      input.family === "radialBar"
        ? categoryGridRadii(
            g.radius,
            g.hole,
            data.categories.length,
            input.style.axes.category.paddingInner,
            input.style.axes.category.paddingOuter,
          )
        : [],
    ...(fitted
      ? {
          categoryLabels: fitted.categoryLabels,
          numericalLabels: fitted.numericalLabels,
        }
      : axisLabels(input, data, g, s)),
    series: prepareSeries(input, data, g, s),
    axisStrokes: radialAxisStrokes(input, g.radius, g.hole),
  };
};
