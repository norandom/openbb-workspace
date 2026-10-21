import { graphic, init, type EChartsType } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { resolvePieAssignments } from "../../../src/components/General/Table/Chart/compatibility/pieAssignments";
import { translatePie } from "../../../src/components/General/Table/Chart/echarts/pie";
import type { PieMappingInput } from "../../../src/components/General/Table/Chart/echarts/pieTypes";
import {
  applicationStyle,
  mappingContext,
} from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";

const key = (column: string, row: number) =>
  `pie-item:${JSON.stringify([column, `r${row}`])}`;
const keys = [
  key("revenue", 0),
  key("revenue", 1),
  key("profit", 0),
  key("profit", 1),
];
const captions = ["Shared Q1", "Revenue Q2", "Shared Q1", "Profit Q2"];
const colors = ["#145da0", "#b33b32", "#145da0", "#b33b32"];
const canonicalId = "openbb-pie-legend-canonical";
const itemId = (index: number) => `openbb-pie-legend-item-${index}`;
const enabled = () => Object.fromEntries(keys.map((name) => [name, true]));

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as CanvasRenderingContext2D),
);

function legends(selected: Record<string, boolean>, page: number): any[] {
  const common = {
    type: "plain",
    selectedMode: true,
    selected: { ...selected },
  };
  return [
    { ...common, id: canonicalId, show: false, data: [...keys] },
    ...keys.map((name, index) => ({
      ...common,
      selected: { ...selected },
      id: itemId(index),
      show: Math.floor(index / 2) === page,
      data: [name],
      formatter: () => captions[index],
      left: 20 + (index % 2) * 160,
      top: 15,
      padding: 0,
      icon: "rect",
      itemWidth: 11,
      itemHeight: 11,
      textStyle: { fontFamily: "Arial", fontSize: 12 },
    })),
  ];
}

function nativeOptions(): any {
  return {
    animation: false,
    legend: legends(enabled(), 0),
    series: ["revenue", "profit"].flatMap((column, ring) => {
      const data = [0, 1].map((row) => ({
        name: key(column, row),
        value: ring === 0 ? [0.3, 0.7][row] : [0.1, 0.9][row],
        itemStyle: { color: colors[ring * 2 + row] },
      }));
      const main = {
        id: `pie-ring:${JSON.stringify(column)}`,
        type: "pie",
        center: [250, 230],
        radius: ring === 0 ? [100, 130] : [50, 80],
        animation: false,
        stillShowZeroSum: false,
        showEmptyCircle: false,
        label: { show: false },
        emphasis: { disabled: true },
        data,
      };
      return [
        main,
        {
          ...main,
          id: `${main.id}:sector-labels`,
          silent: true,
          data: data.map((datum) => ({
            ...datum,
            itemStyle: { color: "transparent" },
          })),
        },
      ];
    }),
  };
}

function projectionInput(selection: Record<string, boolean>): PieMappingInput {
  const { application, textColor, fontFamily, fontSize, precision } =
    applicationStyle();
  const { axes: _axes, series, ...shared } = application;
  const assignment = resolvePieAssignments({
    chartType: "donut",
    valueColumns: ["revenue", "profit"].map((colId) => ({
      colId,
      selected: true,
    })),
  });
  if (assignment.status !== "resolved") throw Error("Expected resolved rings");
  return {
    snapshot: {
      ...structuredClone(validSnapshotInput),
      selectedColumnIds: ["period", "revenue", "profit"],
      columns: [
        validSnapshotInput.columns[0],
        { id: "revenue", label: "Revenue", role: "number" },
        { id: "profit", label: "Profit", role: "number" },
      ],
      rows: [
        { id: "r0", category: "Q1", values: { revenue: 3, profit: 2 } },
        { id: "r1", category: "Q2", values: { revenue: 7, profit: 18 } },
      ],
    },
    assignment,
    style: {
      common: { textColor, fontFamily, fontSize, precision },
      application: {
        ...shared,
        title: { ...shared.title, enabled: false },
        subtitle: { ...shared.subtitle, enabled: false },
      },
      legendLayout: { maxHeight: 50, markerShape: "square" },
      series: {
        title: { ...series.labels, enabled: false, spacing: 5 },
        paint: { ...series, fillOpacity: 1 },
        rotation: 0,
        outerRadiusRatio: 1,
        calloutLabel: {
          ...series.labels,
          enabled: false,
          offset: 3,
          minAngle: 0,
        },
        calloutLine: { length: 10, strokeWidth: 2 },
        sectorLabel: {
          ...series.labels,
          enabled: true,
          positionRatio: 0.5,
          positionOffset: 0,
        },
      },
    },
    context: {
      ...mappingContext(),
      observations: { kind: "raw-observations" },
      viewport: { width: 600, height: 450 },
      legendSelection: selection,
    },
  };
}

