import type { EChartsOption } from "echarts";
import type {
  HierarchyHoverBinding,
  HierarchyHoverMarker,
  HierarchyHoverPlan,
} from "./hierarchyHoverTypes";

interface HoverInstance {
  on(name: string, listener: (event: unknown) => void): unknown;
  off(name: string, listener: (event: unknown) => void): unknown;
  setOption(options: EChartsOption): unknown;
}
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function valid(marker: HierarchyHoverMarker) {
  return (
    [marker.x, marker.y, marker.rotation, marker.size].every(Number.isFinite) &&
    marker.size > 0 &&
    typeof marker.color === "string" &&
    marker.color.length > 0
  );
}
export function createHierarchyHoverBinding(
  instance: HoverInstance,
  isActive: () => boolean,
  fail: (error: unknown) => void,
): HierarchyHoverBinding {
  let plan: HierarchyHoverPlan | undefined;
  let visibleId: string | undefined;
  let disposed = false;
  function clear() {
    const id = visibleId;
    visibleId = undefined;
    if (id) instance.setOption({ graphic: [{ id, $action: "remove" }] });
  }
  function over(event: unknown) {
    if (disposed || !isActive() || !plan) return;
    try {
      const id = own(own(event, "data"), "id");
      const marker =
        own(event, "seriesId") === plan.seriesId && typeof id === "string"
          ? plan.project(id)
          : undefined;
      if (!marker || !valid(marker)) {
        clear();
        return;
      }
      visibleId = plan.graphicId;
      instance.setOption({
        graphic: [
          {
            id: plan.graphicId,
            type: "polygon",
            silent: true,
            invisible: false,
            x: marker.x,
            y: marker.y,
            rotation: marker.rotation,
            z: 100,
            shape: {
              points: [
                [0, 0],
                [-marker.size / 2, -marker.size],
                [marker.size / 2, -marker.size],
              ],
            },
            style: { fill: marker.color },
          },
        ],
      });
    } catch (error) {
      fail(error);
    }
  }
  function out() {
    if (disposed || !isActive()) return;
    try {
      clear();
    } catch (error) {
      fail(error);
    }
  }
  const listeners = [
    ["mouseover", over],
    ["mouseout", out],
    ["globalout", out],
  ] as const;
  function dispose() {
    if (disposed) return;
    disposed = true;
    plan = undefined;
    let failure: unknown;
    for (const [name, listener] of listeners) {
      try {
        instance.off(name, listener);
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      clear();
    } catch (error) {
      failure ??= error;
    }
    if (failure !== undefined) throw failure;
  }
  try {
    for (const [name, listener] of listeners) instance.on(name, listener);
  } catch (error) {
    try {
      dispose();
    } catch {
      /* Retain the subscription failure. */
    }
    throw error;
  }
  return {
    clear,
    dispose,
    setPlan(next) {
      clear();
      if (!disposed) plan = next;
    },
  };
}
