/** Match ordinary Grid numeric wrappers while leaving strings and dates missing. */
export function normalizePieObservation(input: unknown): number | null {
  try {
    let value = input;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (!value || typeof value !== "object" || value instanceof Date) return null;
    const wrapper = value as { value?: unknown; toString?: () => string; toNumber?: () => unknown };
    if (typeof wrapper.value === "number") value = wrapper.value;
    if (value && Object.hasOwn(value, "toString"))
      value = Number.parseFloat((value as { toString: () => string }).toString());
    if (value != null && typeof (value as typeof wrapper).toNumber === "function")
      value = (value as Required<typeof wrapper>).toNumber();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
