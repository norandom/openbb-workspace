import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ApplicationChartEditor } from "../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import {
  createEditorMetadata,
  selectApplicationEditorState,
} from "../../src/components/General/Table/Chart/compatibility/editorBindings";
import { bindingSelection } from "./chart-application/editorBindingFixture";

afterEach(cleanup);
function props() {
  const selected = selectApplicationEditorState(bindingSelection());
  if (!selected.valid) throw new Error(selected.error);
  return {
    state: selected.value,
    open: true,
    activeTab: "customize" as const,
    onOpenChange: vi.fn(),
    onTabChange: vi.fn(),
    onIntent: vi.fn(),
    onAxisStructure: vi.fn(),
    themeResetKey: "light",
    galleryProps: {
      groups: [{ name: "Line", items: [{ name: "Line", modelType: "line" }] }],
      selectedType: "groupedColumn",
      onSelect: vi.fn(),
    },
    setupProps: {
      value: {
        categoryId: "period",
        aggregate: false,
        aggregationMethod: "sum",
        series: [{ id: "revenue", label: "Revenue" }],
        switchCategorySeries: false,
      },
      categories: [{ value: "period", label: "Period" }],
      aggregationMethods: [{ value: "sum", label: "Sum" }],
      onEdit: vi.fn(),
    },
  };
}
describe("controlled production chart editor", () => {
  it("retains each caption spacing range and accepts edits below its retained maximum", () => {
    const selection = bindingSelection();
    const application = {
      ...selection.style.application,
      title: { ...selection.style.application.title, enabled: true, spacing: 150 },
      subtitle: { ...selection.style.application.subtitle, enabled: true, spacing: 20 },
    };
    const metadata = createEditorMetadata(application, {
      category: { axis: "category", direction: "x", optionType: "category" },
      number: { axis: "number", direction: "y", optionType: "number" },
    });
    const selected = selectApplicationEditorState({
      ...selection,
      metadata,
      style: { ...selection.style, application },
    });
    if (!selected.valid) throw new Error(selected.error);
    const input = props();
    render(<ApplicationChartEditor {...input} state={selected.value} />);
    fireEvent.click(screen.getByRole("button", { name: "Titles" }));
    const title = within(screen.getByRole("group", { name: "Chart Title" }));
    const subtitle = within(screen.getByRole("group", { name: "Subtitle" }));
    expect(title.getByRole("slider", { name: "Spacing" }).getAttribute("max")).toBe(
      "150",
    );
    expect(subtitle.getByRole("slider", { name: "Spacing" }).getAttribute("max")).toBe(
      "100",
    );
    expect(
      title
        .getByRole("textbox", { name: "Spacing value" })
        .getAttribute("aria-invalid"),
    ).toBe("false");
    fireEvent.change(title.getByRole("textbox", { name: "Spacing value" }), {
      target: { value: "125" },
    });
    expect(input.onIntent).toHaveBeenCalledWith({
      panel: "titles",
      edit: { caption: "title", field: "spacing", value: 125 },
    });
  });
  it("keeps current size and conditional predefined menus independent per caption", () => {
    const selection = bindingSelection();
    const application = {
      ...selection.style.application,
      title: {
        ...selection.style.application.title,
        enabled: true,
        fontWeight: "normal",
        fontStyle: "normal",
        size: 19,
      },
      subtitle: { ...selection.style.application.subtitle, enabled: true, size: 23 },
    };
    const metadata = createEditorMetadata(application, {
      category: { axis: "category", direction: "x", optionType: "category" },
      number: { axis: "number", direction: "y", optionType: "number" },
    });
    const selected = selectApplicationEditorState({
      ...selection,
      metadata,
      style: { ...selection.style, application },
    });
    if (!selected.valid) throw new Error(selected.error);
    render(<ApplicationChartEditor {...props()} state={selected.value} />);
    fireEvent.click(screen.getByRole("button", { name: "Titles" }));
    const title = within(screen.getByRole("group", { name: "Chart Title" }));
    const subtitle = within(screen.getByRole("group", { name: "Subtitle" }));
    expect(
      within(title.getByRole("combobox", { name: "Weight" })).queryByRole("option", {
        name: "Predefined",
      }),
    ).toBeNull();
    expect(
      within(subtitle.getByRole("combobox", { name: "Weight" })).getByRole("option", {
        name: "Predefined",
      }),
    ).toBeTruthy();
    expect(
      within(title.getByRole("combobox", { name: "Size" })).queryByRole("option", {
        name: "23",
      }),
    ).toBeNull();
    expect(
      within(subtitle.getByRole("combobox", { name: "Size" })).queryByRole("option", {
        name: "19",
      }),
    ).toBeNull();
  });
  it("composes accepted fields and emits intentions without resolved render context", () => {
    const input = props();
    render(<ApplicationChartEditor {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Titles" }));
    const title = screen.getByRole("group", { name: "Chart Title" });
    fireEvent.click(within(title).getByRole("switch", { name: "Chart Title" }));
    expect(input.onIntent).toHaveBeenCalledWith({
      panel: "titles",
      edit: { caption: "title", field: "enabled", value: true },
    });
    expect(input.onIntent.mock.calls[0][0]).not.toHaveProperty("font");
  });
  it("emits structural axis edits separately and keeps axis style intents independent", () => {
    const input = props();
    input.state.axes.category.fields.types = [
      { value: "category", label: "Category" },
      { value: "time", label: "Time" },
    ];
    render(<ApplicationChartEditor {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Horizontal Axis" }));
    const section = screen.getByRole("region", { name: "Horizontal Axis" });
    fireEvent.change(within(section).getByRole("combobox", { name: "Axis Type" }), {
      target: { value: "time" },
    });
    expect(input.onAxisStructure).toHaveBeenCalledWith({
      panel: "axisStructure",
      axis: "category",
      edit: { field: "type", value: "time" },
    });
    expect(input.onIntent).not.toHaveBeenCalled();
    fireEvent.change(
      within(section).getAllByRole("spinbutton", { name: "Thickness value" })[0],
      { target: { value: "4" } },
    );
    expect(input.onIntent).toHaveBeenCalledWith({
      panel: "axis",
      axis: "category",
      edit: { field: "thickness", value: 4 },
    });
  });
  it("uses caller-controlled setup and gallery events", () => {
    const input = props();
    const view = render(<ApplicationChartEditor {...input} activeTab="setup" />);
    fireEvent.click(screen.getByRole("switch", { name: "Aggregate" }));
    expect(input.setupProps.onEdit).toHaveBeenCalledWith({
      kind: "aggregate",
      value: true,
    });
    view.rerender(<ApplicationChartEditor {...input} activeTab="chart" />);
    fireEvent.click(screen.getByRole("button", { name: "Line" }));
    expect(input.galleryProps.onSelect).toHaveBeenCalledWith("line");
  });
  it("retains hidden control values on external rerender and respects current predicates", () => {
    const input = props();
    const view = render(<ApplicationChartEditor {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    expect(screen.queryByRole("group", { name: "Markers" })).toBeNull();
    const state = {
      ...input.state,
      eligibility: { ...input.state.eligibility, markers: true },
    };
    view.rerender(<ApplicationChartEditor {...input} state={state} />);
    expect(
      screen.getByRole("switch", { name: "Markers" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(input.onIntent).not.toHaveBeenCalled();
  });
});
