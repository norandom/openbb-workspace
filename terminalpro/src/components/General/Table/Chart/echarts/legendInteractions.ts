import type { LegendPagination } from "./legendTypes";

interface LegendInteractionPorts {
  readonly invoke: (action: () => void) => void;
  readonly readSelected: () => Readonly<Record<string, boolean>>;
  readonly select?: (selected: Readonly<Record<string, boolean>>) => void;
  readonly emphasize?: (key: string | undefined) => void;
  readonly reveal: (key: string) => void;
}

/** Optional preview behavior; native selection stays authoritative in the binding's ports. */
export function createLegendInteractions(ports: LegendInteractionPorts) {
  let plan: LegendPagination | undefined;
  let nodes = new Map<string, HTMLButtonElement>();
  let focused: string | undefined;

  function focus(key: string): void {
    if (!plan?.interaction) return;
    focused = key;
    for (const [name, node] of nodes) node.tabIndex = name === key ? 0 : -1;
    ports.reveal(key);
    ports.emphasize?.(key);
  }

  function isolate(key: string): void {
    if (!plan?.interaction || !nodes.has(key)) return;
    const selected = ports.readSelected();
    const others = [...nodes.keys()].filter((name) => name !== key);
    const restore = others.every((name) => selected[name] === false);
    ports.select?.(
      Object.fromEntries(
        [...nodes.keys()].map((name) => [name, restore || name === key]),
      ),
    );
  }

  function bind(key: string, node: HTMLButtonElement): void {
    const invoke = (action: () => void) => {
      if (plan?.interaction && nodes.get(key) === node) ports.invoke(action);
    };
    node.addEventListener("keydown", (event) => {
      if (
        !plan?.interaction ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      invoke(() => {
        const keys = [...nodes.keys()];
        const step =
          event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        nodes
          .get(
            keys[
              Math.max(0, Math.min(keys.length - 1, keys.indexOf(key) + step))
            ],
          )
          ?.focus();
      });
    });
    node.addEventListener("dblclick", () => invoke(() => isolate(key)));
    node.addEventListener("mouseenter", () =>
      invoke(() => ports.emphasize?.(key)),
    );
    node.addEventListener("mouseleave", () =>
      invoke(() => ports.emphasize?.(undefined)),
    );
    node.addEventListener("focus", () => invoke(() => focus(key)));
    node.addEventListener("blur", () =>
      invoke(() => ports.emphasize?.(undefined)),
    );
  }

  function sync(
    next: LegendPagination | undefined,
    controls: Map<string, HTMLButtonElement>,
    page: number,
  ): void {
    plan = next;
    const entries = next?.pages.flatMap((value) => value.items) ?? [];
    nodes = new Map(
      entries.flatMap((entry) => {
        const node = controls.get(`item:${entry.key}`);
        return node ? [[entry.key, node] as const] : [];
      }),
    );
    if (!nodes.has(focused ?? "")) focused = nodes.keys().next().value;
    const shown = new Set(next?.pages[page]?.items.map((entry) => entry.key));
    for (const [key, node] of nodes) {
      node.tabIndex = next?.interaction ? (key === focused ? 0 : -1) : 0;
      node.style.pointerEvents =
        next?.interaction && shown.has(key) ? "auto" : "none";
      node.title = next?.interaction
        ? (node.getAttribute("aria-label") ?? "")
        : "";
      if (next?.interaction && document.activeElement === node) {
        node.style.outlineColor = next.interaction.focusColor;
        node.style.boxShadow = `0 0 0 4px ${next.interaction.focusBackgroundColor}`;
        ports.emphasize?.(key);
      }
    }
  }
  return { bind, sync };
}