function withChart(check: (chart: EChartsType) => void) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 450,
  });
  try {
    chart.setOption(nativeOptions());
    check(chart);
  } finally {
    chart.dispose();
  }
}

function legendModel(chart: EChartsType, id: string): any {
  return (chart as any)
    .getModel()
    .queryComponents({ mainType: "legend", id })[0];
}
function legendView(chart: EChartsType, id: string): any {
  return (chart as any).getViewOfComponentModel(legendModel(chart, id));
}
function selection(chart: EChartsType): Record<string, boolean> {
  return { ...(chart.getOption().legend as any[])[0].selected };
}
function rows(chart: EChartsType, seriesIndex: number): any[] {
  const data = (chart as any)
    .getModel()
    .getSeriesByIndex(seriesIndex)
    .getData();
  return Array.from({ length: data.count() }, (_, index) => ({
    name: data.getName(index),
    value: data.get("value", index),
    layout: data.getItemLayout(index),
    element: data.getItemGraphicEl(index),
  }));
}
function expectSelection(
  chart: EChartsType,
  expected: Record<string, boolean>,
) {
  for (const id of [canonicalId, ...keys.map((_, index) => itemId(index))]) {
    const model = legendModel(chart, id);
    expect(model.option.selected).toEqual(expected);
    for (const name of keys)
      expect(model.isSelected(name)).toBe(expected[name]);
  }
}
function expectRing(
  chart: EChartsType,
  seriesIndex: number,
  expected: [string, number][],
) {
  const actual = rows(chart, seriesIndex);
  expect(actual.map((row) => row.name)).toEqual(expected.map(([name]) => name));
  actual.forEach((row, index) => {
    expect(row.value).toBeCloseTo(expected[index][1]);
    expect(row.layout.endAngle - row.layout.startAngle).toBeCloseTo(
      expected[index][1] * Math.PI * 2,
    );
    expect(row.layout).toEqual(rows(chart, seriesIndex + 1)[index].layout);
    expect(rows(chart, seriesIndex + 1)[index].element.style.fill).toBe(
      "transparent",
    );
  });
}
function reproject(chart: EChartsType, page: number) {
  const selected = selection(chart);
  const result = translatePie(projectionInput(selected));
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  chart.setOption(
    { ...result.options, legend: legends(selected, page) },
    { notMerge: true },
  );
  expectSelection(chart, selected);
  expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
}

function hitTarget(chart: EChartsType, index: number): any {
  chart.getZr().storage.getDisplayList(true);
  const content = legendView(chart, itemId(index)).getContentGroup();
  expect(content.children()).toHaveLength(1);
  const targets = content
    .childAt(0)
    .children()
    .filter((child: any) => !child.silent);
  expect(targets).toHaveLength(1);
  expect(targets[0]).toBeInstanceOf(graphic.Rect);
  expect(targets[0].style.fill).toBe("transparent");
  return targets[0];
}
function clickLegend(chart: EChartsType, index: number) {
  const target = hitTarget(chart, index);
  const box = target.getBoundingRect();
  const [x, y] = target.transformCoordToGlobal(
    box.x + box.width / 2,
    box.y + box.height / 2,
  );
  const handler = (chart.getZr() as any).handler;
  const hovered = handler.findHover(x, y);
  expect(hovered.target).toBe(target);
  const event = vi.fn();
  chart.on("legendselectchanged", event);
  try {
    // Exercise the generated hit rectangle and native bubbling, including its installed action callback.
    handler.dispatchToElement(hovered, "click", { zrX: x, zrY: y });
    expect(event).toHaveBeenCalledTimes(1);
    expect(event.mock.calls[0][0].name).toBe(keys[index]);
    expect(event.mock.calls[0][0].selected).toEqual(selection(chart));
  } finally {
    chart.off("legendselectchanged", event);
  }
}
function expectPage(chart: EChartsType, page: number) {
  const display = chart.getZr().storage.getDisplayList(true);
  const hiddenIds = [
    canonicalId,
    ...keys.flatMap((_, index) =>
      Math.floor(index / 2) !== page ? [itemId(index)] : [],
    ),
  ];
  for (const id of hiddenIds) {
    const view = legendView(chart, id);
    expect(view.getContentGroup().children()).toHaveLength(0);
    view.group.traverse((element: any) =>
      expect(display).not.toContain(element),
    );
  }
  for (const index of [page * 2, page * 2 + 1]) hitTarget(chart, index);
  const svg = chart.renderToSVGString();
  expect(svg.match(/>Shared Q1<\/text>/g)).toHaveLength(1);
  expect(svg).toContain(page === 0 ? "Revenue Q2" : "Profit Q2");
  expect(svg).not.toContain(page === 0 ? "Profit Q2" : "Revenue Q2");
}

