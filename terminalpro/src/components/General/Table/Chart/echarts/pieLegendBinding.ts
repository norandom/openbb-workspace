import type { EChartsOption } from "echarts";
import { createPieLegendAccessibility } from "./pieLegendAccessibility";
import type { PieLegendPagination } from "./pieLegendTypes";

export interface PieLegendPorts {
  readonly container: HTMLDivElement;
  readonly isActive: () => boolean;
  readonly readSelected: () => Readonly<Record<string, boolean>>;
  readonly toggle: (key: string) => void;
  readonly select?: (selected: Readonly<Record<string, boolean>>) => void;
  readonly emphasize?: (key: string | undefined) => void;
  readonly repaint: () => void;
  readonly fail: (error: unknown) => void;
}
export interface PieLegendBinding {
  project(
    options: EChartsOption,
    plan: PieLegendPagination | undefined,
    scope: string | undefined,
  ): EChartsOption;
  sync(): void;
  handleClick(event: unknown): void;
  dispose(): void;
}
interface Graphic {
  readonly id?: string | number;
  readonly children?: readonly Graphic[];
  readonly elements?: readonly Graphic[];
  readonly style?: object;
}

export function createPieLegendBinding(
  ports: PieLegendPorts,
): PieLegendBinding {
  let plan: PieLegendPagination | undefined;
  let scope: string | undefined;
  let anchor: string | undefined;
  let token = 0;
  let disposed = false;
  const accessibility = createPieLegendAccessibility({
    container: ports.container,
    invoke,
    toggle: ports.toggle,
    reveal,
    page: move,
    readSelected: ports.readSelected,
    select: ports.select,
    emphasize: ports.emphasize,
  });

  function page(): number {
    return Math.max(
      0,
      plan?.pages.findIndex((value) =>
        value.items.some((item) => item.key === anchor),
      ) ?? 0,
    );
  }

  function invoke(action: () => void): void {
    if (disposed || !ports.isActive()) return;
    try {
      action();
    } catch (error) {
      ports.fail(error);
    }
  }

  function move(direction: -1 | 1): void {
    const target = plan?.pages[page() + direction];
    if (!target) return;
    anchor = target.anchorKey;
    ports.repaint();
  }

  function reveal(key: string): void {
    const target = plan?.pages.find((value) =>
      value.items.some((item) => item.key === key),
    );
    if (!target) return;
    const samePage = target === plan?.pages[page()];
    if (plan?.interaction) anchor = key;
    if (samePage) return;
    anchor = plan?.interaction ? key : target.anchorKey;
    ports.repaint();
  }

  function graphic(value: Graphic): Graphic {
    const children = value.children?.map(graphic);
    const elements = value.elements?.map(graphic);
    const result = {
      ...value,
      ...(children && { children }),
      ...(elements && { elements }),
    };
    if (!plan) return result;
    const direction =
      value.id === plan.pager.previousId
        ? -1
        : value.id === plan.pager.nextId
          ? 1
          : undefined;
    if (direction) {
      const enabled = !!plan.pages[page() + direction];
      return {
        ...result,
        invisible: plan.pages.length < 2,
        silent: !enabled,
        style: {
          ...value.style,
          opacity: plan.interaction ? 1 : enabled ? 1 : 0.35,
          ...(plan.interaction && {
            fill: enabled
              ? plan.interaction.pageActiveColor
              : plan.interaction.pageInactiveColor,
          }),
        },
        info: { kind: "pie-legend-page", direction, token },
      } as Graphic;
    }
    return value.id === plan.pager.counterId
      ? ({
          ...result,
          invisible: plan.pages.length < 2,
          silent: true,
          style: {
            ...value.style,
            text: `${page() + 1} / ${plan.pages.length}`,
          },
        } as Graphic)
      : result;
  }

  function project(
    options: EChartsOption,
    next: PieLegendPagination | undefined,
    nextScope: string | undefined,
  ): EChartsOption {
    if (disposed) return { ...options };
    const ordinal = page();
    const retained =
      scope === nextScope &&
      next?.pages.some((value) =>
        value.items.some((item) => item.key === anchor),
      );
    if (!retained)
      anchor =
        next?.pages[
          scope === nextScope ? Math.min(ordinal, next.pages.length - 1) : 0
        ]?.anchorKey;
    plan = next;
    scope = nextScope;
    token += 1;
    if (!plan) return { ...options };
    const visible = new Set(
      plan.pages[page()]?.items.map((item) => item.legendId),
    );
    const owned = new Set(
      plan.pages.flatMap((value) => value.items.map((item) => item.legendId)),
    );
    const legends = Array.isArray(options.legend)
      ? options.legend
      : [options.legend ?? {}];
    const graphics = options.graphic as
      | Graphic
      | readonly Graphic[]
      | undefined;
    return {
      ...options,
      legend: legends.map((legend) => ({
        ...legend,
        ...(legend.id === plan?.canonicalLegendId
          ? { show: false }
          : owned.has(String(legend.id))
            ? { show: visible.has(String(legend.id)) }
            : {}),
      })),
      ...(graphics && {
        graphic: (Array.isArray(graphics)
          ? graphics.map(graphic)
          : graphic(graphics as Graphic)) as EChartsOption["graphic"],
      }),
    };
  }

  function sync(): void {
    if (disposed) return;
    accessibility.sync(plan, page(), plan ? ports.readSelected() : {});
  }

  function handleClick(event: unknown): void {
    const value = event as {
      componentType?: string;
      info?: { kind?: string; direction?: number; token?: number };
    } | null;
    if (
      value?.componentType !== "graphic" ||
      value.info?.kind !== "pie-legend-page" ||
      value.info.token !== token
    )
      return;
    const direction = value.info.direction;
    if (direction === -1 || direction === 1) invoke(() => move(direction));
  }

  function dispose(): void {
    disposed = true;
    token += 1;
    plan = undefined;
    anchor = undefined;
    accessibility.dispose();
  }

  return { project, sync, handleClick, dispose };
}
