import { type Axis, type ComponentModel, type ComponentView, graphic, use, type XAXisComponentOption } from "echarts";
import { measureText } from "./cartesianLayout";

export interface HistogramAxisLabelPolicy {
  readonly formatter: (value: number) => string;
  readonly font: Parameters<typeof measureText>[1];
  readonly paddingRight: number;
}
export type HistogramLabelAxisOption = XAXisComponentOption & {
  readonly openbbHistogramLabels?: HistogramAxisLabelPolicy;
};
type HistogramAxisModel = ComponentModel<HistogramLabelAxisOption> & {
  readonly axis: Axis & { toGlobalCoord(value: number): number };
};
type ZoomModel = ComponentModel & {
  eachTargetAxis(callback: (dimension: string, index: number) => void): void;
  getPercentRange(): number[];
};
const hiddenLabels = new WeakMap<ComponentView, Map<InstanceType<typeof graphic.Text>, boolean>>();

function fullRange(ecModel: ComponentModel["ecModel"]): boolean {
  let full = true;
  ecModel.eachComponent("dataZoom", component => {
    const zoom = component as ZoomModel;
    zoom.eachTargetAxis((dimension, index) => {
      if (dimension !== "x" || index !== 0) return;
      const [start, end] = zoom.getPercentRange();
      if (start !== 0 || end !== 100) full = false;
    });
  });
  return full;
}

function suppressedTicks(model: HistogramAxisModel, full: boolean): number[] {
  const policy = model.option.openbbHistogramLabels;
  if (!policy || model.componentIndex !== 0 || (model.get("gridIndex") ?? 0) !== 0 || model.axis.type !== "value") return [];
  const axis = model.axis;
  if (model.option.show === false || axis.scale.isBlank()) return [];
  const ticks = axis.scale.getTicks();
  if (ticks.length <= 2) return [];
  const last = ticks[ticks.length - 1].value;
  const width = measureText(policy.formatter(last), policy.font).width;
  const end = Math.max(...axis.getExtent());
  if (axis.dataToCoord(last) + width / 2 > end + policy.paddingRight) {
    return full ? [ticks[0].value, last] : [last];
  }
  return [];
}

use(registers => {
  registers.registerUpdateLifecycle("afterupdate", (ecModel, api) => {
    const model = ecModel.getComponent("xAxis", 0) as HistogramAxisModel | undefined;
    if (!model) return;
    const view = api.getViewOfComponentModel(model);
    hiddenLabels.get(view)?.forEach((invisible, text) => text.attr("invisible", invisible));
    const hidden = new Map<InstanceType<typeof graphic.Text>, boolean>();
    hiddenLabels.set(view, hidden);
    const policy = model.option.openbbHistogramLabels;
    if (!policy) return;
    const suppressed = suppressedTicks(model, fullRange(ecModel)).map(value => ({
      text: policy.formatter(value), x: model.axis.toGlobalCoord(model.axis.dataToCoord(value)),
    }));
    // ECharts builds cached labels before layout extensions; change only the final drawing flag.
    view.group.traverse(element => {
      if (!(element instanceof graphic.Text)) return;
      element.getComputedTransform();
      const x = element.transformCoordToGlobal(0, 0)[0];
      if (suppressed.some(label => label.text === element.style.text && Math.abs(label.x - x) < 1e-6)) {
        hidden.set(element, element.invisible);
        element.attr("invisible", true);
      }
    });
  });
});
