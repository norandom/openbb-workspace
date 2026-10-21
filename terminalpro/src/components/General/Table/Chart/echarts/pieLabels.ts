import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type { PieLegendRect } from "./pieLegendTypes";
import type { PieGeometry, PieMappingInput, PieRing } from "./pieTypes";

export function surroundingRadius(
  geometry: PieGeometry,
  index: number,
): number | undefined {
  const ordered = geometry.rings
    .map((r, i) => ({ inner: r.inner, index: i }))
    .sort((a, b) => a.inner - b.inner);
  const position = ordered.findIndex((r) => r.index === index);
  return ordered[position + 1]?.inner;
}
export function withinCircle(box: PieLegendRect, radius: number | undefined): boolean {
  return (
    radius === undefined ||
    [box.x, box.x + box.width].every((x) =>
      [box.y, box.y + box.height].every((y) => Math.hypot(x, y) <= radius),
    )
  );
}
function intersects(a: PieLegendRect, b: PieLegendRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
function titleBox(
  input: PieMappingInput,
  ring: PieRing,
  geometry: PieGeometry,
  index: number,
): PieLegendRect | undefined {
  const title = input.style.series.title;
  const radius = geometry.rings[index];
  if (!title.enabled || !ring.title || radius.outer === 0) return;
  const size = measureText(ring.title, title);
  const box = {
    x: -size.width / 2,
    y: -radius.outer - 2 - title.spacing - size.height,
    width: size.width,
    height: size.height,
  };
  return withinCircle(box, surroundingRadius(geometry, index)) ? box : undefined;
}
export function pieTitles(
  input: PieMappingInput,
  rings: readonly PieRing[],
  geometry: PieGeometry,
) {
  return rings.flatMap((ring, index) => {
    const box = titleBox(input, ring, geometry, index);
    if (!box) return [];
    const title = input.style.series.title;
    return [
      {
        id: `${ring.id}:title`,
        type: "text" as const,
        silent: true,
        x: geometry.center[0],
        y: geometry.center[1] + box.y + box.height,
        style: {
          ...fontStyle(title),
          fill: title.color,
          text: ring.title,
          align: "center" as const,
          verticalAlign: "bottom" as const,
        },
      },
    ];
  });
}
export function calloutPositions(
  input: PieMappingInput,
  ring: PieRing,
  geometry: PieGeometry,
  index: number,
) {
  const s = input.style.series;
  const radius = geometry.rings[index];
  const surrounding = surroundingRadius(geometry, index);
  const title = titleBox(input, ring, geometry, index);
  let angle = ((-90 + (s.rotation % 360)) * Math.PI) / 180;
  return ring.data.map((datum) => {
    const span = datum.value * Math.PI * 2;
    const mid = angle + span / 2;
    angle += span;
    const right = Math.cos(mid) >= 0;
    const distance = radius.outer + s.calloutLine.length;
    const x = Math.cos(mid) * distance + (right ? 1 : -1) * s.calloutLabel.offset;
    const y = Math.sin(mid) * distance;
    const size = measureText(datum.calloutText, s.calloutLabel);
    const box = {
      x: right ? x : x - size.width,
      y: y - size.height / 2,
      width: size.width,
      height: size.height,
    };
    const show =
      s.calloutLabel.enabled &&
      radius.drawable &&
      span > 0 &&
      datum.value * 360 >= s.calloutLabel.minAngle &&
      withinCircle(box, surrounding) &&
      (!title || !intersects(box, title));
    return {
      show,
      constrained: surrounding !== undefined,
      x: geometry.center[0] + x,
      y: geometry.center[1] + y,
      align: right ? ("left" as const) : ("right" as const),
      linePoints: [
        [
          geometry.center[0] + Math.cos(mid) * radius.outer,
          geometry.center[1] + Math.sin(mid) * radius.outer,
        ],
        [
          geometry.center[0] + Math.cos(mid) * distance,
          geometry.center[1] + Math.sin(mid) * distance,
        ],
      ],
    };
  });
}
