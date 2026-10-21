import type { LegendComponentOption } from "echarts";
import { escapeHtml, fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { markerSymbol } from "./cartesianMarkers";
import type {
  PieLegendItem,
  PieLegendPagination,
  PieLegendRect,
} from "./pieLegendTypes";
import type { PieMappingInput, PieRing } from "./pieTypes";

interface Cell {
  readonly key: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}
interface GridPage {
  readonly items: readonly PieLegendItem[];
  readonly width: number;
  readonly height: number;
}
const prefix = "openbb-pie-legend-";
const pagerFont = {
  font: "Verdana, sans-serif",
  size: 12,
  fontWeight: 400,
  fontStyle: undefined,
};

function page(
  cells: readonly Cell[],
  columns: number,
  rows: number,
  horizontal: boolean,
  gapX: number,
  gapY: number,
  offset: number,
): GridPage {
  const count = Math.min(cells.length, columns * rows);
  const widths = Array.from({ length: columns }, () => 0);
  const heights = Array.from({ length: rows }, () => 0);
  const indices = (i: number) =>
    horizontal
      ? [i % columns, Math.floor(i / columns)]
      : [Math.floor(i / rows), i % rows];
  cells.slice(0, count).forEach((cell, i) => {
    const [x, y] = indices(i);
    widths[x] = Math.max(widths[x], Math.ceil(cell.width + gapX));
    heights[y] = Math.max(heights[y], Math.ceil(cell.height + gapY));
  });
  const sum = (values: number[], end = values.length) =>
    values.slice(0, end).reduce((a, b) => a + b, 0);
  return {
    width: Math.max(0, sum(widths) - gapX),
    height: Math.max(0, sum(heights) - gapY),
    items: cells.slice(0, count).map((cell, i) => {
      const [x, y] = indices(i);
      return {
        key: cell.key,
        label: cell.label,
        legendId: `${prefix}item-${offset + i}`,
        bounds: {
          x: sum(widths, x),
          y: sum(heights, y),
          width: cell.width,
          height: cell.height,
        },
      };
    }),
  };
}
function pack(
  cells: readonly Cell[],
  width: number,
  height: number,
  input: PieMappingInput,
): GridPage[] | undefined {
  const l = input.style.application.legend;
  const bounds = input.style.legendLayout;
  const force = bounds.maxHeight !== undefined && bounds.maxWidth !== undefined;
  const horizontal = l.position === "top" || l.position === "bottom";
  const pages: GridPage[] = [];
  let offset = 0;
  while (offset < cells.length) {
    const rest = cells.slice(offset).map((cell) => ({
      ...cell,
      width: Math.min(cell.width, Math.max(0, width - l.horizontalSpacing)),
    }));
    const rowHeight = Math.max(...rest.map((c) => c.height)) + l.verticalSpacing;
    if (height < rowHeight && !force) return;
    const rowCount = Math.max(1, Math.floor(height / rowHeight));
    let columns = horizontal
      ? rest.length
      : Math.max(1, Math.ceil(rest.length / rowCount));
    let candidate: GridPage;
    do {
      candidate = page(
        rest,
        columns,
        Math.min(rowCount, Math.ceil(rest.length / columns)),
        horizontal,
        l.horizontalSpacing,
        l.verticalSpacing,
        offset,
      );
      if (candidate.width + l.horizontalSpacing <= width || columns === 1) break;
      columns--;
    } while (columns > 0);
    if (candidate!.width + l.horizontalSpacing > width && !force) return;
    pages.push(candidate!);
    offset += candidate!.items.length;
  }
  return pages;
}
function pagination(
  cells: readonly Cell[],
  width: number,
  height: number,
  input: PieMappingInput,
) {
  const l = input.style.application.legend;
  const vertical = l.position === "left" || l.position === "right";
  let footprint = 0;
  let pages: GridPage[] = [];
  let pagerWidth = 0;
  for (let pass = 0; pass < 11; pass++) {
    const packed = pack(
      cells,
      Math.max(0, width - (vertical ? 0 : footprint)),
      Math.max(0, height - (vertical ? footprint : 0)),
      input,
    );
    if (!packed) return;
    pages = packed;
    pagerWidth = measureText(`${pages.length} / ${pages.length}`, pagerFont).width + 40;
    const next = pages.length > 1 ? (vertical ? 23 : pagerWidth + 8) : 0;
    if (next === footprint) break;
    footprint = next;
  }
  const maxWidth = Math.max(...pages.map((p) => p.width), 0);
  const maxHeight = Math.max(...pages.map((p) => p.height), 0);
  return {
    pages,
    pagerWidth,
    width: maxWidth + (vertical ? 0 : footprint),
    height: maxHeight + (vertical ? footprint : 0),
    maxWidth,
    maxHeight,
  };
}
function pager(plan: PieLegendPagination, color: string) {
  const shown = plan.pages.length > 1;
  const { previousBounds: prev, nextBounds: next } = plan.pager;
  const arrow = (id: string, b: PieLegendRect, direction: -1 | 1) => ({
    id,
    type: "polygon" as const,
    invisible: !shown,
    silent: !shown || direction === -1,
    info: { kind: "pie-legend-page", direction, token: 0 },
    shape: {
      points:
        direction === -1
          ? [
              [b.x + b.width, b.y],
              [b.x, b.y + b.height / 2],
              [b.x + b.width, b.y + b.height],
            ]
          : [
              [b.x, b.y],
              [b.x + b.width, b.y + b.height / 2],
              [b.x, b.y + b.height],
            ],
    },
    style: { fill: color, opacity: direction === -1 ? 0.35 : 1 },
  });
  return [
    arrow(plan.pager.previousId, prev, -1),
    arrow(plan.pager.nextId, next, 1),
    {
      id: plan.pager.counterId,
      type: "text" as const,
      silent: true,
      invisible: !shown,
      x: prev.x + prev.width + 8,
      y: prev.y + prev.height / 2,
      style: {
        text: `1 / ${plan.pages.length}`,
        fill: color,
        fontFamily: pagerFont.font,
        fontSize: 12,
        verticalAlign: "middle" as const,
      },
    },
  ];
}
function components(
  input: PieMappingInput,
  rings: readonly PieRing[],
  plan?: PieLegendPagination,
): LegendComponentOption[] {
  const a = input.style.application;
  const l = a.legend;
  const data = rings.flatMap((r) => r.data);
  const selected = Object.fromEntries(data.map((d) => [d.name, d.enabled]));
  const common = { type: "plain" as const, selectedMode: true, selected };
  return [
    { ...common, id: `${prefix}canonical`, show: false, data: data.map((d) => d.name) },
    ...(plan?.pages.flatMap((p, index) =>
      p.items.map((item) => ({
        ...common,
        id: item.legendId,
        show: index === 0,
        data: [
          { name: item.key, icon: markerSymbol(input.style.legendLayout.markerShape) },
        ],
        formatter: () => item.label,
        tooltip: { show: true, formatter: () => escapeHtml(item.label) },
        left: item.bounds.x,
        top: item.bounds.y,
        padding: 0,
        itemGap: 0,
        itemWidth: l.markerSize,
        itemHeight: l.markerSize,
        textStyle: {
          ...fontStyle(l),
          padding: [0, 0, 0, l.itemSpacing - 5],
          ...(item.bounds.width <
          measureText(item.label, l).width + l.markerSize + l.itemSpacing
            ? {
                width: Math.max(0, item.bounds.width - l.markerSize - 5),
                overflow: "truncate" as const,
              }
            : {}),
        },
        itemStyle: { borderWidth: a.legendMarkerStrokeWidth },
      })),
    ) ?? []),
  ];
}
export function pieLegendLayout(
  input: PieMappingInput,
  rings: readonly PieRing[],
  captionSpace: number,
) {
  const a = input.style.application;
  const l = a.legend;
  const data = rings.flatMap((r) => r.data);
  if (!l.enabled || !data.length)
    return { legends: components(input, rings), graphic: [], width: 0, height: 0 };
  const v = input.context.viewport;
  const bounds = input.style.legendLayout;
  const width = Math.min(
    bounds.maxWidth ?? v.width,
    Math.max(0, v.width - a.padding.left - a.padding.right),
  );
  const height = Math.min(
    bounds.maxHeight ?? v.height,
    Math.max(0, v.height - a.padding.top - a.padding.bottom - captionSpace),
  );
  const cells = data.map((d) => {
    const box = measureText(d.legendText, l);
    return {
      key: d.name,
      label: d.legendText,
      // Original Legend.calcLayout bounds each item to 80% of available width before pagination.
      width: Math.min(
        box.width + l.markerSize + l.itemSpacing,
        Math.max(0, width * 0.8 - l.horizontalSpacing),
      ),
      height: Math.max(box.height, l.markerSize),
    };
  });
  const grid = pagination(cells, width, height, input);
  if (!grid)
    return { legends: components(input, rings), graphic: [], width: 0, height: 0 };
  const vertical = l.position === "left" || l.position === "right";
  const x = vertical
    ? l.position === "left"
      ? a.padding.left
      : v.width - a.padding.right - grid.width
    : a.padding.left + (v.width - a.padding.left - a.padding.right - grid.width) / 2;
  const y = vertical
    ? a.padding.top +
      captionSpace +
      (v.height - a.padding.top - a.padding.bottom - captionSpace - grid.height) / 2
    : l.position === "top"
      ? a.padding.top + captionSpace
      : v.height - a.padding.bottom - grid.height;
  const pagerX = x + (vertical ? 0 : grid.maxWidth + 8);
  const pagerY = y + (vertical ? grid.maxHeight + 8 : (grid.maxHeight - 15) / 2);
  const plan: PieLegendPagination = {
    canonicalLegendId: `${prefix}canonical`,
    pages: grid.pages.map((p) => ({
      anchorKey: p.items[0].key,
      items: p.items.map((item) => ({
        ...item,
        bounds: { ...item.bounds, x: item.bounds.x + x, y: item.bounds.y + y },
      })),
    })),
    pager: {
      previousId: `${prefix}previous`,
      nextId: `${prefix}next`,
      counterId: `${prefix}counter`,
      previousBounds: { x: pagerX, y: pagerY, width: 12, height: 15 },
      nextBounds: {
        x: pagerX + grid.pagerWidth - 12,
        y: pagerY,
        width: 12,
        height: 15,
      },
    },
  };
  return {
    legends: components(input, rings, plan),
    graphic: pager(plan, l.color),
    legendPagination: plan,
    width: grid.width,
    height: grid.height,
  };
}
