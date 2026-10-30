import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompareTermsParam from "~/components/General/Table/NavBar/CompareTermsParam";

vi.unmock("~/components/Icon");
vi.mock("~/components/General/Table/AgGridUtils", () => ({
  convertToReadableLabel: (value: string) => value,
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateKey: () => "test",
}));

function mount(value = "") {
  const update = vi.fn();
  const props = { selectedLabel: "Symbols", onUpdateParam: update };
  const view = render(<CompareTermsParam {...props} value={value} />);
  return {
    ...view,
    update,
    setValue: (next: string) =>
      view.rerender(<CompareTermsParam {...props} value={next} />),
  };
}

async function openEditor() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole("button", { expanded: false }));
  await act(async () => {});
  return screen.getByPlaceholderText("Add search term");
}

function addTerms(value: string) {
  const input = screen.getByPlaceholderText("Add search term");
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function removeTerm(value: string) {
  const row = within(screen.getByRole("menu")).getByText(value).parentElement;
  const remove = row?.querySelector("svg");
  expect(remove).not.toBeNull();
  fireEvent.click(remove!);
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("controlled comparison terms", () => {
  it("preserves the externally supplied symbol when adding a comparison", async () => {
    const view = mount();
    view.setValue("AAPL");
    const input = await openEditor();
    expect(input).toHaveFocus();

    addTerms("MSFT");

    expect(within(screen.getByRole("menu")).getByText("AAPL")).toBeVisible();
    expect(within(screen.getByRole("menu")).getByText("MSFT")).toBeVisible();
    expect(
      screen.getByRole("button", { expanded: true, hidden: true }),
    ).toHaveTextContent("Symbols (2)");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    await tick(599);
    expect(view.update).not.toHaveBeenCalled();
    await tick(1);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("AAPL,MSFT");
    expect(screen.getByRole("menu")).toBeVisible();
    expect(input).toHaveFocus();
  });

  it("removes from the current controlled list after an external replacement", async () => {
    const view = mount("AAPL");
    view.setValue("MSFT,GOOGL");
    await openEditor();

    removeTerm("MSFT");

    expect(within(screen.getByRole("menu")).getByText("GOOGL")).toBeVisible();
    expect(within(screen.getByRole("menu")).queryByText("MSFT")).toBeNull();
    expect(
      screen.getByRole("button", { expanded: true, hidden: true }),
    ).toHaveTextContent("GOOGL");
    await tick(600);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("GOOGL");
  });

  it("uses a later external value after the previous edit was committed", async () => {
    const view = mount("AAPL");
    await openEditor();
    addTerms("MSFT");
    await tick(600);
    expect(view.update).toHaveBeenLastCalledWith("AAPL,MSFT");
    view.setValue("AAPL,MSFT");
    view.setValue("TSLA");

    addTerms("NVDA");
    await tick(600);

    expect(view.update).toHaveBeenCalledTimes(2);
    expect(view.update).toHaveBeenLastCalledWith("TSLA,NVDA");
  });

  it("preserves an open editor and draft when the controlled value changes", async () => {
    const view = mount("AAPL");
    const input = await openEditor();
    fireEvent.change(input, { target: { value: "MSFT" } });

    view.setValue("TSLA");

    expect(screen.getByRole("menu")).toBeVisible();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("MSFT");
    fireEvent.keyDown(input, { key: "Enter" });
    await tick(600);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("TSLA,MSFT");
  });

  it("composes rapid additions and removals until the latest debounce expires", async () => {
    const view = mount("AAPL");
    await openEditor();
    addTerms("MSFT");
    await tick(300);
    addTerms("GOOGL");
    await tick(300);
    removeTerm("AAPL");

    expect(within(screen.getByRole("menu")).getByText("MSFT")).toBeVisible();
    expect(within(screen.getByRole("menu")).getByText("GOOGL")).toBeVisible();
    expect(within(screen.getByRole("menu")).queryByText("AAPL")).toBeNull();
    await tick(599);
    expect(view.update).not.toHaveBeenCalled();
    await tick(1);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("MSFT,GOOGL");
  });

  it("keeps trimmed comma entry and duplicate suppression", async () => {
    const view = mount(" AAPL ");
    const input = await openEditor();
    addTerms("AAPL, , AAPL ");
    expect(input).toHaveValue("");
    await tick(600);
    expect(view.update).not.toHaveBeenCalled();

    addTerms(" MSFT, GOOGL, MSFT ");
    await tick(600);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("AAPL,MSFT,GOOGL");
  });

  it("commits an empty string when removing the last term", async () => {
    const view = mount("AAPL");
    await openEditor();
    removeTerm("AAPL");
    expect(screen.getByText("No terms added")).toBeVisible();
    await tick(600);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("");
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("cancels a pending write when an external choice replaces the comparison", async () => {
    const view = mount("AAPL");
    const input = await openEditor();
    addTerms("MSFT");
    await tick(300);
    fireEvent.change(input, { target: { value: "NVDA" } });

    view.setValue("TSLA");

    expect(within(screen.getByRole("menu")).getByText("TSLA")).toBeVisible();
    expect(within(screen.getByRole("menu")).queryByText("AAPL")).toBeNull();
    expect(within(screen.getByRole("menu")).queryByText("MSFT")).toBeNull();
    expect(input).toHaveValue("NVDA");
    expect(input).toHaveFocus();
    await tick(600);
    expect(view.update).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await tick(600);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("TSLA,NVDA");
  });

  it("does not resurrect a pending comparison after external clearing", async () => {
    const view = mount("AAPL");
    await openEditor();
    addTerms("MSFT");
    await tick(300);

    view.setValue("");
    await tick(600);

    expect(view.update).not.toHaveBeenCalled();
    expect(screen.getByText("No terms added")).toBeVisible();
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("keeps pending edits when only controlled CSV formatting changes", async () => {
    const view = mount("AAPL");
    await openEditor();
    addTerms("MSFT");
    await tick(300);

    view.setValue(" AAPL, ");

    expect(within(screen.getByRole("menu")).getByText("MSFT")).toBeVisible();
    await tick(299);
    expect(view.update).not.toHaveBeenCalled();
    await tick(1);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("AAPL,MSFT");
  });

  it("preserves a new search draft when the parent acknowledges a committed list", async () => {
    const view = mount("AAPL");
    const input = await openEditor();
    addTerms("MSFT");
    await tick(300);
    fireEvent.change(input, { target: { value: "GOOGL" } });
    await tick(300);
    expect(view.update).toHaveBeenCalledExactlyOnceWith("AAPL,MSFT");

    view.setValue("AAPL,MSFT");

    expect(screen.getByRole("menu")).toBeVisible();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("GOOGL");
    fireEvent.keyDown(input, { key: "Enter" });
    await tick(600);
    expect(view.update).toHaveBeenCalledTimes(2);
    expect(view.update).toHaveBeenLastCalledWith("AAPL,MSFT,GOOGL");
  });
  it("cancels a pending callback on unmount", async () => {
    const view = mount("AAPL");
    await openEditor();
    addTerms("MSFT");
    await tick(300);
    view.unmount();
    await tick(600);
    expect(view.update).not.toHaveBeenCalled();
  });
});
