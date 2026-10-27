import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ApplicationChartFamily } from "../../../src/components/General/Table/Chart/application/comboSessionTypes";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { SankeyChartEditor } from "../../../src/components/General/Table/Chart/caller/SankeyChartEditor";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { chartTypeGalleryGroups } from "../../../src/components/General/Table/Chart/editor/chartTypeGalleryCatalog";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { sessionFixture } from "./applicationSessionFixture";

vi.mock("~/lib/utils", () => ({
  cn: () => "",
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
afterEach(cleanup);
it("edits unmapped and failed graphs through the live owner, clears host geometry, retains chrome and refreshes", () => {
  const c = sessionFixture();
  const columns = [
    { id: "from", label: "From", role: "category" as const },
    { id: "to", label: "To", role: "category" as const },
    { id: "value", label: "Amount", role: "number" as const },
  ];
  const rows = [{ id: "r1", from: "Revenue", to: "Profit", value: 60 }];
  const api: any = {
    isDestroyed: () => false,
    getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
    getDisplayedRowCount: () => rows.length,
    getDisplayedRowAtIndex: (i: number) => rows[i],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
  };
  let owner: ReturnType<typeof useWidgetUpdates>;
  const wrapper = ({ children }: any) => {
    owner = useWidgetUpdates({
      initial: {
        id: "widget",
        storage: { chartModel: { chartType: "sankey" } },
        data: {},
      } as any,
      props: { uuid: "widget", activeDashboardId: "d" } as any,
      storeUpdateWidget: vi.fn(),
    });
    return (
      <WidgetTransactionContext.Provider value={owner.transactions}>
        {children}
      </WidgetTransactionContext.Provider>
    );
  };
  const hook = renderHook(
    ({ dark, revision }) =>
      useApplicationChartSession({
        ...c.inputs,
        columns,
        api,
        dataRevision: revision,
        range: {
          columnIds: columns.map((c) => c.id),
          originalRange: { columns: columns.map((c) => c.id) },
        },
        family: ((owner!.widget.storage as any).partition?.chartModel?.chartType ??
          "sankey") as ApplicationChartFamily,
        theme: projectCallerTheme(dark ? "dark" : "light", [], {}, "sankey"),
      }),
    { wrapper, initialProps: { dark: false, revision: 0 } },
  );
  act(() => hook.result.current.hostProps.onResize({ width: 700, height: 400 }));
  expect(hook.result.current.projection.status).toBe("invalid");
  expect(
    hook.result.current.sankeyEditor?.setupProps.selection.sourceColumnId,
  ).toBeNull();
  const dock: any = {
    open: true,
    activeTab: "setup",
    onTabChange: vi.fn(),
    onOpenChange: vi.fn(),
    themeResetKey: "light",
    galleryProps: {
      groups: chartTypeGalleryGroups,
      selectedType: "sankey",
      onSelect: vi.fn(),
    },
  };
  const panel = () => (
    <SankeyChartEditor
      projection={hook.result.current.sankeyEditor!}
      dock={dock}
      onSetup={hook.result.current.onSankeySetup}
      onIntent={hook.result.current.onIntent}
    />
  );
  const view = render(panel());
  for (const [label, value] of [
    ["Source", "from"],
    ["Target", "to"],
    ["Value", "value"],
  ]) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), {
      target: { value },
    });
    view.rerender(panel());
  }
  expect(hook.result.current.projection.status).toBe("ready");
  const readyKey = hook.result.current.hostKey;
  const revision = hook.result.current.hostProps.revision;
  fireEvent.change(screen.getByRole("combobox", { name: "Target" }), {
    target: { value: "from" },
  });
  view.rerender(panel());
  expect(hook.result.current.projection.status).toBe("invalid");
  expect(hook.result.current.hostProps.options).toEqual({});
  expect(hook.result.current.hostProps.revision).toBeGreaterThan(revision);
  expect(hook.result.current.hostKey).not.toBe(readyKey);
  expect(screen.getByRole("combobox", { name: "Target" })).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Target" }), {
    target: { value: "to" },
  });
  expect(hook.result.current.projection.status).toBe("ready");
  act(() =>
    hook.result.current.onIntent({
      panel: "tooltips",
      edit: { field: "enabled", value: false },
    }),
  );
  hook.rerender({ dark: true, revision: 0 });
  expect(hook.result.current.sankeyEditor?.editor?.tooltips.value.enabled).toBe(false);
  expect(
    hook.result.current.sankeyEditor?.editor?.background.value.fill.toLowerCase(),
  ).toBe("#151518");
  rows[0].value = 0;
  hook.rerender({ dark: true, revision: 1 });
  expect(hook.result.current.projection.status).not.toBe("ready");
  expect(hook.result.current.sankeyEditor?.notice).toBe("All selected links are zero");
  act(() => hook.result.current.onChartType("line"));
  expect((owner!.widget.storage as any).partition.chartModel.chartType).toBe("line");
  act(() => hook.result.current.onChartType("sankey"));
  expect(hook.result.current.sankeyEditor?.setupProps.selection.targetColumnId).toBe(
    "to",
  );
  expect(
    (owner!.widget.storage as any).partition.sankey.sankeySetup.valueColumnId,
  ).toBe("value");
});
