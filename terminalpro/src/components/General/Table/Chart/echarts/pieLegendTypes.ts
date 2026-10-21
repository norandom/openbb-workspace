export interface PieLegendRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PieLegendItem {
  readonly key: string;
  readonly label: string;
  readonly legendId: string;
  readonly bounds: PieLegendRect;
}

export interface PieLegendPage {
  readonly anchorKey: string;
  readonly items: readonly PieLegendItem[];
}

/** Renderer layout only; native legends retain selection and the lifecycle owns paging. */
export interface PieLegendPagination {
  readonly canonicalLegendId: string;
  readonly pages: readonly PieLegendPage[];
  readonly pager: {
    readonly previousId: string;
    readonly nextId: string;
    readonly counterId: string;
    readonly previousBounds: PieLegendRect;
    readonly nextBounds: PieLegendRect;
  };
}
