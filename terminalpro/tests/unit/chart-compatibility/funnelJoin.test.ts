import { init } from "echarts";
import { describe, expect, it } from "vitest";
import { resolveFunnelAppearance } from "../../../src/components/General/Table/Chart/application/funnelAppearance";
import type { FunnelAppearanceInput } from "../../../src/components/General/Table/Chart/application/funnelAppearanceTypes";
import { mapFunnelEditorIntent } from "../../../src/components/General/Table/Chart/application/funnelEditor";
import type { FunnelEditIntent } from "../../../src/components/General/Table/Chart/application/funnelEditorTypes";
import type { FunnelFamily } from "../../../src/components/General/Table/Chart/compatibility/funnelContracts";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import type { RuntimeOptions } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import { translateFunnel } from "../../../src/components/General/Table/Chart/echarts/funnel";
import { funnelGeometry } from "../../../src/components/General/Table/Chart/echarts/funnelGeometry";
import { fixture } from "./funnelFixture";

// Retained FMP AAPL FY2026 Q2 reported USD levels, ended 2026-03-28.
// Source SHA256: 390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b.
const levels = [111184000000, 54781000000, 35885000000, 35833000000, 29578000000];

function joined(family: FunnelFamily) {
  const data = fixture(family, levels);
  let options: RuntimeOptions = { bar: { series: { strokeWidth: 9 } } };
  const appearance: FunnelAppearanceInput = {
    baseline: { stateAddress: "join", chartType: family, model: {}, options },
    generated: {},
    precision: 2,
    theme: {
      name: "join",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#222222",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#ffffff",
      },
      overrides: {},
      palette: { fills: ["#123456"], strokes: ["#345678"] },
    },
    themePaint: data.style.paint,
  };
  const current = () => {
    const resolved = resolveFunnelAppearance(
      { ...appearance, baseline: { ...appearance.baseline, options } },
      family,
    );
    if (!resolved.valid) throw Error(resolved.error);
    return { ...data, style: resolved.value };
  };
  const edit = (intent: FunnelEditIntent) => {
    const patch = mapFunnelEditorIntent(current().style, intent);
    if (!patch.valid) throw Error(patch.error);
    const storage = reduceIntegratedState({
      storage: {},
      stateKey: "join",
      currentModel: {},
      resolvedOptions: options,
      eventOptions: patch.value.eventOptions,
      chartType: family,
      totalSeries: 1,
      isPivotMode: false,
    });
    options = (storage.join as { chartModel: { chartOptions: RuntimeOptions } })
      .chartModel.chartOptions;
    expect(options.bar).toEqual({ series: { strokeWidth: 9 } });
  };
  return { current, edit };
}

describe("Funnel data, editor, reducer and ECharts join", () => {
  it.each([
    "funnel",
    "coneFunnel",
    "pyramid",
  ] as const)("%s applies independent label edits to rendered retained-FMP levels", (family) => {
    const scene = joined(family);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 600,
      height: 400,
    });
    const render = () => {
      const result = translateFunnel(scene.current());
      if (result.status !== "supported") throw Error("Unsupported join");
      chart.setOption(result.options, { notMerge: true });
      const svg = chart.renderToSVGString();
      expect(svg).not.toMatch(/NaN|Infinity/);
      const tooltip = result.options.tooltip as {
        formatter: (params: { dataIndex: number }) => string;
      };
      expect(tooltip.formatter({ dataIndex: 0 })).toContain("111184000000.00");
      expect(tooltip.formatter({ dataIndex: 4 })).toContain("29578000000.00");
      return svg;
    };
    try {
      scene.edit({ panel: "labels", edit: { field: "enabled", value: true } });
      scene.edit({
        panel: "stageLabels",
        edit: { field: "enabled", value: true },
      });
      const both = render();
      expect(both).toContain("Stage 0");
      expect(both).toContain("111184000000.00");
      scene.edit({
        panel: "stageLabels",
        edit: { field: "enabled", value: false },
      });
      const numericOnly = render();
      expect(numericOnly).not.toContain("Stage 0");
      expect(numericOnly).toContain("111184000000.00");
      scene.edit({ panel: "labels", edit: { field: "enabled", value: false } });
      expect(render()).not.toContain("111184000000.00");
      const vertical = funnelGeometry(scene.current());
      scene.edit({ panel: "funnelDirection", value: "horizontal" });
      const horizontal = funnelGeometry(scene.current());
      expect(horizontal.positions).not.toEqual(vertical.positions);
      render();
      if (family === "funnel") {
        expect(horizontal.stages.filter((stage) => stage.connector)).toHaveLength(4);
        scene.edit({
          panel: "funnelDropOff",
          edit: { field: "enabled", value: false },
        });
        const withoutDropOff = funnelGeometry(scene.current());
        expect(withoutDropOff.stages.filter((stage) => stage.connector)).toHaveLength(
          0,
        );
        expect(withoutDropOff.stages).toHaveLength(5);
        render();
      }
    } finally {
      chart.dispose();
    }
  });
});
