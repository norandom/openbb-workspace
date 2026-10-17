import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ChartEditorDock, type ChartEditorDockProps } from "../../src/components/General/Table/Chart/editor/ChartEditorDock";
import { chartTypeGalleryGroups } from "../../src/components/General/Table/Chart/editor/chartTypeGalleryCatalog";

afterEach(cleanup);
function FixturePanel({ name }: { name: string }) {
  const [expanded, setExpanded] = useState(false);
  return <><button onClick={() => setExpanded(!expanded)}>{name} group</button>{expanded && <input aria-label={`${name} value`} defaultValue="initial" />}</>;
}
function props(overrides: Partial<ChartEditorDockProps> = {}): ChartEditorDockProps {
  return { open: true, activeTab: "chart", onOpenChange: vi.fn(), onTabChange: vi.fn(), themeResetKey: "dark", galleryProps: { groups: chartTypeGalleryGroups, selectedType: "groupedColumn", onSelect: vi.fn() }, setup: <FixturePanel name="Setup" />, customize: <FixturePanel name="Customize" />, ...overrides };
}
it("composes the real gallery and requests controlled navigation", () => {
  const p = props();
  render(<ChartEditorDock {...p} />);
  fireEvent.click(screen.getByTitle("Grouped Bar"));
  expect(p.galleryProps.onSelect).toHaveBeenCalledExactlyOnceWith("groupedBar");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), { button: 0, ctrlKey: false });
  expect(p.onTabChange).toHaveBeenCalledWith("setup");
  expect(screen.getByRole("tab", { name: "Chart" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Collapse chart editor" }));
  expect(p.onOpenChange).toHaveBeenCalledWith(false);
});
it("retains active contents and scroll through hiding, focuses selected tab on reopen", () => {
  const p = props({ activeTab: "customize" });
  const { rerender } = render(<ChartEditorDock {...p} />);
  fireEvent.click(screen.getByText("Customize group"));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "retained" } });
  const panel = screen.getByRole("tabpanel");
  panel.scrollTop = 547;
  rerender(<ChartEditorDock {...p} open={false} />);
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  rerender(<ChartEditorDock {...p} />);
  expect(screen.getByRole("textbox")).toBe(input);
  expect((input as HTMLInputElement).value).toBe("retained");
  expect(screen.getByRole("tabpanel").scrollTop).toBe(547);
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Customize" }));
});
it("resets Customize descendants after departure or live theme change, preserving outer selection", () => {
  const p = props({ activeTab: "customize" });
  const { rerender } = render(<ChartEditorDock {...p} />);
  fireEvent.click(screen.getByText("Customize group"));
  rerender(<ChartEditorDock {...p} activeTab="setup" />);
  fireEvent.click(screen.getByText("Setup group"));
  expect(screen.getByLabelText("Setup value")).toBeTruthy();
  rerender(<ChartEditorDock {...p} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByText("Customize group"));
  rerender(<ChartEditorDock {...p} themeResetKey="light" />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("tab", { name: "Customize" }).getAttribute("aria-selected")).toBe("true");
});
it("returns only internal focus to the opener and supports roving keyboard tabs", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  const p = props({ openerRef: { current: opener } });
  const { rerender } = render(<ChartEditorDock {...p} />);
  screen.getByRole("tab", { name: "Chart" }).focus();
  await userEvent.setup().keyboard("{ArrowRight}");
  expect(p.onTabChange).toHaveBeenCalledWith("setup");
  rerender(<ChartEditorDock {...p} open={false} />);
  expect(document.activeElement).toBe(opener);
  rerender(<ChartEditorDock {...p} />);
  const external = document.createElement("button");
  document.body.append(external);
  external.focus();
  rerender(<ChartEditorDock {...p} open={false} />);
  expect(document.activeElement).toBe(external);
  opener.remove();
  external.remove();
});
