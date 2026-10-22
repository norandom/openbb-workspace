export interface ChartPointerPoint {
  readonly x: number;
  readonly y: number;
}
export interface ChartPointerMatch {
  readonly key: string;
  readonly identityKey?: string;
}
export interface ChartPointerPick {
  readonly distance: number;
  readonly matches: readonly ChartPointerMatch[];
}
export interface ChartPointerPresentation {
  readonly html: string;
  readonly anchor: ChartPointerPoint;
  readonly categoryPointer?: {
    readonly axis: "x" | "y";
    readonly coordinate: number;
    readonly label: string;
  };
}
export interface ChartPointerPlan {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly plot: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly pagination: boolean;
  readonly paint?: {
    readonly background: string;
    readonly color: string;
    readonly borderColor: string;
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly fontWeight: string | number;
    readonly pointerColor: string;
    readonly pointerLabelBackground: string;
    readonly pointerLabelColor: string;
  };
  readonly pick: (
    point: ChartPointerPoint,
    intent: "hover" | "click",
  ) => ChartPointerPick | undefined;
  readonly present: (match: ChartPointerMatch) => ChartPointerPresentation | undefined;
}
export interface ChartPointerBinding {
  setPlan(plan: ChartPointerPlan | undefined): void;
  clear(): void;
  consumeDoubleClick(point: ChartPointerPoint): boolean;
  dispose(): void;
}
