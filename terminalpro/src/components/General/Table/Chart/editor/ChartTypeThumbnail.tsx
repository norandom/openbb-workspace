import type { ReactNode } from "react";

const colors = ["#5090dc", "#ffa03a", "#459d55", "#b485db", "#e1cc00", "#40b5c4"];
const axes = <path d="M4 3V50H51" fill="none" stroke="#888" strokeWidth="1" />;

function Columns({ stacked = false, normalized = false, horizontal = false }) {
  return <g>
    {axes}
    {[0, 1, 2].map((column) => (stacked ? [0, 1, 2] : [column]).map((series) => {
      const height = normalized ? 15 : stacked ? 5 + column * 2 + series * 2 : 7 + column * 4 + series * 3;
      const previous = normalized ? series * 15 : series * (5 + column * 2) + series * (series - 1);
      const start = stacked ? previous : 0;
      const length = stacked ? height : height * 2;
      return <rect key={`${column}-${series}`} x={horizontal ? 5 + start : 8 + column * 15}
        y={horizontal ? 8 + column * 15 : 49 - start - length}
        width={horizontal ? length : 11} height={horizontal ? 11 : length} fill={colors[series]} />;
    }))}
  </g>;
}

function Lines({ area = false, stacked = false, normalized = false }) {
  const paths = normalized
    ? ["M4 47L27 41 51 29", "M4 35L27 17 51 9", "M4 5H51"]
    : stacked
      ? ["M4 46L27 39 51 31", "M4 39L27 17H51", "M4 21L27 6 51 14"]
      : ["M4 42L51 15", "M4 35L27 8 51 22", "M4 15L51 43"];
  if (!area) return <>{axes}{paths.map((path, index) =>
    <path key={path} d={path} fill="none" stroke={colors[index]} strokeWidth="3" />)}</>;
  const areas = stacked || normalized
    ? [paths[0] + "V50H4Z", paths[1] + "L51 29 27 41 4 47Z", paths[2] + "L51 9 27 17 4 35Z"]
    : paths.map((path) => path + "V50H4Z");
  if (stacked && !normalized) areas.splice(1, 2,
    "M4 39L27 17H51V31L27 39 4 46Z", "M4 21L27 6 51 14V17H27L4 39Z");
  return <>{areas.map((path, index) => <path key={path} d={path} fill={colors[index]}
    fillOpacity={stacked || normalized ? 1 : 0.7} stroke={colors[index]}
    strokeOpacity={stacked || normalized ? 1 : 0.75} strokeWidth="1" />)}{axes}</>;
}

function Pie({ donut = false, rings = false }) {
  if (!rings) {
    const angles = [0, 120, 210, 270, 300, 330, 360];
    return <>{angles.slice(0, -1).map((angle, segment) => {
      const point = (degrees: number, radius: number) => {
        const radians = (degrees - 90) * Math.PI / 180;
        return `${27 + radius * Math.cos(radians)} ${27 + radius * Math.sin(radians)}`;
      };
      const end = angles[segment + 1];
      const inner = donut ? `L${point(end, 15)}A15 15 0 0 0 ${point(angle, 15)}Z` : "L27 27Z";
      return <path key={angle} d={`M${point(angle, 24)}A24 24 0 0 1 ${point(end, 24)}${inner}`}
        fill={colors[segment]} stroke="var(--chart-gallery-background, var(--surface-card))" strokeWidth="1" />;
    })}</>;
  }
  return <>{[0, 1, 2, 3, 4].map((segment) => <circle key={segment} cx="27" cy="27" r={rings ? 10 + segment * 3 : 19}
    fill="none" stroke={colors[segment]} strokeWidth={rings ? 4 : 8}
    strokeDasharray={`${segment === 0 ? 35 : 20} 114`} transform={`rotate(${segment * 72 - 90} 27 27)`} />)}</>;
}

function Radar({ filled = false }) {
  return <><path d="M27 3L50 20 41 48H13L4 20Z M27 3V48 M4 20L41 48 M50 20L13 48" fill="none" stroke="#888" />
    <path d="M27 8L43 22 35 40 16 43 11 22Z" fill={filled ? colors[0] : "none"} fillOpacity=".55" stroke={colors[0]} strokeWidth="2" />
    <path d="M27 17L45 20 32 36 20 37 7 20Z" fill={filled ? colors[1] : "none"} fillOpacity=".4" stroke={colors[1]} strokeWidth="2" /></>;
}

function RadialColumns({ nightingale = false }) {
  return <>{[0, 1, 2, 3, 4, 5].map((n) => <path key={n}
    d="M27 27V4A23 23 0 0 1 46.92 15.5Z" fill={colors[n % colors.length]}
    transform={`translate(27 27) scale(${nightingale ? 0.55 + n * 0.08 : 0.65 + (n % 3) * 0.15}) translate(-27 -27) rotate(${n * 60} 27 27)`} />)}</>;
}

