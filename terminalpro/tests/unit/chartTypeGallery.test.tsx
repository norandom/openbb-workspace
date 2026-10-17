import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ChartTypeGallery } from "../../src/components/General/Table/Chart/editor/ChartTypeGallery";
import { chartTypeGalleryGroups } from "../../src/components/General/Table/Chart/editor/chartTypeGalleryCatalog";

afterEach(cleanup);
describe("controlled chart gallery", () => {
  it("activates the native button exactly once for Enter and Space", async () => {
    const onSelect = vi.fn();
    render(<ChartTypeGallery groups={chartTypeGalleryGroups} selectedType="unknown" onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: "Grouped Bar", exact: true });
    button.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect.mock.calls).toEqual([["groupedBar"], ["groupedBar"]]);
  });
  it("preserves the complete supplied order and exact model callback", () => {
    const onSelect = vi.fn();
    render(<ChartTypeGallery groups={chartTypeGalleryGroups} selectedType="groupedColumn" onSelect={onSelect} />);
    const items = chartTypeGalleryGroups.flatMap((group) => group.items);
    expect(items).toHaveLength(34);
    expect(screen.getAllByRole("button").map((button) => button.title)).toEqual(items.map((item) => item.name));
    expect(screen.getByRole("button", { name: "Grouped Column. Selected" }).getAttribute("aria-pressed")).toBe("true");
    for (const item of items) fireEvent.click(screen.getByTitle(item.name));
    expect(onSelect.mock.calls).toEqual(items.map((item) => [item.modelType]));
  });
  it("keeps conditional items, unknown selection and scroll under caller control", () => {
    const onSelect = vi.fn();
    const groups = [{ name: "Conditional", items: [{ name: "Custom Combo", modelType: "customCombo" as const }] }];
    const { rerender } = render(<ChartTypeGallery groups={groups} selectedType="unknown" onSelect={onSelect} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    const gallery = screen.getByRole("region", { name: "Chart types" });
    gallery.scrollTop = 120;
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect.mock.calls).toEqual([["customCombo"]]);
    rerender(<ChartTypeGallery groups={groups} selectedType="customCombo" onSelect={onSelect} />);
    expect(screen.getByRole("region", { name: "Chart types" })).toBe(gallery);
    expect(gallery.scrollTop).toBe(120);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });
});
