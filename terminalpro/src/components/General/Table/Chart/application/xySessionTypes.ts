import type { XyChartType } from "../compatibility/xyAssignments";
import type { ResolvedXyStyle } from "../echarts/xyTypes";
import type { SessionStamp } from "./types";
export function isXyChartFamily(value: unknown): value is XyChartType {
  return value === "scatter" || value === "bubble";
}
export type XyValueRole = "x" | "y" | "size";
export interface XyEditorProjection {
  readonly chartType: XyChartType;
  readonly paired: boolean;
  readonly roles: readonly { readonly colId: string; readonly role: XyValueRole }[];
  readonly labels: "category" | "y";
  readonly style: ResolvedXyStyle;
}
export type XyEditIntent = {
  readonly panel: "xy";
  readonly edit:
    | { readonly kind: "paired"; readonly value: boolean }
    | { readonly kind: "shape"; readonly value: string }
    | { readonly kind: "size" | "maxSize" | "strokeWidth"; readonly value: number };
};
export interface XyEditCommand {
  readonly stamp: SessionStamp;
  readonly family: XyChartType;
  readonly intent: XyEditIntent;
}
export function xyRoles(ids: readonly string[], family: XyChartType, paired: boolean) {
  const roles: readonly XyValueRole[] = family === "bubble" ? ["x", "y", "size"] : ["x", "y"];
  return ids.map((colId, index) => ({
    colId,
    role: paired ? roles[index % roles.length]
      : index === 0 ? "x" as const : roles[1 + (index - 1) % (roles.length - 1)],
  }));
}
