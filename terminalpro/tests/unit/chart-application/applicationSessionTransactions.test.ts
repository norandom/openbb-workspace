import { describe, expect, it } from "vitest";
import { transitionApplicationAxisStructure } from "../../../src/components/General/Table/Chart/application/axisStructure";
import { validateSynchronousEditorStamp } from "../../../src/components/General/Table/Chart/application/applicationSessionStamp";
import type { ApplicationAxisRuntime } from "../../../src/components/General/Table/Chart/application/axisStructureTypes";
import type { SessionStamp } from "../../../src/components/General/Table/Chart/application/types";
import { applyApplicationEditorTransaction } from "../../../src/components/General/Table/Chart/application/applicationSessionEdit";
import { selectApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionSelection";
import { sessionFixture } from "./applicationSessionFixture";
import type { ApplicationEditorCommand } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";

const stamp: SessionStamp = {
  address: { widgetId: "w", stateKey: "p", stateAddress: '["w","p"]' },
  generation: 1,
  dataRevision: 2,
  renderRevision: 3,
};
const runtime = (): ApplicationAxisRuntime => ({
  categoryAxisType: "category",
  axes: [
    {
      id: "category",
      direction: "x",
      type: "category",
      position: "bottom",
      options: { retained: true, label: { color: "red" } },
    },
    {
      id: "number",
      direction: "y",
      type: "number",
      position: "left",
      options: { untouched: true },
    },
  ],
});
describe("live session transaction contracts", () => {
  it("rehydrates immediate grid edits from latest storage without copying effective defaults", () => {
    const storage = {
      rootUnknown: { retained: true },
      inactive: { chartModel: { chartType: "line" } },
      partition: {
        chartModel: {
          unknown: 7,
          chartOptions: {
            bar: {
              axes: {
                category: {
                  bottom: {
                    gridLine: { style: [{ stroke: "#abcabc", lineDash: [3] }] },
                  },
                },
              },
            },
          },
        },
      },
    };
    const context = sessionFixture(storage);
    const command = (
      intent: ApplicationEditorCommand["intent"],
    ): ApplicationEditorCommand => ({
      stamp: context.local.stamp,
      family: "groupedColumn",
      intent,
    });
    const color = applyApplicationEditorTransaction(
      storage,
      context,
      command({
        panel: "grid",
        axis: "category",
        edit: { field: "color", value: "#123123" },
      }),
    );
    if (color.status !== "ready") throw new Error(JSON.stringify(color));
    const current = {
      ...context,
      local: {
        ...color.value.local,
        stamp: { ...context.local.stamp, renderRevision: 1 },
      },
    };
    const dashCommand = command({
      panel: "grid",
      axis: "category",
      edit: { field: "lineDash", value: 8 },
    });
    const dash = applyApplicationEditorTransaction(
      color.value.storage,
      current,
      dashCommand,
    );
    expect(dash.status).toBe("ready");
    if (dash.status !== "ready") return;
    const saved = dash.value.storage as any;
    expect(
      saved.partition.chartModel.chartOptions.bar.axes.category.bottom.gridLine.style,
    ).toEqual([{ stroke: "#123123", lineDash: [8] }]);
    expect(saved.partition.chartModel.unknown).toBe(7);
    expect(saved.rootUnknown).toEqual(storage.rootUnknown);
    expect(saved.inactive).toEqual(storage.inactive);
    expect(saved.partition.chartModel.chartOptions.bar.title).toBeUndefined();
    expect(
      applyApplicationEditorTransaction(color.value.storage, current, dashCommand),
    ).toEqual(dash);
  });
  it("keeps structural position and current auto rotation local, preserving the original reopen limitation", () => {
    const storage = {
      partition: {
        chartModel: {
          chartOptions: {
            bar: { axes: { category: { bottom: { label: { rotation: 35 } } } } },
          },
        },
      },
    };
    const context = sessionFixture(storage);
    const apply = (
      intent: ApplicationEditorCommand["intent"],
      source = storage,
      ctx = context,
    ) =>
      applyApplicationEditorTransaction(source, ctx, {
        stamp: context.local.stamp,
        family: "groupedColumn",
        intent,
      });
    const auto = apply({
      panel: "axisLabels",
      axis: "category",
      edit: { field: "autoRotate", value: true },
    });
    if (auto.status !== "ready") throw new Error(JSON.stringify(auto));
    const live = { ...context, local: auto.value.local };
    expect(
      selectApplicationSession(auto.value.storage, live).style.application.axes.category
        .labels.rotation,
    ).toBeUndefined();
    expect(
      (auto.value.storage as any).partition.chartModel.chartOptions.bar.axes.category
        .bottom.label.rotation,
    ).toBe(35);
    expect(
      selectApplicationSession(auto.value.storage, sessionFixture(auto.value.storage))
        .style.application.axes.category.labels.rotation,
    ).toBe(35);
    const position = applyApplicationEditorTransaction(auto.value.storage, live, {
      stamp: context.local.stamp,
      family: "groupedColumn",
      intent: {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "position", value: "top" },
      },
    });
    if (position.status !== "ready") throw new Error(JSON.stringify(position));
    expect(position.value.local.axes.axes[0].position).toBe("top");
    expect((position.value.storage as any).partition.chartModel.axes).toBeUndefined();
    expect(
      selectApplicationSession(
        position.value.storage,
        sessionFixture(position.value.storage),
      ).style.application.axes.category.fields.position,
    ).toBe("bottom");
  });
  it("admits another immediate edit but rejects obsolete identity and malformed revisions", () => {
    expect(
      validateSynchronousEditorStamp(stamp, { ...stamp, renderRevision: 9 }),
    ).toMatchObject({ status: "ready", stamp: { renderRevision: 9 } });
    for (const current of [
      { ...stamp, dataRevision: 3 },
      { ...stamp, generation: 2 },
    ])
      expect(validateSynchronousEditorStamp(stamp, current).status).toBe("stale");
    expect(
      validateSynchronousEditorStamp({ ...stamp, renderRevision: Number.NaN }, stamp).status,
    ).toBe("invalid");
  });
  it("changes concrete position without adding a persisted axis field", () => {
    const axes = runtime();
    const result = transitionApplicationAxisStructure({
      family: "line",
      runtime: axes,
      savedOptions: {},
      event: {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "position", value: "top" },
      },
    });
    expect(result).toMatchObject({
      valid: true,
      value: {
        eventOptions: {},
        runtime: {
          axes: [
            { position: "top", options: { retained: true } },
            { options: { untouched: true } },
          ],
        },
      },
    });
    expect(axes.axes[0].position).toBe("bottom");
  });
  it("moves the first defined override and original crosshair expressions to the new type", () => {
    const savedOptions = {
      bar: {
        axes: {
          category: {
            crosshair: { enabled: true, top: { strokeWidth: 3 } },
            bottom: {
              label: { color: "#123456" },
              crosshair: { enabled: true, top: { strokeWidth: 3 } },
            },
            top: { label: { color: "#abcdef" } },
          },
        },
      },
    };
    const result = transitionApplicationAxisStructure({
      family: "groupedColumn",
      runtime: runtime(),
      savedOptions,
      event: {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "time" },
      },
    });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.runtime.axes[0]).toMatchObject({
      type: "time",
      options: { retained: true, label: { color: "red", format: "%d %B %Y" } },
    });
    expect(result.value.eventOptions).toMatchObject({
      bar: {
        axes: {
          time: {
            bottom: { label: { color: "#123456" } },
            top: { label: { color: "#123456" } },
          },
          number: { crosshair: { enabled: true, top: { strokeWidth: 3 } } },
        },
      },
    });
    const leave = transitionApplicationAxisStructure({
      family: "line",
      runtime: result.value.runtime,
      savedOptions: {},
      event: {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "category" },
      },
    });
    expect(leave.valid && leave.value.runtime.axes[0].options.label).toEqual({
      color: "red",
      format: undefined,
    });
    expect(savedOptions.bar.axes.category.top.label.color).toBe("#abcdef");
  });
  it("rejects invalid identities, cross-direction positions and a displaced category axis", () => {
    const input = {
      family: "line" as const,
      runtime: runtime(),
      savedOptions: {},
      event: {
        panel: "axisStructure" as const,
        axis: "category" as const,
        edit: { field: "position" as const, value: "left" },
      },
    };
    expect(transitionApplicationAxisStructure(input).valid).toBe(false);
    expect(
      transitionApplicationAxisStructure({
        ...input,
        runtime: { ...runtime(), axes: [...runtime().axes].reverse() },
        event: { ...input.event, edit: { field: "type", value: "time" } },
      }).valid,
    ).toBe(false);
  });
});
