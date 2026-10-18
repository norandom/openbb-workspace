import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartTooltipsPanel } from "../../src/components/General/Table/Chart/editor/tooltips/ChartTooltipsPanel";

afterEach(cleanup);
const modes = [
  { value: "single", label: "Single" },
  { value: "shared", label: "Multiple" },
  { value: "compact", label: "Compact" },
] as const;
it("renders the subsection with supplied order and exact mode edits without mount emissions", () => {
  const onEdit = vi.fn();
  render(
    <ChartTooltipsPanel
      value={{ enabled: true, mode: "shared" }}
      modes={modes}
      onEdit={onEdit}
    />,
  );
  expect(
    screen.getByRole("switch", { name: "Tooltips" }).getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.queryByRole("button", { name: "Tooltips" })).toBeNull();
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "Single",
    "Multiple",
    "Compact",
  ]);
  expect(
    (screen.getByRole("combobox", { name: "Tooltip Mode" }) as HTMLSelectElement).value,
  ).toBe("shared");
  expect(onEdit).not.toHaveBeenCalled();
  for (const mode of modes) {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: mode.value } });
    expect(onEdit).toHaveBeenLastCalledWith({ field: "mode", value: mode.value });
  }
});
it("hides the mode until the caller enables it and retains the caller mode across toggles", () => {
  const value = { enabled: false, mode: "compact" };
  const onEdit = vi.fn();
  const { rerender } = render(
    <ChartTooltipsPanel value={value} modes={modes} onEdit={onEdit} />,
  );
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch"));
  expect(onEdit.mock.calls).toEqual([[{ field: "enabled", value: true }]]);
  expect(screen.queryByRole("combobox")).toBeNull();
  rerender(
    <ChartTooltipsPanel
      value={{ ...value, enabled: true }}
      modes={modes}
      onEdit={onEdit}
    />,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("compact");
  fireEvent.click(screen.getByRole("switch"));
  expect(onEdit).toHaveBeenLastCalledWith({ field: "enabled", value: false });
  expect(value).toEqual({ enabled: false, mode: "compact" });
});
it("preserves unknown modes, empty choices, and reordered caller choices without fallback edits", () => {
  const onEdit = vi.fn();
  const value = { enabled: true, mode: "custom-mode" };
  const { rerender } = render(
    <ChartTooltipsPanel value={value} modes={[modes[2], modes[0]]} onEdit={onEdit} />,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("custom-mode");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "custom-mode",
    "Compact",
    "Single",
  ]);
  rerender(
    <ChartTooltipsPanel value={{ ...value, mode: "" }} modes={[]} onEdit={onEdit} />,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(onEdit).not.toHaveBeenCalled();
});
