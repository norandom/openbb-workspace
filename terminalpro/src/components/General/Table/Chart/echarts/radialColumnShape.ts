/** Local upward-facing geometry in plot pixels; every numeric input is bounded to +/-1,000,000. */
export interface RadialColumnPathInput {
  startRadius: number;
  endRadius: number;
  holeRadius: number;
  outerRadius: number;
  width: number;
  /** Caller-selected connection to the hole; requires startRadius === holeRadius and width / 2 < holeRadius. */
  connectBaseline: boolean;
}

export interface RadialColumnPathResult {
  pathData: string;
  /** Zero paths remain open. Callers must disable fill and retain the intended stroke. */
  zero: boolean;
}
// The path is the boundary of a constant-width strip intersected with the plot disk.
function validate(input: RadialColumnPathInput): void {
  const {
    startRadius,
    endRadius,
    holeRadius,
    outerRadius,
    width,
    connectBaseline,
  } = input;
  // Pixel geometry is bounded so squared circle intersections cannot overflow.
  if (
    ![startRadius, endRadius, holeRadius, outerRadius, width].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 1e6,
    ) ||
    holeRadius < 0 ||
    outerRadius < holeRadius ||
    width <= 0 ||
    startRadius < holeRadius ||
    endRadius < holeRadius ||
    startRadius > outerRadius ||
    endRadius > outerRadius ||
    typeof connectBaseline !== "boolean" ||
    (connectBaseline && (startRadius !== holeRadius || width / 2 >= holeRadius))
  ) {
    throw new RangeError("Invalid finite column geometry");
  }
}

/** Rejects unsupported programmer geometry with RangeError; inputs are never silently clamped. */
export function buildRadialColumnPath(
  input: RadialColumnPathInput,
): RadialColumnPathResult {
  validate(input);
  const {
    startRadius,
    endRadius,
    outerRadius,
    width,
    connectBaseline: connect,
  } = input;
  const half = width / 2;
  const low = Math.min(startRadius, endRadius);
  const high = Math.min(outerRadius, Math.max(startRadius, endRadius));
  const curved = connect && startRadius <= endRadius;
  const extent = curved
    ? half
    : Math.min(half, Math.sqrt(Math.max(0, outerRadius ** 2 - low ** 2)));
  const bottom = curved ? Math.sqrt(Math.max(0, low ** 2 - extent ** 2)) : low;
  const top = Math.min(
    high,
    Math.sqrt(Math.max(0, outerRadius ** 2 - extent ** 2)),
  );
  const commands: string[] = [];
  const point = (x: number, y: number) => `${x} ${y}`;
  const move = (x: number, y: number) => commands.push(`M ${point(x, y)}`);
  const line = (x: number, y: number) => commands.push(`L ${point(x, y)}`);
  const arc = (radius: number, sweep: number, x: number, y: number) =>
    commands.push(`A ${radius} ${radius} 0 0 ${sweep} ${point(x, y)}`);
  move(-extent, -bottom);
  if (startRadius === endRadius) {
    if (curved) {
      arc(startRadius, 1, 0, -startRadius);
      arc(startRadius, 1, extent, -bottom);
    } else line(extent, -bottom);
    return { pathData: commands.join(" "), zero: true };
  }
  line(-extent, -top);
  const shoulder = Math.sqrt(Math.max(0, outerRadius ** 2 - high ** 2));
  if (extent > shoulder) {
    arc(outerRadius, 1, -shoulder, -high);
    if (shoulder > 0) line(shoulder, -high);
    arc(outerRadius, 1, extent, -top);
  } else line(extent, -top);
  line(extent, -bottom);
  if (curved) {
    // Split at the vertical extremum to preserve ECharts path containment.
    arc(low, 0, 0, -low);
    arc(low, 0, -extent, -bottom);
  } else line(-extent, -bottom);
  commands.push("Z");
  return { pathData: commands.join(" "), zero: false };
}
