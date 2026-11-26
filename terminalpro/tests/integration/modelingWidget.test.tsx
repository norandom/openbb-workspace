import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexAppWidgets } from "~/components/AI/hooks/indexAppWidgets";
import { WidgetComponent } from "~/components/Widget";
import type { WidgetT } from "~/components/types";
import { modelingWidgets } from "~/lib/modeling/catalog";
import { FCF_WIDGET, SAVED_WIDGET } from "~/lib/modeling/contract";
import { createWidgetEndpoint } from "~/lib/utils/widgetParams";
import snapshot from "../fixtures/modeling/fcf-input.json";
import projections from "../fixtures/modeling/saved-projections.json";

const fixture = vi.hoisted(() => ({
  transport: vi.fn(),
  owner: { uuid: "12345678-1234-4abc-8def-123456789abc", token: "synthetic-session" },
  host: {} as any,
}));

vi.mock("~/lib/modeling/evaluationClient", async (original) => {
  const actual = await original<typeof import("~/lib/modeling/evaluationClient")>();
  return {
    ...actual,
    createEvaluationClient: (getToken: () => string) =>
      actual.createEvaluationClient(getToken, fixture.transport),
  };
});

vi.mock("~/lib/state/auth", () => ({
  useAuthStore: Object.assign(
    (select: (state: { user: typeof fixture.owner }) => unknown) =>
      select({ user: fixture.owner }),
    { getState: () => ({ user: fixture.owner }) },
  ),
}));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => fixture.host,
}));
vi.mock("~/components/DraggableCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("~/components/Widgets", () => ({
  getWidgetComponent: () => undefined,
  isAgGridWidget: () => false,
  default: { AgGridTable: () => <p>Direct provider table</p> },
}));
vi.mock("~/components/General/Table/hooks/useTableContext", () => ({
  Table: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/General/Table/NavBar/QueryParams", () => ({
  useWidgetParamsPositions: () => ({}),
}));
vi.mock("~/lib/contexts/TabContext", () => ({ useTabContext: () => ({}) }));
vi.mock("~/lib/state/app", () => ({ useAppStore: () => ({}) }));
vi.mock("~/lib/utils", () => ({ getCleanWidgetId: (value: string) => value }));

const id = projections.zero.run_id;
const day = snapshot.cutoff.observation_date;
const fcf = {
  snapshot: JSON.stringify(snapshot),
  assumption_version: "1",
  effective_date: day,
  capex_sign: "cash_outflow_negative",
};
const run = {
  schema_version: "1",
  run_id: id,
  created_at: "2024-05-03T16:00:00Z",
  descriptor: { model_id: "issuer_fcf_yield", method_version: "1" },
  assumptions: {
    version: fcf.assumption_version,
    effective_date: day,
    assumptions: [
      {
        assumption_id: "capex_sign",
        value: fcf.capex_sign,
        origin: "user_supplied",
        author: fixture.owner.uuid,
        rationale: "Snapshot convention",
      },
    ],
  },
};
const result = {
  ...projections.zero,
  results: [
    { ...projections.zero.results[0], output_id: "fcf_yield", unit: "percent" },
  ],
};

function mount(base: Partial<WidgetT>, savedParams: Record<string, string>) {
  let persisted = savedParams;
  function Host() {
    const [widget, setWidget] = useState({
      ...base,
      id: "widget-1",
      storage: { params: savedParams },
    });
    fixture.host = {
      widget,
      updateWidget: (
        update: (previous: typeof widget) => typeof widget,
        force: boolean,
      ) => {
        expect(force).toBe(true);
        setWidget((previous) => {
          const next = update(previous);
          persisted = structuredClone(next.storage.params);
          return next;
        });
      },
    };
    return <WidgetComponent />;
  }
  return { ...render(<Host />), saved: () => persisted };
}

function success(value: unknown) {
  return Response.json(value);
}

afterEach(() => {
  cleanup();
  fixture.transport.mockReset();
});

