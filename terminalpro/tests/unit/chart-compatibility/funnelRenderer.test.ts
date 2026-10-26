import { graphic, init } from "echarts";
import { describe, expect, it } from "vitest";
import { translateFunnel } from "../../../src/components/General/Table/Chart/echarts/funnel";
import { funnelGeometry } from "../../../src/components/General/Table/Chart/echarts/funnelGeometry";
import {
  funnelNumericLabel,
  funnelStageLabels,
} from "../../../src/components/General/Table/Chart/echarts/funnelLabels";
import { fixture } from "./funnelFixture";

describe("inactive Funnel ECharts rendering", () => {
  it.each([
    "funnel",
    "coneFunnel",
    "pyramid",
  ] as const)("anchors %s stage labels toward the plot on either side and direction", (family) => {
    for (const direction of ["vertical", "horizontal"] as const)
      for (const placement of ["before", "after"] as const) {
        const base = fixture(family, [8, 4, 2]);
        const input = {
          ...base,
          style: {
            ...base.style,
            direction,
            seriesAreaPadding: { top: 20, bottom: 17, left: 15, right: 13 },
            stageLabel: { ...base.style.stageLabel, placement },
          },
        };
        const geometry = funnelGeometry(input);
        const unchanged = structuredClone(geometry);
        const numeric = funnelNumericLabel(input, geometry, 0);
        const labels = funnelStageLabels(input, geometry);
        expect(labels).toHaveLength(3);
        const area = geometry.stageLabelArea;
        for (const [index, group] of labels.entries()) {
          const text = group.children[0].style;
          const clip = group.clipPath.shape;
          if (direction === "vertical") {
            expect(text.align).toBe(placement === "before" ? "right" : "left");
            expect(text.verticalAlign).toBe("middle");
            expect(text.x).toBe(placement === "before" ? area.x + area.width : area.x);
            expect(text.y).toBe(geometry.positions[index][1]);
            expect(clip.x).toBe(area.x);
            expect(clip.width).toBe(area.width);
            expect(clip.y).toBe(area.y - 20);
            expect(clip.height).toBe(area.height + 37);
          } else {
            expect(text.align).toBe("center");
            expect(text.verticalAlign).toBe(placement === "before" ? "bottom" : "top");
            expect(text.y).toBe(placement === "before" ? area.y + area.height : area.y);
            expect(text.x).toBe(geometry.positions[index][0]);
            expect(clip.y).toBe(area.y);
            expect(clip.height).toBe(area.height);
            expect(clip.x).toBe(area.x - 15);
            expect(clip.width).toBe(area.width + 28);
          }
          expect(clip.x).toBeGreaterThanOrEqual(0);
          expect(clip.y).toBeGreaterThanOrEqual(0);
          expect(clip.x + clip.width).toBeLessThanOrEqual(input.context.viewport.width);
          expect(clip.y + clip.height).toBeLessThanOrEqual(
            input.context.viewport.height,
          );
        }
        expect(geometry).toEqual(unchanged);
        expect(funnelNumericLabel(input, geometry, 0)).toEqual(numeric);
        expect(numeric!.children[0].style).toMatchObject({
          align: "center",
          verticalAlign: "middle",
        });
      }
  });
  it("fits measured vertical Cone endpoint glyphs inside reserved axial padding", () => {
    const base = fixture("coneFunnel", [100, 80, 60, 40, 20]);
    const names = [
      "Revenue",
      "Gross profit",
      "Operating income",
      "Pretax income",
      "Net income",
    ];
    const input = {
      ...base,
      data: {
        ...base.data,
        stages: base.data.stages.map((stage, index) => ({
          ...stage,
          category: names[index],
        })),
      },
      style: {
        ...base.style,
        seriesAreaPadding: { top: 20, bottom: 20, left: 0, right: 0 },
      },
    };
    const geometry = funnelGeometry(input);
    const result = translateFunnel(input);
    if (result.status !== "supported") throw Error("unsupported");
    const labels = result.options.graphic as ReturnType<typeof funnelStageLabels>;
    expect(labels).toHaveLength(5);
    for (const [index, label] of labels.entries()) {
      const text = label.children[0].style;
      const bounds = new graphic.Text({ style: text }).getBoundingRect();
      const clip = label.clipPath.shape;
      expect(text.text).toBe(names[index]);
      expect(text.y).toBe(geometry.positions[index][1]);
      expect(bounds.x).toBeGreaterThanOrEqual(clip.x - 1e-8);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(clip.x + clip.width + 1e-8);
      expect(bounds.y).toBeGreaterThanOrEqual(clip.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(clip.y + clip.height);
    }
    expect(labels[0].children[0].style.y).toBe(geometry.plot.y);
    expect(labels.at(-1)!.children[0].style.y).toBe(
      geometry.plot.y + geometry.plot.height,
    );
    expect(labels[0].clipPath.shape.y).toBe(geometry.plot.y - 20);
  });
  it("uses actual engine hit testing for final/zero stages and leaves missing strips empty", () => {
    for (const family of ["funnel", "coneFunnel"] as const)
      for (const direction of ["vertical", "horizontal"] as const) {
        const i = fixture(family, [8, 0, null, -4, 2]);
        const input = { ...i, style: { ...i.style, direction } };
        const g = funnelGeometry(input);
        const result = translateFunnel(input);
        if (result.status !== "supported") throw Error("unsupported");
        const chart = init(null, undefined, {
          renderer: "svg",
          ssr: true,
          width: 600,
          height: 400,
        });
        try {
          chart.setOption(result.options);
          const data = (chart as any).getModel().getSeriesByIndex(0).getData();
          for (const [local, shape] of g.stages.entries()) {
            const box = shape.hitArea!;
            const hovered = chart
              .getZr()
              .handler.findHover(box.x + box.width / 2, box.y + box.height / 2).target;
            expect(hovered).toBeDefined();
            let ancestor: typeof hovered | typeof hovered.parent = hovered;
            const expected = data.getItemGraphicEl(local);
            while (ancestor && ancestor !== expected) ancestor = ancestor.parent;
            expect(ancestor).toBe(expected);
            expect(data.getId(local)).toBe(shape.rowId);
            expect(
              (result.options.tooltip as any).formatter({ dataIndex: local }),
            ).toContain(`Stage ${shape.index}`);
          }
          const p = g.positions[2];
          expect(chart.getZr().handler.findHover(p[0], p[1]).target).toBeUndefined();
        } finally {
          chart.dispose();
        }
      }
  });
  it("renders actual SVG with separate fonts, signed labels and explicit variant paint", () => {
    for (const family of ["funnel", "coneFunnel", "pyramid"] as const) {
      const i = fixture(
        family,
        family === "pyramid" ? [8, 4, null, 2] : [-8, 4, null, 2],
      );
      const result = translateFunnel(i);
      expect(result.status).toBe("supported");
      if (result.status !== "supported") throw Error("unsupported");
      const chart = init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 600,
        height: 400,
      });
      try {
        chart.setOption(result.options);
        const svg = chart.renderToSVGString();
        expect(svg).toContain("Stage 0");
        expect(svg).toContain(family === "pyramid" ? "8.00" : "-8.00");
        expect(svg).toContain('fill="#123456"');
        expect(svg).toContain("Arial");
        expect(svg).toContain("serif");
        expect(svg).toContain("clipPath");
        expect(svg).not.toMatch(/NaN|Infinity/);
        const option = result.options as any;
        expect(option.series[0].data.map((d: any) => d.id)).toEqual([
          "row0",
          "row1",
          "row3",
        ]);
        expect(option.tooltip.formatter({ dataIndex: 0 })).toContain(
          family === "pyramid" ? "8.00" : "-8.00",
        );
        expect(option.tooltip.formatter({ dataIndex: 2 })).toContain("Stage 3");
      } finally {
        chart.dispose();
      }
    }
  });
  it("updates independent label toggles, tooltip state and variant paints on the same engine", () => {
    const i = fixture();
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 600,
      height: 400,
    });
    try {
      for (const numeric of [false, true]) {
        const result = translateFunnel({
          ...i,
          style: {
            ...i.style,
            label: { ...i.style.label, enabled: numeric },
            stageLabel: { ...i.style.stageLabel, enabled: !numeric },
            paint: { ...i.style.paint, fills: ["#fedcba"] },
          },
        });
        if (result.status !== "supported") throw Error("unsupported");
        chart.setOption(result.options, { notMerge: true });
        const svg = chart.renderToSVGString();
        expect(svg.includes("8.00")).toBe(numeric);
        expect(svg.includes("Stage 0")).toBe(!numeric);
        expect(svg).toContain('fill="#fedcba"');
        expect(svg).not.toContain('fill="#ff0000"');
      }
      const result = translateFunnel({
        ...i,
        style: {
          ...i.style,
          application: {
            ...i.style.application,
            tooltip: { enabled: false, mode: "single" },
          },
        },
      });
      if (result.status !== "supported") throw Error("unsupported");
      expect((result.options.tooltip as any).formatter({ dataIndex: 0 })).toBe("");
    } finally {
      chart.dispose();
    }
  });
  it("rejects mismatched families, nonfinite dimensions and invalid paint", () => {
    const i = fixture();
    expect(
      translateFunnel({ ...i, style: { ...i.style, family: "coneFunnel" } }).status,
    ).toBe("invalid");
    expect(
      translateFunnel({
        ...i,
        context: {
          ...i.context,
          viewport: { width: Number.POSITIVE_INFINITY, height: 400 },
        },
      }).status,
    ).toBe("invalid");
    expect(
      translateFunnel({
        ...i,
        style: { ...i.style, paint: { ...i.style.paint, fills: [] } },
      }).status,
    ).toBe("invalid");
  });
});
