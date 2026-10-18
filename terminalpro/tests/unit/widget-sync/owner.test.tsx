import { StrictMode, startTransition, useEffect, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetT, WidgetProps } from "~/components/types";
import { useWidgetSync } from "~/components/Widget.hooks";
import { reduceWidget, type Operation } from "~/components/widgetSync/updates";

const mocks = vi.hoisted(() => ({
  store: vi.fn(),
  override: vi.fn(),
  shared: false,
  subscribe: vi.fn(),
  sharedSubscribe: vi.fn(),
  listener: null as any,
  replay: null as any,
  widget: {
    id: "w",
    name: "Original",
    type: "omni",
    data: {},
    storage: { params: {} },
  } as any,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) => {
      const [state, set] = actual.useState(initial);
      return [
        state,
        (update: any) => {
          if (typeof update === "function") mocks.replay = update;
          set(update);
        },
      ];
    },
    useReducer: (reducer: any, initial: any) => {
      const [state, dispatch] = actual.useReducer(reducer, initial);
      const stateRef = actual.useRef(state);
      stateRef.current = state;
      const wrapped = actual.useCallback(
        (action: any) => {
          if (action.type === "update")
            mocks.replay = (widget: any) =>
              reducer({ ...stateRef.current, widget }, action).widget;
          dispatch(action);
        },
        [dispatch],
      );
      return [state, wrapped];
    },
  };
});
vi.mock("~/lib/contexts/TabContext", () => ({
  useTabContext: () => ({ getWidget: () => mocks.widget, isShared: mocks.shared }),
}));
vi.mock("~/lib/state/app", () => ({
  useAppStore: { subscribe: (...args: any[]) => mocks.subscribe(...args) },
  useShallowAppStore: (select: any) => select({ updateWidget: mocks.store }),
}));
vi.mock("~/lib/state/sharedApp", () => ({
  useSharedAppStore: { subscribe: (...args: any[]) => mocks.sharedSubscribe(...args) },
}));
vi.mock("~/components/General/Table/hooks/utils", () => ({
  useIsFirstRender: () => false,
}));
vi.mock("~/lib/utils", () => ({
  getJsonWidget: (w: any) => w,
  getWidgetInfo: () => "info",
  getCellOnClickParams: () => ["symbol"],
  getEndpointParamGroupByIds: () => ({ ticker: "symbol" }),
  getEndpointParamName: () => "symbol",
  isOmniType: (t: string) => t === "omni",
  isSSRMType: () => false,
  addToWidgetParamGroups: (acc: any, g: any) => ({ ...acc, [g.groupById]: g.id }),
  needsGroupValueUpdate: (w: any, g: any) => w.storage.params[g.groupById] !== g.value,
  updateWidgetGroupValues: (w: any, groups: any[]) => {
    for (const group of groups ?? []) w.storage.params[group.groupById] = group.value;
    return w;
  },
  triggerCustomEvent: (name: string, detail?: any) =>
    window.dispatchEvent(new CustomEvent(name, { detail })),
  useEventListener: (name: string, callback: any) =>
    useEffect(() => {
      const listener = (e: any) => callback(e.detail);
      window.addEventListener(name, listener);
      return () => window.removeEventListener(name, listener);
    }, [name, callback]),
}));
const props = { uuid: "w", activeDashboardId: "dashboard" } as WidgetProps;
const strict = ({ children }: any) => <StrictMode>{children}</StrictMode>;
const fire = (name: string) =>
  act(() => {
    window.dispatchEvent(new CustomEvent(name));
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.shared = false;
  mocks.widget = {
    id: "w",
    name: "Original",
    type: "omni",
    data: {},
    storage: { params: {} },
  };
  const subscribe = (_select: any, listener: any) => {
    mocks.listener = listener;
    return vi.fn();
  };
  mocks.subscribe.mockImplementation(subscribe);
  mocks.sharedSubscribe.mockImplementation(subscribe);
});
afterEach(cleanup);

