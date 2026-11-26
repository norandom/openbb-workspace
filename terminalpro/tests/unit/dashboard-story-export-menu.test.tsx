import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import ExportTemplatePopup from "~/components/General/ExportTemplatePopup";
import { DashboardPopup } from "~/components/LayoutAuth/DropdownSubs/DashboardPopup";
import { RESEARCH_STORY_ID } from "~/lib/modeling/storyState";
import { useTemplateExportStore } from "~/lib/state/exportTemplate";

const { dispatchSaveState } = vi.hoisted(() => ({ dispatchSaveState: vi.fn() }));

type MenuWidget = {
  type: string;
  widgetId: string;
  sourceId?: string;
  connectionType?: string;
  endpoint?: string;
};

const source = { id: "catalog", status: "success" };
const reopenedStory = {
  type: RESEARCH_STORY_ID,
  widgetId: RESEARCH_STORY_ID,
  sourceId: source.id,
};
type Dashboard = { data: { widgets: MenuWidget[] } };
const useApp = create<{ items: Record<string, Dashboard>; getTabById: (id: string) => Dashboard }>(
  () => ({ items: {}, getTabById: (id) => useApp.getState().items[id] }),
);
const useBackends = create(() => ({
  apiSources: [source],
  getApiSourceById: (id: string): typeof source | undefined =>
    useBackends.getState().apiSources.find((candidate) => candidate.id === id),
}));

function setWidgets(widgets: MenuWidget[], id = "dashboard") {
  useApp.setState(({ items }) => ({ items: { ...items, [id]: { data: { widgets } } } }));
}

vi.mock("~/lib/state/app", () => ({
  useShallowAppStore: (selector) => useApp(useShallow(selector)),
}));
vi.mock("~/lib/state/backendConnector", () => ({
  useShallowBackendConnectorStore: (selector) => useBackends(selector),
  useBackendConnectorStore: { getState: () => useBackends.getState() },
}));
vi.mock("~/lib/state/featureFlags", () => ({
  useShallowFeatureFlagsStore: (selector) => selector({ featureFlags: { tier: "pro" } }),
}));
vi.mock("~/lib/state/theme", () => ({
  useShallowThemeStore: (selector) => selector({}),
}));
vi.mock("~/lib/utils", () => ({ dispatchSaveState, slugify: (name: string) => name }));
vi.mock("~/lib/utils/createTemplates", () => ({ extractCustomTemplateInfo: () => null }));
vi.mock("~/components/AI/hooks/useGetAppWidgets", () => ({
  useGetWidgetsStore: { getState: () => ({ getAppWidget: vi.fn() }) },
}));
vi.mock("~/lib/utils/exportTemplate", () => ({
  formatDashboardDataForTemplate: (dashboardData, formData) => ({
    name: formData.name,
    widgetIds: dashboardData.widgets.map((widget) => widget.widgetId),
  }),
}));
vi.mock("~/components/General/AppDialog/AppDialogShell", () => ({
  AppDialogShell: ({ open, footer, form, onSubmit }) => open && (
    <form aria-label="Export App" onSubmit={form.handleSubmit(onSubmit)}>
      <input aria-label="Name" {...form.register("name")} />
      <input aria-label="Description" {...form.register("description")} />
      {footer}
    </form>
  ),
}));
vi.mock("~/components/LayoutAuth/DropdownSubs/MoveTo", () => ({ default: () => null }));
vi.mock("~/components/General/FeatureLock", () => ({ default: ({ children }) => children }));
vi.mock("~/components/Tooltip", () => ({ default: ({ children }) => children }));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "dashboard" }),
}));

function menu(id: string) {
  return (
    <DropdownMenu.Root modal={false} open>
      <DropdownMenu.Content>
        <DashboardPopup
          item={{ index: id, data: { name: "Dashboard" } }}
          deleteItem={vi.fn()}
          depth={0}
        />
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function renderMenu() {
  return render(<>{menu("dashboard")}<ExportTemplatePopup /></>);
}

function selectExport() {
  fireEvent.click(screen.getByRole("menuitem", { name: "Export apps.json" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useApp.setState({ items: {} });
  useTemplateExportStore.getState().setDashboardId(null);
  setWidgets([]);
  useBackends.setState({ apiSources: [source] });
});
afterEach(cleanup);

it("opens export after a saved story hydrates without backend connection metadata", () => {
  renderMenu();
  selectExport();
  expect(screen.queryByRole("form", { name: "Export App" })).not.toBeInTheDocument();

  act(() => setWidgets([reopenedStory]));
  selectExport();
  expect(dispatchSaveState).toHaveBeenCalledOnce();
  expect(screen.getByRole("form", { name: "Export App" })).toBeInTheDocument();
});

it.each([
  { ...reopenedStory, sourceId: "foreign-catalog" },
  { ...reopenedStory, widgetId: "foreign-widget", connectionType: "advanced-backend" },
  { ...reopenedStory, type: "table", connectionType: "advanced-backend" },
  { ...reopenedStory, endpoint: "https://foreign.test/story" },
])("keeps export disabled for an unadmitted story declaration %j", (widget) => {
  setWidgets([widget]);
  renderMenu();
  selectExport();
  expect(dispatchSaveState).not.toHaveBeenCalled();
  expect(screen.queryByRole("form", { name: "Export App" })).not.toBeInTheDocument();
});

it("enables export when the reopened story's source finishes loading", () => {
  setWidgets([reopenedStory]);
  useBackends.setState({ apiSources: [] });
  renderMenu();
  selectExport();
  expect(screen.queryByRole("form", { name: "Export App" })).not.toBeInTheDocument();

  act(() => useBackends.setState({ apiSources: [source] }));
  selectExport();
  expect(screen.getByRole("form", { name: "Export App" })).toBeInTheDocument();
});

it("still exports a dashboard with a legacy advanced backend widget", () => {
  setWidgets([{ type: "table", widgetId: "prices", connectionType: "advanced-backend" }]);
  renderMenu();
  selectExport();
  expect(screen.getByRole("form", { name: "Export App" })).toBeInTheDocument();
});

it("copies the selected sidebar dashboard and clears the selection on cancel", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    setWidgets([{ type: "table", widgetId: "prices", connectionType: "advanced-backend" }]);
    setWidgets([reopenedStory], "story-dashboard");
    const view = render(<>{menu("story-dashboard")}<ExportTemplatePopup /></>);

    selectExport();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Export App" })).not.toBeInTheDocument();

    selectExport();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Story" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Saved story" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({
      name: "Story",
      widgetIds: [RESEARCH_STORY_ID],
    });

    view.rerender(<>{menu("dashboard")}<ExportTemplatePopup /></>);
    selectExport();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Prices" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Active dashboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(JSON.parse(writeText.mock.calls[1][0])).toEqual({ name: "Prices", widgetIds: ["prices"] });
  } finally {
    Reflect.deleteProperty(navigator, "clipboard");
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  }
});
