import { describe, expect, it } from "vitest";
import { validateDetachedInput, validateIntegratedInput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";

import { integratedFixture, detachedFixture } from "./contracts.fixtures";

describe("source-derived chart contracts", () => {
  it("retains resolved options, original JSON and runtime undefined without normalization", () => {
    const result = validateIntegratedInput(integratedFixture);
    expect(result).toEqual({ valid: true, value: integratedFixture });
    if (result.valid) expect(result.value).toBe(integratedFixture);
    expect(validateDetachedInput(detachedFixture)).toEqual({ valid: true, value: detachedFixture });
  });
  it("permits absent current models/options and metadata-colliding resolved addresses", () => {
    expect(validateIntegratedInput({ ...integratedFixture, currentModel: undefined, eventOptions: undefined, stateKey: "chartType" }).valid).toBe(true);
  });
  it("accepts repeated source-shaped runtime edits only at known option slots", () => {
    const storage = {
      unknown: { retained: [null, "USD"] }, chartOptions: undefined,
      chartModel: { extra: true, chartOptions: { nested: undefined } },
      range: { unknown: 3, chartModel: { chartOptions: { series: [undefined] } } },
    };
    const first = validateDetachedInput({ ...detachedFixture, storage });
    expect(first.valid).toBe(true);
    if (!first.valid) throw new Error(first.error);
    expect(validateDetachedInput(first.value)).toEqual(first);
    const integrated = validateIntegratedInput({ ...integratedFixture, storage: first.value.storage,
      currentModel: { chartOptions: undefined, cellRange: { columns: ["value"] } } });
    expect(integrated.valid).toBe(true);
    expect(validateIntegratedInput({ ...integratedFixture, stateKey: "chartModel", storage: { chartModel: storage.range } }).valid).toBe(true);
    expect(validateDetachedInput({ ...detachedFixture, storage: { ...storage, unknown: undefined } }).valid).toBe(false);
    expect(validateIntegratedInput({ ...integratedFixture, currentModel: { unknown: undefined } }).valid).toBe(false);
    expect(Object.hasOwn(storage, "chartOptions")).toBe(true);
    expect(storage.chartOptions).toBeUndefined();
  });  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, () => 1, new Date(), { bad: undefined }])("rejects non-JSON stored values: %s", (bad) => {
    expect(validateDetachedInput({ ...detachedFixture, storage: { bad } }).valid).toBe(false);
  });
  it("rejects cycles, invalid metadata and invalid runtime option objects without changing inputs", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(validateDetachedInput({ ...detachedFixture, storage: cyclic }).valid).toBe(false);
    for (const patch of [{ totalSeries: Number.NaN }, { totalSeries: -1 }, { chartType: 2 }, { eventOptions: null }]) {
      expect(validateDetachedInput({ ...detachedFixture, ...patch }).valid).toBe(false);
    }
    expect(validateIntegratedInput({ ...integratedFixture, isPivotMode: "true" }).valid).toBe(false);
    expect(integratedFixture.storage.range.chartModel.chartOptions).toEqual({ persisted: true });
  });
});
