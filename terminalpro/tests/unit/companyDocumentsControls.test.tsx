// Regression guard for the document query bar: bare native controls rendered unstyled in the
// browser while every behavioural test still passed, so pin the design-system structure here.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CompanyDocumentsWidget from "~/components/Widgets/CompanyDocuments/CompanyDocumentsWidget";

const host = vi.hoisted(() => ({
  widget: null as any,
  update: vi.fn(),
  refetch: vi.fn(),
  query: {} as Record<string, unknown>,
}));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => ({ widget: host.widget, updateWidget: host.update }),
}));
vi.mock("~/components/DraggableCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("~/components/Widgets/CompanyDocuments/useCompanyDocuments", () => ({
  useCompanyDocuments: () => ({
    kind: "filing",
    rows: [],
    contextKey: "filings:AAPL",
    refetch: host.refetch,
    isError: false,
    isFetching: false,
    validationError: null,
    ...host.query,
  }),
}));
vi.mock("~/components/Widgets/CompanyDocuments/CompanyDocuments", () => ({
  default: () => <div />,
}));

const controls = [
  ["Symbol", "text"],
  ["Start date", "date"],
  ["End date", "date"],
  ["Page", "number"],
  ["Limit", "number"],
] as const;
const params = [
  { paramName: "symbol", label: "Symbol", type: "text", value: "AAPL" },
  { paramName: "start_date", label: "Start date", type: "date", value: "2026-01-01" },
  { paramName: "end_date", label: "End date", type: "date", value: "2026-11-18" },
  { paramName: "page", label: "Page", type: "number", value: 0 },
  { paramName: "limit", label: "Limit", type: "number", value: 20 },
  { paramName: "provider", label: "Provider", type: "text", value: "fmp" },
  { paramName: "hidden", label: "Hidden", type: "text", value: "x", show: false },
];

function mount(query: Record<string, unknown> = {}) {
  host.query = query;
  host.widget = { name: "Filings", params, storage: { params: { symbol: "AAPL" } } };
  return render(<CompanyDocumentsWidget />);
}

afterEach(() => {
  cleanup();
  host.update.mockReset();
  host.refetch.mockReset();
});

describe("document query controls", () => {
  it("render as labelled design-system fields with one keyboard stop each", () => {
    const view = mount();
    for (const [label, type] of controls) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.type).toBe(type);
      expect(input.closest(".BB-Input")).not.toBeNull();
      const labels = Array.from(input.labels ?? []);
      expect(labels.map((element) => element.textContent)).toEqual([label]);
      expect(labels[0].contains(input)).toBe(false);
      if (type === "number") expect(input.step).toBe("1");
    }
    expect(screen.queryByLabelText("Provider")).toBeNull();
    expect(screen.queryByLabelText("Hidden")).toBeNull();
    expect(screen.queryAllByRole("button", { name: "Clear" })).toHaveLength(0);
    const apply = screen.getByRole("button", {
      name: "Apply query",
    }) as HTMLButtonElement;
    const refresh = screen.getByRole("button", {
      name: "Refresh documents",
    }) as HTMLButtonElement;
    expect(apply.className).toMatch(/BB-Button/);
    expect(refresh.className).toMatch(/BB-Button/);
    expect([apply.type, refresh.type]).toEqual(["submit", "button"]);
    const focusable = Array.from(
      view.container.querySelectorAll<HTMLElement>(
        "input,button,select,textarea,a[href],[tabindex]",
      ),
    ).filter(
      (element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled,
    );
    expect(
      focusable.map(
        (element) => element.getAttribute("aria-label") ?? element.textContent,
      ),
    ).toEqual([
      ...controls.map(([label]) => label),
      "Apply query",
      "Refresh documents",
    ]);
  });

  it("acquire only on the explicit Apply query submission", () => {
    mount();
    const symbol = screen.getByLabelText("Symbol") as HTMLInputElement;
    fireEvent.change(symbol, { target: { value: "MSFT" } });
    expect(symbol.value).toBe("MSFT");
    expect(host.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply query" }));
    expect(host.update).toHaveBeenCalledTimes(1);
  });

  it("keep refresh disabled while invalid or fetching", () => {
    mount({ validationError: "Quarter must be an integer" });
    expect(
      (screen.getByRole("button", { name: "Refresh documents" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/integer/);
    cleanup();
    mount({ isFetching: true });
    expect(
      (screen.getByRole("button", { name: "Refresh documents" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
  });
});