describe("production widget owner", () => {
  it.each([
    true,
    false,
  ])("rebases atomic chart runtime and a following command when urgent eligibility begins %s", async (initiallyAllowed) => {
    mocks.widget = { ...mocks.widget, storage: { allowed: initiallyAllowed } };
    const { result } = renderHook(() => useWidgetSync(props), { wrapper: strict });
    const token = Symbol("chart");
    act(() => result.current[3].register(token, () => ({ angle: 0, following: -1 })));
    const rotate = (widget: WidgetT, value: { angle: number; following: number }) =>
      widget.storage.allowed
        ? {
            widget: { ...widget, storage: { ...widget.storage, angle: 40 } },
            value: { ...value, angle: 40 },
          }
        : { widget, value };
    await act(async () => {
      startTransition(() =>
        result.current[0]((w) => ({
          ...w,
          storage: { ...w.storage, allowed: !initiallyAllowed },
        })),
      );
      flushSync(() => result.current[3].transact(token, rotate));
      flushSync(() =>
        result.current[3].transact(
          token,
          (widget, value: { angle: number; following: number }) => ({
            widget: {
              ...widget,
              storage: { ...widget.storage, following: value.angle },
            },
            value: { ...value, following: value.angle },
          }),
        ),
      );
    });
    const expected = initiallyAllowed ? 0 : 40;
    expect(result.current[3].scope?.value).toEqual({
      angle: expected,
      following: expected,
    });
    expect(result.current[1].storage.following).toBe(expected);
    fire("saveWidgets");
    expect(mocks.store.mock.calls.at(-1)?.[1].storage.following).toBe(expected);
    expect(mocks.store.mock.calls.at(-1)?.[1]).not.toHaveProperty("scope");
  });
  it("requires explicit scope registration and isolates late cleanup and transactions", () => {
    const { result } = renderHook(() => useWidgetSync(props), { wrapper: strict });
    const old = Symbol("old");
    const current = Symbol("current");
    const reduce = vi.fn((widget, value: number) => ({ widget, value: value + 1 }));
    act(() => result.current[3].register(old, () => 0));
    act(() => result.current[3].release(old));
    act(() => result.current[3].transact(old, reduce));
    expect(reduce).not.toHaveBeenCalled();
    act(() => result.current[3].register(current, () => 10));
    act(() => {
      result.current[3].release(old);
      result.current[3].transact(old, reduce);
    });
    expect(result.current[3].scope?.value).toBe(10);
    expect(mocks.store).not.toHaveBeenCalled();
    act(() => result.current[3].transact(current, reduce));
    expect(result.current[3].scope?.value).toBe(11);
    fire("saveWidgets");
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it("replays the production submitted calculation against an intervening field without effects", async () => {
    const { result } = renderHook(() => useWidgetSync(props));
    act(() => result.current[0]((w) => ({ ...w, description: "edit" })));
    const calculate = mocks.replay;
    const calls = mocks.store.mock.calls.length;
    expect(calculate({ ...mocks.widget, name: "A" }).name).toBe("A");
    expect(calculate({ ...mocks.widget, name: "B" }).name).toBe("B");
    await Promise.resolve();
    expect(mocks.store).toHaveBeenCalledTimes(calls);
  });
  it("replays the same functional request against its supplied current fields without effects", () => {
    const update = vi.fn((w: WidgetT) => ({ ...w, description: "edited" }));
    const operation: Operation = {
      type: "update",
      id: 1,
      update,
      overridden: false,
      dashboardId: "dashboard",
      paramNames: {},
    };
    const a = { widget: mocks.widget, dirty: false, effects: [], revision: 0 };
    const b = { ...a, widget: { ...mocks.widget, name: "Intervening" } };
    expect(reduceWidget(a, operation).widget.name).toBe("Original");
    expect(reduceWidget(b, operation).widget.name).toBe("Intervening");
    expect(operation.update).toBe(update);
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it("keeps two batched functional edits and delivers persisted snapshots once in order under StrictMode", () => {
    const { result } = renderHook(() => useWidgetSync(props), { wrapper: strict });
    act(() => {
      result.current[0]((w) => ({ ...w, name: "First" }));
      result.current[0]((w) => ({ ...w, description: "Second" }));
    });
    expect(result.current[1]).toMatchObject({ name: "First", description: "Second" });
    expect(mocks.store.mock.calls.map((c) => [c[1].name, c[1].description])).toEqual([
      ["First", undefined],
      ["First", "Second"],
    ]);
  });
  it("persists a deferred edit rebased after an urgent edit", async () => {
    const { result } = renderHook(() => useWidgetSync(props));
    await act(async () => {
      startTransition(() =>
        result.current[0]((w) => ({ ...w, description: "deferred" })),
      );
      result.current[0]((w) => ({ ...w, name: "urgent" }));
    });
    expect(result.current[1]).toMatchObject({
      name: "urgent",
      description: "deferred",
    });
    expect(mocks.store.mock.calls.at(-1)?.[1]).toMatchObject({
      name: "urgent",
      description: "deferred",
    });
  });
  it("retains urgent persistence when a fresh local edit follows deferred work", async () => {
    const { result } = renderHook(() => useWidgetSync(props));
    await act(async () => {
      startTransition(() =>
        result.current[0]((w) => ({ ...w, description: "deferred" })),
      );
      flushSync(() => result.current[0]((w) => ({ ...w, name: "urgent" })));
      startTransition(() =>
        result.current[0]((w) => ({ ...w, storage: { ...w.storage, color: "local" } })),
      );
    });
    expect(result.current[1]).toMatchObject({
      name: "urgent",
      description: "deferred",
    });
    expect(mocks.store.mock.calls.at(-1)?.[1]).toMatchObject({
      name: "urgent",
      description: "deferred",
    });
  });
  it("reconciles deferred override delivery with the committed urgent fields", async () => {
    const { result } = renderHook(() =>
      useWidgetSync({
        ...props,
        contextOverride: { widget: mocks.widget, updateWidget: mocks.override },
      }),
    );
    await act(async () => {
      startTransition(() =>
        result.current[0]((w) => ({ ...w, description: "deferred" })),
      );
      result.current[0]((w) => ({ ...w, name: "urgent" }));
    });
    expect(mocks.override).toHaveBeenCalledTimes(2);
    expect(mocks.override.mock.calls.at(-1)?.[0]).toMatchObject({
      name: "urgent",
      description: "deferred",
    });
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it("keeps deferred dirtiness when an urgent commit was explicitly saved", async () => {
    const { result, unmount } = renderHook(() => useWidgetSync(props));
    await act(async () => {
      startTransition(() =>
        result.current[0]((w) => ({ ...w, storage: { ...w.storage, deferred: true } })),
      );
      flushSync(() =>
        result.current[0]((w) => ({ ...w, storage: { ...w.storage, urgent: true } })),
      );
      window.dispatchEvent(new CustomEvent("saveWidgets"));
    });
    expect(mocks.store).toHaveBeenCalledTimes(1);
    unmount();
    expect(mocks.store).toHaveBeenCalledTimes(2);
    expect(mocks.store.mock.calls.at(-1)?.[1].storage).toMatchObject({
      deferred: true,
      urgent: true,
    });
  });
  it("saves committed ordinary edits on the explicit save and cleanup", () => {
    const { result, unmount } = renderHook(() => useWidgetSync(props));
    act(() =>
      result.current[0]((w) => ({ ...w, storage: { ...w.storage, color: "red" } })),
    );
    expect(mocks.store).not.toHaveBeenCalled();
    fire("saveWidgets");
    expect(mocks.store).toHaveBeenLastCalledWith("dashboard", result.current[1]);
    fire("saveWidgets");
    expect(mocks.store).toHaveBeenCalledTimes(1);
    act(() =>
      result.current[0]((w) => ({ ...w, storage: { ...w.storage, color: "blue" } })),
    );
    unmount();
    expect(mocks.store.mock.calls.at(-1)?.[1].storage.color).toBe("blue");
  });
  it("exposes the committed edit before a consuming layout save", () => {
    const { result } = renderHook(() => {
      const sync = useWidgetSync(props);
      useLayoutEffect(() => {
        window.dispatchEvent(new CustomEvent("saveWidgets"));
      }, [sync[1]]);
      return sync;
    });
    act(() =>
      result.current[0]((w) => ({ ...w, storage: { ...w.storage, color: "red" } })),
    );
    expect(mocks.store.mock.calls.at(-1)?.[1].storage.color).toBe("red");
  });
  it("preserves force-save and replacement rather than patch behavior", () => {
    const { result } = renderHook(() => useWidgetSync(props));
    act(() => result.current[0](result.current[1], true));
    expect(mocks.store).toHaveBeenCalledTimes(1);
    const replacement = { id: "replacement", data: {}, storage: {} } as WidgetT;
    act(() => result.current[0](replacement));
    expect(result.current[1]).toBe(replacement);
    expect(result.current[1].name).toBeUndefined();
  });
  it("delivers override callbacks after commit without store persistence", () => {
    const { result, unmount } = renderHook(() =>
      useWidgetSync({
        ...props,
        contextOverride: { widget: mocks.widget, updateWidget: mocks.override },
      }),
    );
    act(() => result.current[0]((w) => ({ ...w, name: "Override" }), true));
    expect(mocks.override).toHaveBeenCalledTimes(1);
    expect(mocks.override.mock.calls[0][0].name).toBe("Override");
    fire("saveWidgets");
    unmount();
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it("uses the shared subscription and commits group and refresh notifications", () => {
    mocks.shared = true;
    const groupEvent = vi.fn();
    const refreshEvent = vi.fn();
    window.addEventListener("updateQueryParams-w", groupEvent);
    window.addEventListener("runParams-w", refreshEvent);
    const { result } = renderHook(() => useWidgetSync(props), { wrapper: strict });
    expect(mocks.sharedSubscribe).toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    act(() =>
      mocks.listener(
        [
          [{ id: "g", type: "endpointParam", groupById: "period", value: "annual" }],
          [],
          null,
        ],
        [[], [], null],
      ),
    );
    expect(result.current[1].storage.params.period).toBe("annual");
    expect(groupEvent).toHaveBeenCalledTimes(1);
    expect(mocks.widget.storage.params).toEqual({});
    fire("refreshQuery");
    expect(result.current[1].refreshQuery).toBeTypeOf("number");
    expect(refreshEvent).toHaveBeenCalledTimes(1);
    window.removeEventListener("updateQueryParams-w", groupEvent);
    window.removeEventListener("runParams-w", refreshEvent);
  });
});
