import { createHierarchyHoverBinding } from "./hierarchyHoverBinding";
import type { HierarchyHoverBinding, HierarchyHoverPlan } from "./hierarchyHoverTypes";

/** Resize expires viewport coordinates until a newer request supplies a fresh plan. */
export function createLifecycleHierarchyHover() {
  let binding: HierarchyHoverBinding | undefined;
  let expiredRevision: number | undefined;
  return {
    ensure(...args: Parameters<typeof createHierarchyHoverBinding>) {
      binding ??= createHierarchyHoverBinding(...args);
    },
    clearPlan() {
      binding?.setPlan(undefined);
    },
    expire(revision: number | undefined) {
      expiredRevision = revision;
      binding?.setPlan(undefined);
    },
    rendered(revision: number, plan: HierarchyHoverPlan | undefined) {
      binding?.setPlan(revision === expiredRevision ? undefined : plan);
    },
    dispose() {
      const previous = binding;
      binding = undefined;
      previous?.dispose();
    },
  };
}
