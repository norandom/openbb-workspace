import { type EChartsOption, getInstanceByDom } from "echarts";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import type { ResolvedSnapshotInput } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import type { ResolvedCartesianStyle } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";
import {
  EChartsHost,
  type EChartsHostHandle,
} from "../../../src/components/General/Table/Chart/echarts/EChartsHost";

const input: ResolvedSnapshotInput = {
  stateAddress: "synthetic/cartesian/chart",
  dataRevision: 7,
  originalModel: { chartType: "groupedColumn", synthetic: true },
  sourceMode: "flat",
  selectedColumnIds: ["period", "revenue", "costs"],
  categoryColumnId: "period",
  columns: [
    { id: "period", label: "Period", role: "category" },
    { id: "revenue", label: "Revenue", role: "number", unit: "USD", scale: 1 },
    { id: "costs", label: "Costs", role: "number", unit: "USD", scale: 1 },
  ],
  rows: [
    {
      id: "r1",
      category: "2026-03-31",
      values: { revenue: 123.456789, costs: -40.125 },
    },
    { id: "r2", category: "2026-03-31", values: { revenue: 0, costs: null } },
    { id: "r3", category: "2025-12-31", values: { revenue: -5.25, costs: -12.75 } },
  ],
  selectedRange: { startRow: 0, endRow: 2 },
};
const style: ResolvedCartesianStyle = {
  background: "#ffffff",
  palette: ["#145da0", "#b33b32"],
  textColor: "#202020",
  fontFamily: "sans-serif",
  fontSize: 12,
  title: "Synthetic Revenue/Costs (USD)",
  legend: { visible: true, position: "top" },
  precision: 2,
  series: {
    revenue: { color: "#145da0", lineWidth: 2 },
    costs: { color: "#b33b32", lineWidth: 2 },
  },
};

function resolveOptions(
  source: unknown,
  family: string,
  settings: ResolvedCartesianStyle,
): EChartsOption {
  const validated = validateSnapshot(source);
  if (!validated.valid) throw new Error(JSON.stringify(validated.diagnostics));
  const translated = translateCartesian(validated.snapshot, family, settings);
  if (translated.status !== "supported")
    throw new Error(JSON.stringify(translated.diagnostics));
  // Freeze fixture animation so exported pixels describe the accepted observations.
  return { ...translated.options, animation: false };
}

function Fixture() {
  const [render, setRender] = useState(() => ({
    options: resolveOptions(input, "groupedColumn", style),
    revision: 1,
  }));
  const [family, setFamily] = useState("groupedColumn");
  const [settings, setSettings] = useState(style);
  const [width, setWidth] = useState(720);
  const [diagnostic, setDiagnostic] = useState("");
  const ref = useRef<EChartsHostHandle>(null);
  const chart = () => {
    const element = document.querySelector<HTMLDivElement>(".cartesian-chart");
    if (!element) throw new Error("Missing chart element");
    const instance = getInstanceByDom(element);
    if (!instance) throw new Error("Missing chart instance");
    return instance;
  };
  const submit = (
    nextFamily = family,
    nextSettings = settings,
    source: unknown = input,
  ) => {
    try {
      const options = resolveOptions(source, nextFamily, nextSettings);
      setRender((previous) => ({ options, revision: previous.revision + 1 }));
      setFamily(nextFamily);
      setSettings(nextSettings);
      setDiagnostic("");
    } catch (error) {
      setDiagnostic(String(error));
    }
  };
  Object.assign(window, {
    cartesianFixture: {
      inspect: () => ({
        dataRevision: input.dataRevision,
        renderRevision: render.revision,
        option: chart().getOption(),
      }),
      exportImage: () => ref.current?.exportImage(),
      point: (index: number) =>
        chart().convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [String(index), 0]),
    },
  });
  return (
    <>
      <h1>Synthetic Revenue/Costs (USD)</h1>
      <p>
        Explicit synthetic observations; repeated dates are distinct rows. Costs use
        negative USD values.
      </p>
      <button type="button" onClick={() => submit("groupedColumn")}>
        Grouped
      </button>
      <button type="button" onClick={() => submit("stackedColumn")}>
        Stacked
      </button>
      <button type="button" onClick={() => submit("line")}>
        Line
      </button>
      <button
        type="button"
        onClick={() =>
          submit(family, {
            ...settings,
            precision: 3,
            title: "Settings changed (USD)",
            legend: { visible: true, position: "right" },
          })
        }
      >
        Settings only
      </button>
      <button type="button" onClick={() => setWidth(900)}>
        Resize
      </button>
      <button
        type="button"
        onClick={() =>
          submit(family, settings, { ...input, rows: [input.rows[0], input.rows[0]] })
        }
      >
        Invalid
      </button>
      <button type="button" onClick={() => submit("pie")}>
        Unsupported
      </button>
      <button type="button" onClick={() => submit("groupedColumn")}>
        Recover
      </button>
      <output id="diagnostic">{diagnostic}</output>
      <EChartsHost
        ref={ref}
        className="cartesian-chart"
        style={{ width, height: 440 }}
        options={render.options}
        revision={render.revision}
        onError={(error) => setDiagnostic(String(error))}
      />
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
