import {
  type Axis,
  ComponentModel,
  ComponentView,
  type EChartsOption,
  graphic,
  Model,
  use,
  type XAXisComponentOption,
} from "echarts";
import type {
  ResolvedApplicationAppearance,
  ResolvedApplicationAxis,
} from "../application/appearanceModel";

interface GridAxisStyle {
  readonly axis: "xAxis" | "yAxis";
  readonly width: number;
  readonly styles: ResolvedApplicationAxis["gridStyles"];
}
type GridOption = ComponentModel["option"] & {
  readonly axes: readonly GridAxisStyle[];
};
type RenderArgs = Parameters<ComponentView["render"]>;
type CartesianAxis = Axis & {
  toGlobalCoord(value: number): number;
  getGlobalExtent(ascending?: boolean): [number, number];
};
type CartesianModel = ComponentModel<XAXisComponentOption> & {
  readonly axis: CartesianAxis;
};
class CartesianGridModel extends ComponentModel<GridOption> {
  static type = "qopenbbGrid";
  static dependencies = ["grid", "xAxis", "yAxis"];
  static defaultOption = { z: 0, zlevel: 0, axes: [] };
}
function drawGrid(
  group: ComponentView["group"],
  model: CartesianModel,
  opposite: CartesianModel,
  spec: GridAxisStyle,
): void {
  const axis = model.axis;
  if (axis.scale.isBlank()) return;
  const split = model.getModel("splitLine");
  const endpoints = split.option as { showMinLine?: boolean; showMaxLine?: boolean };
  const tickModel = new Model(
    { ...split.option, show: true },
    split.parentModel,
    model.ecModel,
  );
  const ticks = axis.getTicksCoords({
    tickModel,
    breakTicks: "none",
    pruneByBreak: "preserve_extent_bound",
  });
  const [start, end] = opposite.axis.getGlobalExtent(true);
  let drawn = 0;
  ticks.forEach((tick, index) => {
    if (
      (index === 0 && endpoints.showMinLine === false) ||
      (index === ticks.length - 1 && endpoints.showMaxLine === false)
    )
      return;
    const position = axis.toGlobalCoord(tick.coord);
    const style = spec.styles[drawn++ % spec.styles.length];
    const shape =
      spec.axis === "xAxis"
        ? { x1: position, x2: position, y1: start, y2: end }
        : { x1: start, x2: end, y1: position, y2: position };
    group.add(
      new graphic.Line({
        subPixelOptimize: true,
        shape,
        style: {
          stroke: style.stroke,
          lineWidth: spec.width,
          lineDash: [...style.lineDash],
        },
        silent: true,
      }),
    );
  });
}
/** Public extension API supplies native axis ticks after layout, including zoom/resize.
 * This keeps alternating original dash arrays without inventing another tick scale. */
class CartesianGridView extends ComponentView {
  static type = "qopenbbGrid";
  render(model: RenderArgs[0], ecModel: RenderArgs[1]): void {
    this.group.removeAll();
    const options = (model as CartesianGridModel).option;
    for (const spec of options.axes) {
      const axis = ecModel.getComponent(spec.axis, 0) as CartesianModel;
      const opposite = ecModel.getComponent(
        spec.axis === "xAxis" ? "yAxis" : "xAxis",
        0,
      ) as CartesianModel;
      if (axis && opposite) drawGrid(this.group, axis, opposite, spec);
    }
  }
}
use((registers) => {
  registers.registerComponentModel(CartesianGridModel);
  registers.registerComponentView(CartesianGridView);
});
export function alternatingGrid(axis: ResolvedApplicationAxis): boolean {
  return axis.gridStyles.some(
    (style) =>
      JSON.stringify(style.lineDash) !== JSON.stringify(axis.gridStyles[0].lineDash),
  );
}
export function cartesianGrid(
  a: ResolvedApplicationAppearance,
): EChartsOption & { qopenbbGrid?: GridOption } {
  const horizontal =
    a.axes.category.fields.position === "top" ||
    a.axes.category.fields.position === "bottom";
  const axes = (["category", "number"] as const).flatMap((id) => {
    const axis = a.axes[id];
    if (!axis.grid.enabled || !alternatingGrid(axis)) return [];
    return [
      {
        axis: ((id === "category") === horizontal ? "xAxis" : "yAxis") as
          | "xAxis"
          | "yAxis",
        width: axis.grid.thickness,
        styles: axis.gridStyles,
      },
    ];
  });
  return axes.length ? { qopenbbGrid: { axes } } : {};
}