it("retains all enabled sectors with hidden canonical/page legends and uses the painted provider", () => {
  withChart((chart) => {
    expectSelection(chart, enabled());
    expectRing(chart, 0, [
      [keys[0], 0.3],
      [keys[1], 0.7],
    ]);
    expectRing(chart, 2, [
      [keys[2], 0.1],
      [keys[3], 0.9],
    ]);
    expectPage(chart, 0);
    for (const index of [0, 1]) {
      const item = legendView(chart, itemId(index))
        .getContentGroup()
        .childAt(0);
      expect(item.childAt(0).style.fill).toBe(colors[index]);
      const provider = (chart as any)
        .getModel()
        .getSeriesByIndex(0).legendVisualProvider;
      expect(
        provider.getItemVisual(provider.indexOfName(keys[index]), "style").fill,
      ).toBe(colors[index]);
    }
  });
});

it("synchronizes native hit clicks across all legends and reprojects duplicate captions independently on both pages", () => {
  withChart((chart) => {
    clickLegend(chart, 0);
    const first = { ...enabled(), [keys[0]]: false };
    expectSelection(chart, first);
    expect(rows(chart, 0).map((row) => row.name)).toEqual([keys[1]]);
    expect(rows(chart, 2).map((row) => row.name)).toEqual([keys[2], keys[3]]);
    reproject(chart, 0);
    expectRing(chart, 0, [[keys[1], 1]]);
    expectRing(chart, 2, [
      [keys[2], 0.1],
      [keys[3], 0.9],
    ]);
    clickLegend(chart, 0);
    reproject(chart, 0);
    expectSelection(chart, enabled());
    expectRing(chart, 0, [
      [keys[0], 0.3],
      [keys[1], 0.7],
    ]);
    clickLegend(chart, 1);
    reproject(chart, 1);
    expectPage(chart, 1);
    clickLegend(chart, 2);
    reproject(chart, 1);
    expectSelection(chart, {
      ...enabled(),
      [keys[1]]: false,
      [keys[2]]: false,
    });
    expectRing(chart, 0, [[keys[0], 1]]);
    expectRing(chart, 2, [[keys[3], 1]]);
    clickLegend(chart, 2);
    reproject(chart, 1);
    expectRing(chart, 2, [
      [keys[2], 0.1],
      [keys[3], 0.9],
    ]);
    reproject(chart, 0);
    expectPage(chart, 0);
    expectSelection(chart, { ...enabled(), [keys[1]]: false });
  });
});

it("renders a zero-total outline after disabling a ring and recovers a page-two key without filtering the other ring", () => {
  withChart((chart) => {
    clickLegend(chart, 0);
    reproject(chart, 1);
    clickLegend(chart, 2);
    reproject(chart, 1);
    clickLegend(chart, 3);
    reproject(chart, 1);
    expectSelection(chart, {
      ...enabled(),
      [keys[0]]: false,
      [keys[2]]: false,
      [keys[3]]: false,
    });
    expectRing(chart, 0, [[keys[1], 1]]);
    expectRing(chart, 2, []);
    const circles = () =>
      chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((element) => element instanceof graphic.Circle);
    expect(circles()).toHaveLength(1);
    expect(circles()[0].style).toMatchObject({ fill: "none", lineWidth: 1 });
    expect(circles()[0].shape.r).toBe(
      (chart.getOption().series as any[])[2].radius[1],
    );
    expectPage(chart, 1);
    clickLegend(chart, 3);
    reproject(chart, 1);
    expectSelection(chart, {
      ...enabled(),
      [keys[0]]: false,
      [keys[2]]: false,
    });
    expectRing(chart, 2, [[keys[3], 1]]);
    expectRing(chart, 0, [[keys[1], 1]]);
    expect(circles()).toHaveLength(0);
    expectPage(chart, 1);
  });
});
