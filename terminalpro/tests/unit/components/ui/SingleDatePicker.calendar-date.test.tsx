import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { afterEach, expect, it, vi } from "vitest";
import { SingleDatePicker } from "~/components/ui/SingleDatePicker";

dayjs.extend(utc);
const calendar = vi.hoisted(() => ({ year: 2025, month: 0, day: 3 }));
vi.mock("~/components/ui/Calendar", () => ({
  Calendar: ({ onSelect }: any) => (
    <button
      type="button"
      onClick={() => onSelect(new Date(calendar.year, calendar.month, calendar.day))}
    >
      Select calendar day
    </button>
  ),
}));
vi.mock("~/components/General/Table/AgGridUtils", async () => {
  const { formatDate } = await import(
    "../../../../src/components/General/Table/ColumnValues"
  );
  return { formatDate };
});
vi.mock("~/components/Tooltip", () => ({ default: ({ children }: any) => children }));
vi.mock("~/components/Widgets/Helpers/GroupDropdown", async () => {
  const { createContext } = await import("react");
  return { GroupDropdownAnchorContext: createContext(null) };
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it.each([
  ["Europe/Berlin", 2025, 0, 3, "2025-01-03"],
  ["Europe/Berlin", 2025, 0, 1, "2025-01-01"],
  ["Europe/Berlin", 2025, 2, 30, "2025-03-30"],
  ["UTC", 2025, 0, 3, "2025-01-03"],
  ["America/New_York", 2025, 0, 3, "2025-01-03"],
  ["America/New_York", 2025, 0, 1, "2025-01-01"],
])("saves the selected calendar day in %s (%s-%s-%s)", async (zone, year, month, day, expected) => {
  vi.stubEnv("TZ", zone);
  Object.assign(calendar, { year, month, day });
  const onSave = vi.fn();
  render(<SingleDatePicker defaultDate="2025-01-02" onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Jan 02, 2025" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select calendar day" }));
  expect(onSave).toHaveBeenCalledExactlyOnceWith(expected);
});

it("clears a date without serializing an instant", async () => {
  vi.stubEnv("TZ", "Europe/Berlin");
  const onSave = vi.fn();
  render(<SingleDatePicker defaultDate="2025-01-02" onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Jan 02, 2025" }));
  fireEvent.click(await screen.findByRole("button", { name: "Clear" }));
  expect(onSave).toHaveBeenCalledExactlyOnceWith("");
});
