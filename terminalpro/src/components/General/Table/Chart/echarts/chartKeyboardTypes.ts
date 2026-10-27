export interface GroupedBarGeometry {
  /** Explicit CSS-pixel width; callers rebuild this plan together with series options. */
  readonly barWidth: number;
  /** Gap as a proportion of the bar width, matching ECharts barGap. */
  readonly barGap: number;
}
export interface GroupedBarKeyboardPlan {
  readonly kind: "grouped-bar";
  readonly label: string;
  readonly gridId: string;
  readonly xAxisId: string;
  readonly yAxisId: string;
  readonly categories: readonly string[];
  readonly series: readonly {
    readonly id: string;
    readonly name: string;
    readonly values: readonly number[];
  }[];
  readonly geometry: GroupedBarGeometry;
  readonly focus: {
    readonly color: string;
    readonly backgroundColor: string;
    readonly borderWidth: number;
  };
}
export interface ChartKeyboardRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type ChartCoordinateConversion = (
  finder: {
    readonly gridId: string;
    readonly xAxisId?: string;
    readonly yAxisId?: string;
  },
  value: number | string,
) => number;
export interface ChartKeyboardPorts {
  readonly container: HTMLDivElement;
  readonly isActive: () => boolean;
  readonly readSelected: () => Readonly<Record<string, boolean>>;
  readonly convertToPixel: ChartCoordinateConversion;
  readonly highlight: (seriesId: string, dataIndex: number) => void;
  readonly clear: () => void;
  readonly fail: (error: unknown) => void;
}
export interface ChartKeyboardBinding {
  sync(
    plan: GroupedBarKeyboardPlan | undefined,
    scope: string | undefined,
  ): void;
  clear(): void;
  dispose(): void;
}
