/** Grid wrappers follow the original extraction order before polar engine validation. */
export function normalizeRadarObservation(raw: unknown): number | null {
  let value = raw;
  if (value !== null && typeof value === "object") {
    const wrapper = value as Record<string, unknown>;
    if (typeof wrapper.value === "number") value = wrapper.value;
    else if (
      Object.hasOwn(wrapper, "toString") &&
      typeof wrapper.toString === "function"
    )
      value = Number.parseFloat(wrapper.toString());
    else if (typeof wrapper.toNumber === "function") value = wrapper.toNumber();
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || typeof value !== "object") return null;
  try {
    const timestamp = Date.prototype.getTime.call(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    try {
      const number = Number.prototype.valueOf.call(value);
      return Number.isFinite(number) ? number : null;
    } catch {
      const wrapper = value as Record<string, unknown>;
      if (!Object.hasOwn(wrapper, "valueOf") || typeof wrapper.valueOf !== "function")
        return null;
      const number = wrapper.valueOf();
      return typeof number === "number" && Number.isFinite(number) ? number : null;
    }
  }
}