describe("modeling through Workspace WidgetComponent", () => {
  const evaluator = modelingWidgets.find(
    (widget) => String(widget.widgetId) === FCF_WIDGET,
  );
  const saved = modelingWidgets.find(
    (widget) => String(widget.widgetId) === SAVED_WIDGET,
  );

  it("registers both modeling widgets in the native catalog without a service fetch", () => {
    const directProvider: WidgetT = {
      ...saved,
      widgetId: "provider-direct",
      sourceName: "Direct data",
    };
    const library = indexAppWidgets({
      apiEndpointWidgets: [],
      openbbSandboxWidgets: [],
      openbbHubWidgets: [],
      openbbWorkspaceWidgets: [],
      openbbStudioWidgets: [],
      customBackendWidgets: [directProvider],
      sharedUserAppWidgets: [],
      sharedWidgets: [],
    });
    expect(
      [...library.get("QOpenBB Modeling").values()].map((widget) => widget.name),
    ).toEqual(["Saved model output", "Issuer FCF yield"]);
    expect(library.get("Direct data").get("provider-direct")).toBe(directProvider);
    expect(fixture.transport).not.toHaveBeenCalled();
  });

  it("evaluates explicitly, shows checks and assumptions, and reopens read-only from native parameters", async () => {
    fixture.transport.mockImplementation((path: string, init: RequestInit) =>
      Promise.resolve(
        success(init.method === "POST" || path.includes("/runs/") ? run : result),
      ),
    );
    const first = mount(evaluator, fcf);
    expect(fixture.transport).not.toHaveBeenCalled();
    expect(createWidgetEndpoint(evaluator.endpoint).method).toBe("POST");
    expect(createWidgetEndpoint(saved.endpoint).method).toBe("GET");
    expect(createWidgetEndpoint("/data/provider").method).toBe("GET");
    fireEvent.click(screen.getByRole("button", { name: "Evaluate FCF yield" }));
    await screen.findByText("verified", { exact: true });
    expect(screen.getByText(/capex_sign = cash_outflow_negative/)).toBeVisible();
    expect(screen.getByText("Checks and verification")).toBeVisible();
    expect(screen.getByText("Trace", { exact: true })).toBeVisible();
    expect(first.saved()).toMatchObject({ ...fcf, run_id: id });
    const persisted = first.saved();
    first.unmount();

    mount(evaluator, persisted);
    expect(screen.getByLabelText("Assumption version")).toHaveValue(
      fcf.assumption_version,
    );
    expect(screen.getByLabelText("Input snapshot JSON")).toHaveValue(fcf.snapshot);
    await screen.findByText("verified", { exact: true });
    fireEvent.click(screen.getByRole("button", { name: "Refresh saved result" }));
    await waitFor(() => expect(fixture.transport).toHaveBeenCalledTimes(7));
    expect(fixture.transport.mock.calls.map(([, init]) => init.method)).toEqual([
      "POST",
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
    ]);
  });

  it("marks an edited result stale and keeps it visible on explicit evaluation failure", async () => {
    fixture.transport
      .mockResolvedValueOnce(success(run))
      .mockResolvedValueOnce(success(result))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    const mounted = mount(evaluator, { ...fcf, run_id: id, evaluated: id });
    await screen.findByText("verified", { exact: true });
    fireEvent.change(screen.getByLabelText("Assumption version"), {
      target: { value: "changed" },
    });
    expect(screen.getByText("Showing a stale saved result.")).toBeVisible();
    expect(fixture.transport).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Evaluate FCF yield" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("503");
    expect(screen.getByText(id, { exact: true })).toBeVisible();
    expect(mounted.saved()).toMatchObject({
      run_id: id,
      evaluated: "",
      assumption_version: "changed",
    });
    expect(fixture.transport.mock.calls.map(([, init]) => init.method)).toEqual([
      "GET",
      "GET",
      "POST",
    ]);
  });

  it("retains a stale result on refresh failure and keeps the direct provider dispatch available", async () => {
    fixture.transport
      .mockResolvedValueOnce(success(run))
      .mockResolvedValueOnce(success(result))
      .mockResolvedValue(new Response("", { status: 503 }));
    const output = mount(saved, { run_id: id, output_id: "fcf_yield" });
    await screen.findByText("verified", { exact: true });
    expect(screen.queryByRole("button", { name: "Evaluate FCF yield" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh saved result" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("503");
    const region = screen.getByRole("region", { name: "Saved modeling result" });
    expect(within(region).getByText("stale", { exact: true })).toBeVisible();
    expect(
      fixture.transport.mock.calls.every(([, init]) => init.method === "GET"),
    ).toBe(true);

    output.unmount();
    mount(
      {
        widgetId: "provider-direct",
        endpoint: { url: "/data/provider", method: "GET", query: {}, headers: {} },
      },
      {},
    );
    expect(screen.getByText("Direct provider table")).toBeVisible();
  });
});
