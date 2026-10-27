import { createLegendInteractions } from "./legendInteractions";
import type { PieLegendPagination, PieLegendRect } from "./pieLegendTypes";

interface AccessibilityPorts {
  readonly container: HTMLDivElement;
  readonly invoke: (action: () => void) => void;
  readonly toggle: (key: string) => void;
  readonly reveal: (key: string) => void;
  readonly page: (direction: -1 | 1) => void;
  readonly readSelected: () => Readonly<Record<string, boolean>>;
  readonly select?: (selected: Readonly<Record<string, boolean>>) => void;
  readonly emphasize?: (key: string | undefined) => void;
}

function place(button: HTMLButtonElement, bounds: PieLegendRect): void {
  Object.assign(button.style, {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
}

/** DOM mirrors the accepted canvas drawing; selection and page state remain upstream. */
export function createPieLegendAccessibility(ports: AccessibilityPorts) {
  const controls = new Map<string, HTMLButtonElement>();
  let root: HTMLDivElement | undefined;
  let status: HTMLDivElement | undefined;
  let originalPosition: string | undefined;
  let currentPlan: PieLegendPagination | undefined;
  const interactions = createLegendInteractions(ports);

  function dispose(): void {
    currentPlan = undefined;
    interactions.sync(undefined, new Map(), 0);
    root?.remove();
    root = undefined;
    status = undefined;
    controls.clear();
    if (originalPosition !== undefined)
      ports.container.style.position = originalPosition;
    originalPosition = undefined;
  }

  function ensureRoot(): HTMLDivElement {
    if (root) return root;
    root = document.createElement("div");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Chart legend");
    Object.assign(root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    if (
      getComputedStyle(ports.container).position === "static" ||
      !getComputedStyle(ports.container).position
    ) {
      originalPosition = ports.container.style.position;
      ports.container.style.position = "relative";
    }
    status = document.createElement("div");
    status.setAttribute("role", "status");
    Object.assign(status.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clipPath: "inset(50%)",
    });
    root.append(status);
    ports.container.append(root);
    return root;
  }

  function button(
    id: string,
    label: string,
    action: () => void,
    focus?: () => void,
  ): HTMLButtonElement {
    const retained = controls.get(id);
    if (retained) return retained;
    const node = document.createElement("button");
    node.type = "button";
    node.setAttribute("aria-label", label);
    Object.assign(node.style, {
      position: "absolute",
      opacity: "1",
      color: "transparent",
      background: "transparent",
      border: "0",
      padding: "0",
      pointerEvents: "none",
      outline: "none",
    });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat && !node.disabled && controls.get(id) === node)
        ports.invoke(action);
    });
    node.addEventListener("click", () => {
      if (!node.disabled && controls.get(id) === node) ports.invoke(action);
    });
    node.addEventListener("focus", () => {
      node.style.outline = "2px solid currentColor";
      node.style.outlineColor =
        currentPlan?.interaction?.focusColor ?? "Highlight";
      node.style.boxShadow = currentPlan?.interaction
        ? `0 0 0 4px ${currentPlan.interaction.focusBackgroundColor}`
        : "none";
      if (focus && controls.get(id) === node) ports.invoke(focus);
    });
    node.addEventListener("blur", () => {
      node.style.outline = "none";
      node.style.boxShadow = "none";
    });
    if (id.startsWith("item:")) interactions.bind(id.slice(5), node);
    controls.set(id, node);
    ensureRoot().append(node);
    return node;
  }

  function sync(
    plan: PieLegendPagination | undefined,
    page: number,
    selected: Readonly<Record<string, boolean>>,
  ): void {
    if (!plan) {
      dispose();
      return;
    }
    currentPlan = plan;
    ensureRoot();
    const retained = new Set<string>();
    for (const entry of plan.pages.flatMap((value) => value.items)) {
      const id = `item:${entry.key}`;
      retained.add(id);
      const node = button(
        id,
        entry.label,
        () => ports.toggle(entry.key),
        () => ports.reveal(entry.key),
      );
      node.setAttribute("aria-label", entry.label);
      node.setAttribute("role", "switch");
      node.setAttribute("aria-checked", String(selected[entry.key] !== false));
      place(node, entry.bounds);
    }
    for (const [id, label, direction, bounds] of [
      [
        plan.pager.previousId,
        "Previous legend page",
        -1,
        plan.pager.previousBounds,
      ],
      [plan.pager.nextId, "Next legend page", 1, plan.pager.nextBounds],
    ] as const) {
      retained.add(id);
      const node = button(id, label, () => ports.page(direction));
      node.disabled =
        direction < 0 ? page === 0 : page === plan.pages.length - 1;
      node.hidden = plan.pages.length < 2;
      node.tabIndex = plan.interaction ? -1 : 0;
      node.style.pointerEvents = plan.interaction ? "auto" : "none";
      place(node, bounds);
    }
    for (const [id, node] of controls) {
      if (!retained.has(id)) {
        node.remove();
        controls.delete(id);
      }
    }
    if (status)
      status.textContent = `Legend page ${page + 1} of ${plan.pages.length}`;
    interactions.sync(plan, controls, page);
  }

  return { sync, dispose };
}
