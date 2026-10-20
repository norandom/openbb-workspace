import { graphic, use, type ScatterSeriesOption } from "echarts";

export type XyClippedSeriesOption = ScatterSeriesOption & {
  readonly openbbXyClip?: boolean;
};
type CartesianRect = { x: number; y: number; width: number; height: number };
type CartesianSystem = { getArea(): CartesianRect };
const ownedClips = new WeakMap<object, InstanceType<typeof graphic.Rect>>();

use(registers => {
  registers.registerUpdateLifecycle("afterupdate", (ecModel, api) => {
    ecModel.eachSeriesByType("scatter", model => {
      const view = api.getViewOfSeriesModel(model);
      const previous = ownedClips.get(view);
      const enabled = (model.option as XyClippedSeriesOption).openbbXyClip === true;
      if (!enabled) {
        if (previous && view.group.getClipPath() === previous) view.group.removeClipPath();
        ownedClips.delete(view);
        return;
      }
      const system = model.coordinateSystem as unknown as CartesianSystem;
      if (!system?.getArea) return;
      const area = system.getArea();
      const clip = previous ?? new graphic.Rect();
      // Scatter's built-in clipping culls centers; painted bubbles must stop at the plot edge.
      clip.setShape({ x: area.x, y: area.y, width: area.width, height: area.height });
      view.group.setClipPath(clip);
      ownedClips.set(view, clip);
    });
  });
});
