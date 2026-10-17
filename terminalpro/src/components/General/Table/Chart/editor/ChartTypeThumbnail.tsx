import type { ReactNode } from "react";

const colors = ["#5093d8", "#ffa438", "#459b50", "#a979cf", "#e6cb34"];
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
  return <>{axes}{colors.slice(0, 3).map((color, index) => {
    const offset = normalized ? index * 9 : stacked ? index * 7 : index * 4;
    const points = `5,${39 - offset} 18,${22 - offset} 33,${30 - offset} 49,${15 - offset}`;
    const Shape = area ? "polygon" : "polyline";
    return <Shape key={color} points={`${points}${area ? " 49,49 5,49" : ""}`}
      fill={area ? color : "none"} fillOpacity={area ? 0.65 : 1} stroke={color} strokeWidth="2" />;
  })}</>;
}

function Pie({ donut = false, rings = false }) {
  if (!donut && !rings) return <>{[0, 1, 2, 3, 4].map((segment) => <path key={segment}
    d="M27 27V3A24 24 0 0 1 49.83 19.58Z" fill={colors[segment]} transform={`rotate(${segment * 72} 27 27)`} />)}</>;
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
  return <>{axes}{[0, 1, 2, 3, 4, 5, 6].map((n) => <circle key={n} cx={9 + n * 6} cy={40 - ((n * 13) % 32)} r={bubble ? 3 + n % 3 : 2} fill={colors[n % 3]} fillOpacity=".85" />)}</>;
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
