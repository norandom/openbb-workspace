/** Unit paths from the owned AG MARKER_SHAPES (community main.cjs.js 22415-22592). */
const paths: Readonly<Record<string, string>> = {
  square: "M0 0L1 0L1 1L0 1Z",
  diamond: "M.5 0L1 .5L.5 1L0 .5Z",
  cross:
    "M.25 0L.5 .25L.75 0L1 .25L.75 .5L1 .75L.75 1L.5 .75L.25 1L0 .75L.25 .5L0 .25Z",
  plus: "M1 0L2 0L2 1L3 1L3 2L2 2L2 3L1 3L1 2L0 2L0 1L1 1Z",
  triangle: "M.5 0L1 .87L0 .87Z",
};
function heartPath(): string {
  const point = (x: number, angle: number) =>
    `${x + Math.cos((angle * Math.PI) / 180) * 0.25},${-0.125 + Math.sin((angle * Math.PI) / 180) * 0.25}`;
  // Preserve the original two 200/190-degree circular arcs and joining segment.
  return `M${point(-0.25, 130)}A.25 .25 0 1 1 ${point(-0.25, 330)}L${point(0.25, 220)}A.25 .25 0 1 1 ${point(0.25, 50)}L0 .375Z`;
}
export function markerSymbol(shape: string): string {
  if (shape === "circle") return "circle";
  return `path://${shape === "heart" ? heartPath() : paths[shape]}`;
}
/** AG triangle occupies 87% of the unit square; keep its nominal-size geometry. */
export function markerDimensions(
  shape: string,
  size: number,
): number | [number, number] {
  if (shape === "triangle") return [size, size * 0.87];
  return shape === "heart" ? [size, size * 0.75] : size;
}
