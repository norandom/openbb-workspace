import { describe, expect, it } from "vitest";
import {
  advanceSessionStamp,
  applyColumnEdit,
  applyRangeTransition,
  selectSessionBaseline,
  validateSessionStamp,
} from "../../../src/components/General/Table/Chart/application/sessionState";
import type {
  ColumnEditInput,
  SessionStamp,
} from "../../../src/components/General/Table/Chart/application/types";
import { selectOptionBaseline } from "../../../src/components/General/Table/Chart/compatibility/optionState";

const stamp = (widgetId = "widget", stateKey = "partition"): SessionStamp => ({
  address: { widgetId, stateKey, stateAddress: JSON.stringify([widgetId, stateKey]) },
  generation: 1,
  dataRevision: 0,
  renderRevision: 0,
});
describe("addressed chart session", () => {
  const tooltipInput = (event: unknown, chartType = "groupedColumn"): ColumnEditInput =>
    ({
      command: { stamp: stamp(), chartType, event },
      currentStamp: stamp(),
      storage: {},
      resolvedOptions: {},
      totalSeries: 2,
      isPivotMode: false,
    }) as ColumnEditInput;
  it.each([
    "single",
    "shared",
    "compact",
  ] as const)("applies tooltip %s through the real reducer using latest storage and saved baseline", (value) => {
    const storage = {
      rootUnknown: { retained: true },
      other: { chartModel: { chartType: "line" } },
      partition: {
        latest: true,
        line: { cellRange: { columns: ["period", "profit"] } },
        chartModel: { previousModelField: true },
      },
    };
    const baseline = selectOptionBaseline({
      kind: "initialize",
      stateAddress: stamp().address.stateAddress,
      initialChartType: "groupedColumn",
      partitionModel: {
        savedModel: true,
        chartOptions: {
          theme: "stock",
          common: { padding: { top: 9 } },
          unknownOption: { retained: true },
          line: { series: { strokeWidth: 7 } },
          bar: {
            title: { text: "Earlier edit", enabled: false },
            legend: { position: "right" },
            tooltip: { mode: "single", unknown: true },
          },
        },
      },
    });
    if (!baseline.valid) throw new Error(baseline.error);
    const renderedOptions = {
      bar: { title: { text: "Rendered only" }, fill: "#abcdef" },
    };
    const input = {
      ...tooltipInput({ kind: "tooltip-mode", value }),
      storage,
      currentModel: {
        ...baseline.value.model,
        chartOptions: renderedOptions,
        destination: true,
      },
      resolvedOptions: baseline.value.options,
    };
    const before = JSON.stringify({ input, baseline, renderedOptions });
    const result = applyColumnEdit(input);
    expect(result).toEqual({
      status: "ready",
      stamp: stamp(),
      value: {
        ...storage,
        chartType: "groupedColumn",
        totalSeries: 2,
        isPivotMode: false,
        partition: {
          ...storage.partition,
          chartModel: {
            previousModelField: true,
            savedModel: true,
            destination: true,
            chartType: "groupedColumn",
            chartOptions: {
              common: { padding: { top: 9 } },
              unknownOption: { retained: true },
              line: { series: { strokeWidth: 7 } },
              bar: {
                title: { text: "Earlier edit", enabled: false },
                legend: { position: "right" },
                tooltip: { mode: value, unknown: true },
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("Rendered only");
    expect(JSON.stringify({ input, baseline, renderedOptions })).toBe(before);
  });
  it.each([
    "single",
    "shared",
    "compact",
  ])("reports valid stacked tooltip %s as unresolved before touching storage", (value) => {
    const input = {
      ...tooltipInput({ kind: "tooltip-mode", value }, "stackedColumn"),
      storage: new Proxy(
        {},
        {
          get() {
            throw new Error("unexpected storage read");
          },
          ownKeys() {
            throw new Error("unexpected storage enumeration");
          },
        },
      ),
    };
    expect(applyColumnEdit(input)).toMatchObject({
      status: "unresolved",
      diagnostics: [
        {
          path: ["command", "chartType"],
          message: expect.stringContaining("stackedColumn"),
        },
      ],
    });
  });
  it("rejects malformed tooltip events and hostile descriptors without writes or getters", () => {
    let reads = 0;
    const eventGetter = {
      kind: "tooltip-mode",
      get value() {
        reads += 1;
        return "shared";
      },
    };
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("event own keys");
        },
      },
    );
    const descriptorTrap = new Proxy(
      { kind: "tooltip-mode", value: "shared" },
      {
        getOwnPropertyDescriptor() {
          throw new Error("event descriptor");
        },
      },
    );
    for (const event of [
      eventGetter,
      hostile,
      descriptorTrap,
      revoked.proxy,
      null,
      [],
      { kind: "tooltip-mode", value: "Multiple" },
      { kind: "tooltip-mode", value: "shared", extra: true },
      { kind: "tooltip-mode", value: "shared", [Symbol("extra")]: true },
      Object.create({ kind: "tooltip-mode", value: "shared" }),
      Object.defineProperty({ kind: "tooltip-mode" }, "value", { value: "shared" }),
    ]) {
      for (const family of ["groupedColumn", "stackedColumn"]) {
        const input = tooltipInput(event, family);
        const storage = { partition: { retained: true } };
        expect(applyColumnEdit({ ...input, storage }).status).toBe("invalid");
        expect(storage).toEqual({ partition: { retained: true } });
      }
    }
    expect(reads).toBe(0);
  });
  it("validates every stale stamp dimension before inspecting a tooltip event", () => {
    const event = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("stale event inspection");
        },
      },
    );
    for (const currentStamp of [
      stamp("other"),
      stamp("widget", "other"),
      { ...stamp(), generation: 2 },
      { ...stamp(), dataRevision: 1 },
      { ...stamp(), renderRevision: 1 },
    ]) {
      for (const family of ["groupedColumn", "stackedColumn"]) {
        expect(
          applyColumnEdit({ ...tooltipInput(event, family), currentStamp }),
        ).toEqual({ status: "stale" });
      }
    }
  });
  it("never inspects storage for delayed edits or range events from an obsolete session", () => {
    const original = stamp();
    const storage = new Proxy(
      {},
      {
        get() {
          throw new Error("stale storage read");
        },
        ownKeys() {
          throw new Error("stale storage enumeration");
        },
      },
    );
    for (const current of [
      stamp("other"),
      stamp("widget", "new-partition"),
      { ...original, generation: 2 },
      { ...original, renderRevision: 1 },
    ]) {
      expect(
        applyColumnEdit({
          command: {
            stamp: original,
            chartType: "groupedColumn",
            event: { kind: "title-enabled", value: true },
          },
          currentStamp: current,
          storage,
          resolvedOptions: {},
          totalSeries: 1,
          isPivotMode: false,
        }),
      ).toEqual({ status: "stale" });
      expect(
        applyRangeTransition({
          stamp: original,
          currentStamp: current,
          storage,
          chartType: "line",
          range: { columnIds: ["date", "profit"], originalRange: {} },
        }),
      ).toEqual({ status: "stale" });
    }
  });
  it("rejects accessors without invoking them and generation zero", () => {
    let reads = 0;
    const hostile = {
      ...stamp(),
      get generation() {
        reads += 1;
        return 1;
      },
    };
    expect(validateSessionStamp(hostile, stamp()).status).toBe("invalid");
    expect(reads).toBe(0);
    expect(validateSessionStamp({ ...stamp(), generation: 0 }, stamp()).status).toBe(
      "invalid",
    );
  });
  it.each([
    [{ kind: "title-enabled", value: false }, { title: { enabled: false } }],
    [{ kind: "legend-position", value: "left" }, { legend: { position: "left" } }],
    [{ kind: "stroke-width", value: 0 }, { series: { strokeWidth: 0 } }],
  ] as const)("maps accepted editor event %j", (event, bar) => {
    const current = stamp();
    expect(
      applyColumnEdit({
        command: { stamp: current, chartType: "groupedColumn", event },
        currentStamp: current,
        storage: {},
        resolvedOptions: {},
        totalSeries: 0,
        isPivotMode: false,
      }),
    ).toEqual({
      status: "ready",
      stamp: current,
      value: {
        chartType: "groupedColumn",
        totalSeries: 0,
        isPivotMode: false,
        partition: {
          chartModel: { chartType: "groupedColumn", chartOptions: { bar } },
        },
      },
    });
  });
  it("advances independent revisions without reusing tokens", () => {
    const original = stamp();
    expect(advanceSessionStamp(original, "data")).toEqual({
      status: "ready",
      stamp: { ...original, dataRevision: 1, renderRevision: 1 },
      value: { ...original, dataRevision: 1, renderRevision: 1 },
    });
    expect(advanceSessionStamp(original, "render")).toMatchObject({
      value: { dataRevision: 0, renderRevision: 1 },
    });
    expect(
      advanceSessionStamp(
        { ...original, dataRevision: 7, renderRevision: 9 },
        "generation",
      ),
    ).toMatchObject({ value: { generation: 2, dataRevision: 0, renderRevision: 0 } });
    expect(original).toEqual(stamp());
  });
  it.each([
    "generation",
    "dataRevision",
    "renderRevision",
  ] as const)("rejects malformed/overflowing %s", (field) => {
    expect(validateSessionStamp({ ...stamp(), [field]: -1 }, stamp()).status).toBe(
      "invalid",
    );
    expect(
      advanceSessionStamp(
        { ...stamp(), [field]: Number.MAX_SAFE_INTEGER },
        field === "generation" ? "generation" : "data",
      ).status,
    ).toBe("invalid");
  });
  it("validates address encoding and stale identity/revisions", () => {
    expect(
      validateSessionStamp(
        { ...stamp(), address: { ...stamp().address, stateAddress: "wrong" } },
        stamp(),
      ).status,
    ).toBe("invalid");
    for (const current of [
      stamp("other"),
      stamp("widget", "other"),
      { ...stamp(), generation: 2 },
      { ...stamp(), renderRevision: 1 },
      { ...stamp(), dataRevision: 1 },
    ]) {
      expect(validateSessionStamp(stamp(), current)).toEqual({ status: "stale" });
    }
  });
  it("delegates initialized and populated-to-empty baselines with address checks", () => {
    const current = stamp();
    const first = selectSessionBaseline({
      stamp: current,
      currentStamp: current,
      baseline: {
        kind: "initialize",
        stateAddress: current.address.stateAddress,
        initialChartType: "groupedColumn",
        partitionModel: { chartOptions: { bar: { title: { text: "kept" } } } },
      },
    });
    expect(first.status).toBe("ready");
    if (first.status !== "ready") throw new Error("baseline missing");
    expect(
      selectSessionBaseline({
        stamp: current,
        currentStamp: current,
        baseline: {
          kind: "synchronize",
          stateAddress: current.address.stateAddress,
          previous: first.value,
          partitionModel: {},
        },
      }),
    ).toEqual(first);
    expect(
      selectSessionBaseline({
        stamp: current,
        currentStamp: current,
        baseline: {
          kind: "initialize",
          stateAddress: "wrong",
          initialChartType: "line",
        },
      }).status,
    ).toBe("invalid");
  });
  it("reduces against latest storage and destination model, retaining inactive/unknown state and removing root theme", () => {
    const current = stamp();
    const storage = {
      unknown: "root",
      partition: {
        unknown: "latest",
        line: { cellRange: { columns: ["date", "profit"] } },
        chartModel: { old: true, chartOptions: { ignored: true } },
      },
    };
    const input = {
      command: {
        stamp: current,
        chartType: "stackedColumn" as const,
        event: { kind: "title-text" as const, value: "New" },
      },
      currentStamp: current,
      storage,
      currentModel: { destination: true, cellRange: { columns: ["date", "revenue"] } },
      resolvedOptions: {
        theme: "stock",
        line: { series: { strokeWidth: 3 } },
        bar: { title: { enabled: false, text: "Old" }, theme: "nested" },
      },
      totalSeries: 2,
      isPivotMode: false,
    };
    const before = JSON.stringify(input);
    expect(applyColumnEdit(input)).toEqual({
      status: "ready",
      stamp: current,
      value: {
        unknown: "root",
        totalSeries: 2,
        chartType: "stackedColumn",
        isPivotMode: false,
        partition: {
          unknown: "latest",
          line: { cellRange: { columns: ["date", "profit"] } },
          chartModel: {
            old: true,
            destination: true,
            cellRange: { columns: ["date", "revenue"] },
            chartType: "stackedColumn",
            chartOptions: {
              line: { series: { strokeWidth: 3 } },
              bar: { title: { enabled: false, text: "New" }, theme: "nested" },
            },
          },
        },
      },
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(applyColumnEdit({ ...input, currentStamp: stamp("other") })).toEqual({
      status: "stale",
    });
    expect(JSON.stringify(input)).toBe(before);
  });
  it("writes only the destination family range independently from option reduction", () => {
    const current = stamp();
    const storage = {
      partition: {
        chartModel: { chartOptions: { theme: "retained" } },
        line: { unknown: 3, cellRange: { old: true } },
        groupedColumn: { saved: true },
      },
      unrelated: true,
    };
    const range = {
      columnIds: ["profit", "date"],
      rowStartIndex: 2,
      rowEndIndex: 4,
      originalRange: {
        columns: ["profit", "removed", "date"],
        rowStartIndex: 2,
        rowEndIndex: 4,
        custom: true,
      },
    };
    const input = {
      stamp: current,
      currentStamp: current,
      storage,
      chartType: "line",
      range,
    };
    const before = JSON.stringify(input);
    expect(applyRangeTransition(input)).toEqual({
      status: "ready",
      stamp: current,
      value: {
        ...storage,
        partition: {
          ...storage.partition,
          line: {
            unknown: 3,
            cellRange: {
              columns: ["profit", "date"],
              rowStartIndex: 2,
              rowEndIndex: 4,
              custom: true,
            },
          },
        },
      },
    });
    expect(
      applyRangeTransition({ ...input, currentStamp: { ...current, generation: 2 } }),
    ).toEqual({ status: "stale" });
    expect(JSON.stringify(input)).toBe(before);
  });
});
