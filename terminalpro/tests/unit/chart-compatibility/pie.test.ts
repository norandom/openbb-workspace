import { beforeEach, expect, it, vi } from "vitest";
import { resolvePieAssignments } from "../../../src/components/General/Table/Chart/compatibility/pieAssignments";
import { translatePie } from "../../../src/components/General/Table/Chart/echarts/pie";
import { companions, key, mains, pieInput, pieOptions } from "./pie.fixtures";

beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      measureText: (s: string) => ({ width: s.length * 6 }),
    } as CanvasRenderingContext2D),
);
it("normalizes independent raw ring totals and retains duplicate labels with distinct identity", () => {
  const options = pieOptions();
  mains(options).forEach((s, r) =>
    s.data.forEach((d: any, i: number) =>
      expect(d.value).toBeCloseTo(
        [
          [0.3, 0.7],
          [0.1, 0.9],
        ][r][i],
        14,
      ),
    ),
  );
  expect(options.legend.data.map((d: any) => d.name)).toEqual([
    key("revenue", "r0"),
    key("revenue", "r1"),
    key("profit", "r0"),
    key("profit", "r1"),
  ]);
  expect(options.legend.formatter(key("revenue", "r0"))).toBe(
    "Revenue - legend:A",
  );
  expect(mains(options)[0].data[0].metadata).toMatchObject({
    rawValue: 3,
    colId: "revenue",
    rowId: "r0",
    sourceRowIds: ["r0"],
    category: "A",
    descriptor: { scale: 1000 },
  });
  expect(companions(options)).toHaveLength(2);
  expect(options).not.toHaveProperty("grid");
  expect(options).not.toHaveProperty("xAxis");
  expect(options).not.toHaveProperty("dataZoom");
});
it("keeps zero/negative observations, omits missing ring values and preserves palette gaps", () => {
  const input = pieInput();
  input.style.application.palette.fills = ["red", "green", "blue"];
  input.snapshot.rows = [
    { id: "r0", category: "A", values: { revenue: 3, profit: null } },
    { id: "r1", category: "A", values: { revenue: null, profit: 2 } },
    { id: "r2", category: "A", values: { revenue: -2, profit: 0 } },
    { id: "r3", category: "A", values: { revenue: 0 } },
    { id: "r4", category: "A", values: { revenue: 7, profit: 8 } },
  ];
  const series = mains(pieOptions(input));
  expect(
    series[0].data.map((d: any) => [
      d.value,
      d.metadata.rawValue,
      d.metadata.paletteIndex,
    ]),
  ).toEqual([
    [0.3, 3, 0],
    [0, -2, 2],
    [0, 0, 3],
    [0.7, 7, 4],
  ]);
  expect(series[0].data.map((d: any) => d.itemStyle.color)).toEqual([
    "rgba(255,0,0,0.6)",
    "rgba(0,0,255,0.6)",
    "rgba(255,0,0,0.6)",
    "rgba(0,128,0,0.6)",
  ]);
  expect(series[1].data.map((d: any) => d.value)).toEqual([0.2, 0, 0.8]);
});
it("reprojects disabled observations independently without changing keys or raw data", () => {
  const input = pieInput();
  input.context.legendSelection = { [key("revenue", "r0")]: false };
  const options = pieOptions(input);
  mains(options).forEach((s, r) =>
    s.data.forEach((d: any, i: number) =>
      expect(d.value).toBeCloseTo(
        [
          [0, 1],
          [0.1, 0.9],
        ][r][i],
        14,
      ),
    ),
  );
  expect(options.legend.selected[key("revenue", "r0")]).toBe(false);
  expect(mains(options)[0].data[0].metadata.rawValue).toBe(3);
});
it("aggregates only when configured, preserving source IDs and rejecting overflow", () => {
  const input = pieInput();
  input.context.aggFunc = "sum";
  const options = pieOptions(input);
  expect(
    mains(options).map((s) => s.data.map((d: any) => d.metadata.rawValue)),
  ).toEqual([[10], [20]]);
  expect(mains(options)[0].data[0].metadata.sourceRowIds).toEqual(["r0", "r1"]);
  input.snapshot.rows.forEach((r) => {
    r.values.revenue = Number.MAX_VALUE;
  });
  expect(translatePie(input).status).toBe("invalid");
  delete input.context.aggFunc;
  expect(mains(pieOptions(input))[0].data.map((d: any) => d.value)).toEqual([
    0.5, 0.5,
  ]);
});
it("uses retained FMP quarterly USD observations with two separate denominators", () => {
  const input = pieInput();
  const revenue = [124300000000, 95359000000, 94036000000, 102466000000];
  const profit = [58275000000, 44867000000, 43718000000, 48341000000];
  input.snapshot.rows = revenue.map((value, i) => ({
    id: `q${i}`,
    category: `FY2025 Q${i + 1}`,
    values: { revenue: value, profit: profit[i] },
  }));
  mains(pieOptions(input)).forEach((s, ring) =>
    s.data.forEach((d: any, i: number) => {
      expect(d.metadata.rawValue).toBe([revenue, profit][ring][i]);
      expect(d.value).toBeCloseTo(
        [revenue, profit][ring][i] / [416161000000, 195201000000][ring],
        14,
      );
    }),
  );
});
it.each(["pie", "donut", "doughnut"] as const)(
  "accepts %s while requiring exact P1 assignments",
  (type) => {
    const input = pieInput(type);
    expect(mains(pieOptions(input))).toHaveLength(type === "pie" ? 1 : 2);
    input.assignment.assignments[0].colId = "profit";
    expect(translatePie(input).status).toBe("invalid");
  },
);
it("accepts empty numeric selection and rejects partial output on malformed or hostile input", () => {
  const input = pieInput();
  input.snapshot.selectedColumnIds = ["period"];
  input.assignment = resolvePieAssignments({
    chartType: "donut",
    valueColumns: [],
  }) as any;
  const options = pieOptions(input);
  expect(options.series).toEqual([]);
  expect(options.graphic).toEqual([]);
  expect(
    translatePie(
      new Proxy({} as any, {
        get() {
          throw Error("hostile");
        },
      }),
    ).status,
  ).toBe("invalid");
});
it.each([
  (i: any) => {
    i.style.series.calloutLine.colors = [];
  },
  (i: any) => {
    i.style.application.palette.fills = Array(2);
  },
  (i: any) => {
    i.style.series.calloutLabel.minAngle = 361;
  },
  (i: any) => {
    i.style.series.paint.fillOpacity = 2;
  },
  (i: any) => {
    i.style.series.sectorLabel.positionRatio = -1;
  },
  (i: any) => {
    i.context.viewport.width = Infinity;
  },
  (i: any) => {
    i.context.display.legend = "bad";
  },
  (i: any) => {
    i.snapshot.rows[0].values.revenue = NaN;
  },
  (i: any) => {
    i.assignment.assignments[0].ring.outerRadiusOffset = 1;
  },
])(
  "returns diagnostics without options for malformed admitted inputs",
  (patch) => {
    const input = pieInput();
    patch(input);
    const result = translatePie(input);
    expect(result.status).toBe("invalid");
    expect(result).not.toHaveProperty("options");
  },
);
it("captures display strings and metadata eagerly and survives later caller mutation", () => {
  const input = pieInput("pie");
  const label = vi.fn((v) => `label:${v}`),
    legend = vi.fn((v) => `<${v}>`);
  input.context.display.seriesLabel = label;
  input.context.display.legend = legend;
  const before = JSON.stringify(input),
    options = pieOptions(input),
    datum = mains(options)[0].data[0];
  expect(JSON.stringify(input)).toBe(before);
  const calls = [label.mock.calls.length, legend.mock.calls.length];
  input.snapshot.columns[1].label = "mutated";
  input.snapshot.rows[0].values.revenue = 999;
  input.style.series.sectorLabel.color = "red";
  input.context.display.legend = () => {
    throw Error("late");
  };
  expect(options.tooltip.formatter({ data: datum })).toBe(
    "&lt;A&gt;<br/>Revenue: 3",
  );
  expect(options.legend.formatter(datum.name)).toBe("<A>");
  expect(mains(options)[0].label.formatter({ data: datum })).toBe("label:A");
  expect(companions(options)[0].label.formatter({ data: datum })).toBe(
    "label:3",
  );
  expect([label.mock.calls.length, legend.mock.calls.length]).toEqual(calls);
  expect(datum.metadata.descriptor.label).toBe("Revenue");
  input.context.display.seriesLabel = () => {
    throw Error("format failure");
  };
  expect(translatePie(input).status).toBe("invalid");
});
it("honors scalar paint and escapes tooltip components without applying Cartesian precision", () => {
  const input = pieInput("pie");
  input.snapshot.rows[0].values.revenue = 1234.567;
  input.snapshot.columns[1].label = "Revenue <USD>";
  input.style.series.paint.fill = "#ff0000";
  input.style.series.paint.stroke = "#00ff00";
  const options = pieOptions(input),
    datum = mains(options)[0].data[0];
  expect(datum.itemStyle).toMatchObject({
    color: "rgba(255,0,0,0.6)",
    borderColor: "rgba(0,255,0,0.4)",
  });
  expect(options.tooltip.formatter({ data: datum })).toBe(
    `legend:A<br/>Revenue &lt;USD&gt;: ${(1234.567).toLocaleString()}`,
  );
});
it("accepts frozen inputs, preserves signed options and rejects thrown reads or assignment holes", () => {
  const input = pieInput();
  input.style.series.rotation = -450;
  input.style.series.sectorLabel.positionOffset = -10;
  function freeze(value: any) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(input);
  expect(translatePie(input).status).toBe("supported");
  const hostile = pieInput();
  Object.defineProperty(hostile.style.series, "rotation", {
    get() {
      throw Error("read");
    },
  });
  expect(translatePie(hostile).status).toBe("invalid");
  const sparse = pieInput();
  delete (sparse.assignment.assignments as any[])[0];
  expect(translatePie(sparse).status).toBe("invalid");
});
it("does not prefix one-field donut, missing titles or first-field pie legends", () => {
  const single = pieInput();
  single.snapshot.selectedColumnIds = ["period", "profit"];
  single.assignment = resolvePieAssignments({
    chartType: "donut",
    valueColumns: [{ colId: "profit", selected: true }],
  }) as any;
  expect(pieOptions(single).legend.formatter(key("profit", "r0"))).toBe(
    "legend:A",
  );
  const input = pieInput();
  input.snapshot.columns[1].label = "";
  expect(pieOptions(input).legend.formatter(key("revenue", "r0"))).toBe(
    "legend:A",
  );
  expect(
    pieOptions(pieInput("pie")).legend.formatter(key("revenue", "r0")),
  ).toBe("legend:A");
});
it("formats fiscal and numeric categories before adding their exact field title prefix", () => {
  const input = pieInput();
  input.snapshot.rows[0].category = "2024-12-28";
  input.snapshot.rows[1].category = 2025;
  input.context.display.legend = (v) =>
    typeof v === "number"
      ? `FY${v}`
      : /^\d{4}-/.test(String(v))
        ? "FY2025 Q1"
        : "wrong-input";
  const options = pieOptions(input);
  expect(options.legend.formatter(key("revenue", "r0"))).toBe(
    "Revenue - FY2025 Q1",
  );
  expect(options.legend.formatter(key("profit", "r1"))).toBe("Profit - FY2025");
  expect(options.tooltip.formatter({ data: mains(options)[0].data[0] })).toBe(
    "FY2025 Q1<br/>Revenue: 3",
  );
});

it.each(["single", "shared", "compact"])("freezes hovered-item tooltip contents for %s mode", mode => {
  const input = pieInput();
  input.style.application.tooltip.mode = mode;
  const options = pieOptions(input);
  const data = mains(options)[0].data[0];
  expect(data.tooltipText).toContain("Revenue: 3");
  expect(data.tooltipText.includes("legend:A<br/>")).toBe(mode !== "compact");
  expect(options.tooltip.trigger).toBe("item");
  input.style.application.tooltip.mode = mode === "compact" ? "single" : "compact";
  expect(data.tooltipText.includes("legend:A<br/>")).toBe(mode !== "compact");
});
