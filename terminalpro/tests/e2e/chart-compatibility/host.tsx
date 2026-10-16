import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getInstanceByDom, type EChartsOption } from "echarts";
import { EChartsHost, type EChartsHostHandle } from "../../../src/components/General/Table/Chart/echarts/EChartsHost";

function Fixture() {
  const [revision, setRevision] = useState(1);
  const [width, setWidth] = useState(640);
  const [mounted, setMounted] = useState(true);
  const [bad, setBad] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<EChartsHostHandle>(null);
  const options: EChartsOption = {
    animation: false, backgroundColor: "#ffffff",
    xAxis: { type: "category", data: ["SYNTH_A", "SYNTH_B"] },
    yAxis: { type: "value", name: "USD", max: 200 },
    series: [{ type: "bar", data: revision === 1 ? [123.45, 67.89] : [180, 40],
      itemStyle: { color: "#ff0000" }, label: { show: true },
      ...(bad ? { label: { show: true, formatter: () => { throw new Error("synthetic formatter failure"); } } } : {}),
    }],
  };
  Object.assign(window, { hostFixture: {
    exportImage: () => ref.current?.exportImage(),
    values: () => {
      const element = document.querySelector<HTMLDivElement>(".owned-chart");
      return element ? getInstanceByDom(element)?.getOption().series : undefined;
    },
  } });
  return <>
    <h1>Synthetic revenue (USD)</h1>
    <button type="button" onClick={() => setRevision((value) => value + 1)}>Update values</button>
    <button type="button" onClick={() => setWidth(800)}>Resize</button>
    <button type="button" onClick={() => setWidth(0)}>Hide</button>
    <button type="button" onClick={() => setWidth(640)}>Restore</button>
    <button type="button" onClick={() => setMounted((value) => !value)}>Toggle mount</button>
    <button type="button" onClick={() => { setBad(true); setRevision((value) => value + 1); }}>Fail update</button>
    <button type="button" onClick={() => { setBad(false); setRevision((value) => value + 1); }}>Recover</button>
    <output id="error">{error}</output>
    {mounted && <EChartsHost ref={ref} className="owned-chart" style={{ width, height: 400 }}
      options={options} revision={revision} onError={(failure) => setError(String(failure))} />}
  </>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