function Scatter({ bubble = false }) {
  const points = bubble
    ? [[13, 14, 7, 2], [38, 18, 6, 5], [24, 35, 7, 1], [32, 38, 9, 4], [9, 38, 5, 0]]
    : [[13, 10, 2.5, 0], [20, 22, 2.5, 3], [43, 17, 2.5, 5], [40, 30, 2.5, 0],
      [21, 35, 2.5, 1], [10, 43, 2.5, 4], [29, 43, 2.5, 3], [37, 46, 2.5, 2], [32, 32, 2.5, 2]];
  return <>{axes}{points.map(([x, y, radius, color], index) => <circle key={index}
    cx={x} cy={y} r={radius} fill={colors[color]} fillOpacity={bubble ? 0.7 : 1} />)}</>;
}

function Tiles({ heatmap = false }) {
  return <>{[0, 1, 2].map((row) => [0, 1, 2].map((column) => <rect key={`${row}-${column}`} x={3 + column * 16} y={4 + row * 16}
    width="15" height="15" fill={colors[heatmap ? 0 : (row + column) % 3]} opacity={heatmap ? 0.25 + (row + column) * 0.18 : 1} />))}</>;
}

function Funnel({ pyramid = false, cone = false }) {
  return <g transform={pyramid ? "translate(54 54) rotate(180)" : undefined}>
    {[0, 1, 2, 3].map((n) => <path key={n} d={`M${3 + n * 5} ${5 + n * 11}H${51 - n * 5}L${cone ? 46 - n * 5 : 48 - n * 5} ${15 + n * 11}H${cone ? 8 + n * 5 : 6 + n * 5}Z`} fill={colors[n]} />)}
  </g>;
}

function Ranges({ box = false, area = false }) {
  if (area) return <>{axes}<path d="M5 18L20 9 35 19 49 6V30L35 40 20 29 5 44Z" fill={colors[0]} fillOpacity=".6" /></>;
  return <>{axes}{[0, 1, 2].map((n) => <g key={n} stroke={colors[n]} fill={colors[n]}>
    <path d={`M${12 + n * 15} 7V44m-5-37h10m-10 37h10`} />
    <rect x={8 + n * 15} y={15 + n * 4} width="8" height={box ? 17 : 25 - n * 3} />
    {box && <path d={`M${8 + n * 15} ${23 + n * 4}h8`} stroke="white" />}
  </g>)}</>;
}

const thumbnails: Record<string, ReactNode> = {
  groupedColumn: <Columns />, stackedColumn: <Columns stacked />, normalizedColumn: <Columns stacked normalized />,
  groupedBar: <Columns horizontal />, stackedBar: <Columns horizontal stacked />, normalizedBar: <Columns horizontal stacked normalized />,
  pie: <Pie />, donut: <Pie donut />, doughnut: <Pie donut />,
  line: <Lines />, stackedLine: <Lines stacked />, normalizedLine: <Lines stacked normalized />,
  area: <Lines area />, stackedArea: <Lines area stacked />, normalizedArea: <Lines area stacked normalized />,
  scatter: <Scatter />, bubble: <Scatter bubble />,
  radarLine: <Radar />, radarArea: <Radar filled />, nightingale: <RadialColumns nightingale />, radialColumn: <RadialColumns />, radialBar: <Pie rings donut />,
  boxPlot: <Ranges box />, histogram: <Columns stacked />, rangeBar: <Ranges />, rangeArea: <Ranges area />,
  treemap: <Tiles />, sunburst: <Pie rings />, heatmap: <Tiles heatmap />,
  sankey: <><path d="M8 14C27 14 27 8 46 8M8 26C27 26 27 41 46 41" fill="none" stroke={colors[0]} strokeWidth="10" opacity=".5" /><path d="M8 7V33M46 1V15M46 34V48" stroke={colors[1]} strokeWidth="6" /></>,
  waterfall: <>{axes}<path d="M6 49V35H16V25H27V14H38V6H48V49" fill="none" stroke={colors[2]} strokeWidth="7" /></>,
  funnel: <Funnel />, coneFunnel: <Funnel cone />, pyramid: <Funnel pyramid />,
  columnLineCombo: <><Columns /><Lines /></>, areaColumnCombo: <><Lines area /><Columns /></>,
  customCombo: <><Columns /><Lines /><Scatter /></>,
};

export function ChartTypeThumbnail({ modelType }: { modelType: string }) {
  return <svg viewBox="0 0 54 54" aria-hidden="true" focusable="false">
    {thumbnails[modelType] ?? <><rect x="8" y="8" width="38" height="38" fill="none" stroke="currentColor" /><path d="M15 36L25 20 32 29 40 15" fill="none" stroke="currentColor" /></>}
  </svg>;
}
