import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateCombo } from "../../../src/components/General/Table/Chart/echarts/combo";
import {
  applicationStyle,
  mappingContext,
} from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      measureText: (s: string) => ({ width: s.length * 6 }),
    } as any),
);
it.each(["category", "number", "time"])(
  "renders mixed %s coordinates with independent financial scales",
  (type) => {
    const { application, series, line, ...common } = applicationStyle();
    const { axes, series: effective, ...shared } = application;
    axes.category.fields.type = type;
    effective.shadow.enabled = false;
    const ids = ["bars", "area", "line"];
    const input: any = {
      snapshot: {
        ...validSnapshotInput,
        columns: ids.map((id) => ({
          id,
          label: id,
          role: "number",
          unit: id === "line" ? "USD/share" : "USD",
          scale: 1,
        })),
        selectedColumnIds: ids,
        rows: [0, 1, 2].map((i) => ({
          id: String(i),
          category:
            type === "category"
              ? "Repeated"
              : type === "number"
                ? i * 10
                : `2026-10-${10 + i}`,
          values: { bars: 1000 * (i + 1), area: 500 * (i + 1), line: i + 1 },
        })),
      },
      assignments: [
        { colId: "bars", chartType: "groupedColumn" },
        { colId: "area", chartType: "area" },
        { colId: "line", chartType: "line", secondaryAxis: true },
      ],
      style: {
        common,
        application: shared,
        axes: {
          category: axes.category,
          primary: axes.number,
          secondary: {
            line: {
              ...axes.number,
              fields: { ...axes.number.fields, position: "right" },
            },
          },
        },
        geometry: Object.fromEntries(
          ["bar", "area", "line"].map((g) => [
            g,
            { series: effective, overrides: {} },
          ]),
        ),
      },
      context: mappingContext(),
    };
    const result = translateCombo(input);
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw Error(JSON.stringify(result));
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 800,
      height: 500,
    });
    try {
      chart.setOption({ ...result.options, animation: false });
      const model = (chart as any).getModel();
      const natives = model.getSeries();
      const bar = natives.find((s: any) => s.id === "bars");
      const area = natives.find((s: any) => s.id === "area");
      const line = natives.find((s: any) => s.id === "line");
      const xs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const rect = bar.getData().getItemLayout(i);
        const areaPoints = area.getData().getLayout("points");
        const linePoints = line.getData().getLayout("points");
        expect(rect.x + rect.width / 2).toBeCloseTo(areaPoints[i * 2], 3);
        expect(linePoints[i * 2]).toBeCloseTo(areaPoints[i * 2], 3);
        xs.push(linePoints[i * 2]);
        const expected = chart.convertToPixel(
          { seriesIndex: line.seriesIndex },
          [line.option.data[i][0], i + 1],
        ) as number[];
        expect(linePoints[i * 2 + 1]).toBeCloseTo(expected[1], 3);
        const primary = chart.convertToPixel({ seriesIndex: bar.seriesIndex }, [
          bar.option.data[i][0],
          1000 * (i + 1),
        ]) as number[];
        expect(rect.y + Math.min(rect.height, 0)).toBeCloseTo(primary[1], 3);
      }
      expect(xs[0]).toBeLessThan(xs[1]);
      expect(xs[1]).toBeLessThan(xs[2]);
      expect(
        line.coordinateSystem.getAxis("y").scale.getExtent()[1],
      ).toBeLessThan(10);
      expect(
        bar.coordinateSystem.getAxis("y").scale.getExtent()[1],
      ).toBeGreaterThanOrEqual(3000);
      const fill = natives.find((s: any) =>
        s.id.startsWith("openbb-area-fill-area-"),
      );
      const points = fill.getData().getLayout("points");
      for (let i = 0; i < 3; i++) expect(points[i * 2]).toBeCloseTo(xs[i], 3);
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  },
);
