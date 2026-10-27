import type { ResolvedApplicationAppearance } from "../application/appearanceModel";

export interface LegendRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LegendItem {
  readonly key: string;
  readonly label: string;
  readonly legendId: string;
  readonly bounds: LegendRect;
}

export interface LegendPage {
  readonly anchorKey: string;
  readonly items: readonly LegendItem[];
}

/** Renderer layout only; native legends retain selection and the lifecycle owns paging. */
export interface LegendPagination {
  readonly interaction?: PreviewLegendInteraction;
  readonly canonicalLegendId: string;
  readonly pages: readonly LegendPage[];
  readonly pager: {
    readonly previousId: string;
    readonly nextId: string;
    readonly counterId: string;
    readonly previousBounds: LegendRect;
    readonly nextBounds: LegendRect;
  };
}

export interface PreviewLegendInteraction {
  readonly mode: "preview";
  readonly focusColor: string;
  readonly focusBackgroundColor: string;
  readonly pageActiveColor: string;
  readonly pageInactiveColor: string;
}
export interface LegendLayoutInput {
  readonly items: readonly {
    readonly key: string;
    readonly label: string;
    readonly enabled: boolean;
  }[];
  readonly viewport: { readonly width: number; readonly height: number };
  readonly padding: ResolvedApplicationAppearance["padding"];
  readonly captionSpace: number;
  readonly legend: ResolvedApplicationAppearance["legend"];
  readonly markerStrokeWidth: number;
  readonly layout: {
    readonly maxHeight?: number;
    readonly maxWidth?: number;
    readonly markerShape: string;
  };
  readonly idPrefix: string;
  readonly interaction?: PreviewLegendInteraction;
}
