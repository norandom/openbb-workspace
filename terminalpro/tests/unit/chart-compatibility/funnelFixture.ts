import type { FunnelRenderInput } from "../../../src/components/General/Table/Chart/application/funnelRenderTypes";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import type { FunnelFamily } from "../../../src/components/General/Table/Chart/compatibility/funnelContracts";
import { fallbackDisplay } from "../../../src/components/General/Table/Chart/echarts/cartesianDisplay";
import { buildFunnelData } from "../../../src/components/General/Table/Chart/echarts/funnelData";

export function fixture(
  family: FunnelFamily = "funnel",
  values: (number | null)[] = [8, 4],
): FunnelRenderInput {
  const p = projectOrdinarySetup(
    {
      stateAddress: "f",
      dataRevision: 1,
      sourceMode: "flat",
      originalModel: {},
      selectedRange: {},
      selectedColumnIds: ["c", "v"],
      categoryColumnId: "c",
      columns: [
        { id: "c", label: "Stage", role: "category" },
        { id: "v", label: "Level", role: "number" },
      ],
      rows: values.map((v, n) => ({
        id: `row${n}`,
        category: `Stage ${n}`,
        values: { v },
      })),
    },
    { categoryId: "c", seriesIds: ["v"], switchCategorySeries: false },
  );
  if (p.status !== "ready") throw Error("projection");
  const d = buildFunnelData(p.value, family);
  if (d.status !== "ready") throw Error("data");
  const font = {
    font: "Arial",
    size: 12,
    color: "#222",
    weight: "normal",
    fontWeight: "normal",
    fontStyle: "normal",
    enabled: true,
  };
  const caption = { ...font, enabled: false, text: "", spacing: 0 };
  const stroke = { strokeWidth: 0, strokeOpacity: 1, fillOpacity: 1, lineDash: [] };
  const shadow = { enabled: false, color: "#000", blur: 0, xOffset: 0, yOffset: 0 };
  const common = {
    application: {
      title: caption,
      subtitle: caption,
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      background: { visible: true, fill: "#fff" },
      tooltip: { enabled: true, mode: "single" },
      palette: { fills: ["#ff0000"], strokes: ["#ff0000"] },
    },
    direction: "vertical" as const,
    label: { ...font, placement: "center" as const, spacing: 0 },
    stageLabel: {
      ...font,
      font: "serif",
      size: 14,
      placement: "before" as const,
      spacing: 12,
    },
    series: stroke,
    paint: {
      family,
      fills: ["#123456", "#abcdef"],
      strokes: ["#345678"],
      numericLabelColor: "#222",
      stageLabelColor: "#222",
      dropOffFill: "#888",
      dropOffStroke: "#777",
    },
    seriesAreaPadding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const style =
    family === "funnel"
      ? {
          ...common,
          family,
          shadow,
          spacingRatio: 0.25,
          dropOff: { ...stroke, enabled: true, fill: "#888", stroke: "#777" },
        }
      : family === "pyramid"
        ? { ...common, family, shadow, reverse: false, spacing: 0 }
        : { ...common, family };
  return {
    data: d.value,
    style,
    context: { display: fallbackDisplay(2), viewport: { width: 600, height: 400 } },
  };
}
