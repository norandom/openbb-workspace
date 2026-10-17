import { getInstanceByDom } from "echarts";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import type {
  CartesianFamily,
  ResolvedCartesianStyle,
} from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";
import {
  EChartsHost,
  type EChartsHostHandle,
} from "../../../src/components/General/Table/Chart/echarts/EChartsHost";
import {
  appearanceProvenance,
  appearanceSnapshot,
  appearanceStyle,
} from "../../unit/chart-compatibility/appearance.fixtures";

const validated = validateSnapshot(appearanceSnapshot);
if (!validated.valid) throw new Error(JSON.stringify(validated.diagnostics));
const snapshot = validated.snapshot;

function resolveOptions(family: CartesianFamily, style: unknown) {
  const result = translateCartesian(snapshot, family, style);
  if (result.status !== "supported") return result;
  // Disable animation so later pixel evidence describes the accepted observations.
  return { ...result, options: { ...result.options, animation: false } };
}

function initialRender() {
  const result = resolveOptions("line", appearanceStyle);
  if (result.status !== "supported")
    throw new Error(JSON.stringify(result.diagnostics));
  return { options: result.options, revision: 1 };
}

function Fixture() {
  const [render, setRender] = useState(initialRender);
  const [settings, setSettings] = useState(appearanceStyle);
  const [family, setFamily] = useState<CartesianFamily>("line");
  const [diagnostic, setDiagnostic] = useState("");
  const [width, setWidth] = useState(760);
  const [exportedImage, setExportedImage] = useState("");
  const ref = useRef<EChartsHostHandle>(null);

  const chart = () => {
    const element = document.querySelector<HTMLDivElement>(".appearance-chart");
    if (!element) throw new Error("Missing appearance chart element");
    const instance = getInstanceByDom(element);
    if (!instance) throw new Error("Missing appearance chart instance");
    return instance;
  };
  const submit = (nextStyle: unknown, nextFamily = family) => {
    const result = resolveOptions(nextFamily, nextStyle);
    if (result.status !== "supported") {
      setDiagnostic(JSON.stringify(result));
      return;
    }
    setRender((previous) => ({
      options: result.options,
      revision: previous.revision + 1,
    }));
    setSettings(nextStyle as ResolvedCartesianStyle);
    setFamily(nextFamily);
    setDiagnostic("");
  };
  const changeLine = (connectMissingData: boolean, enabled: boolean) =>
    submit({
      ...settings,
      line: {
        connectMissingData,
        markers: enabled
          ? { enabled: true, shape: "circle", size: 7 }
          : { enabled: false },
      },
    });
  const exportImage = () => {
    if (!ref.current) throw new Error("Missing appearance host");
    const image = ref.current.exportImage();
    setExportedImage(image);
    return image;
  };
  Object.assign(window, {
    appearanceFixture: {
      inspect: () => ({
        dataRevision: appearanceSnapshot.dataRevision,
        renderRevision: render.revision,
        family,
        settings,
        diagnostic,
        option: chart().getOption(),
        width: chart().getWidth(),
        height: chart().getHeight(),
        exportedImage,
      }),
      exportImage,
      point: (index: number, value: number) =>
        chart().convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
          String(index),
          value,
        ]),
    },
  });
  return (
    <>
      <h1>Synthetic appearance journey</h1>
      <p>Homogeneous USD millions, scale 1000000; Q2 is missing for both series.</p>
      <p>{appearanceProvenance.syntheticRules}</p>
      <button
        type="button"
        onClick={() => changeLine(false, settings.line?.markers.enabled ?? false)}
      >
        Disconnect missing
      </button>
      <button
        type="button"
        onClick={() => changeLine(true, settings.line?.markers.enabled ?? false)}
      >
        Connect missing
      </button>
      <button
        type="button"
        onClick={() => changeLine(settings.line?.connectMissingData ?? true, true)}
      >
        Markers on
      </button>
      <button
        type="button"
        onClick={() => changeLine(settings.line?.connectMissingData ?? true, false)}
      >
        Markers off
      </button>
      <button
        type="button"
        onClick={() => submit({ ...settings, titleEnabled: false })}
      >
        Hide title
      </button>
      <button type="button" onClick={() => submit({ ...settings, titleEnabled: true })}>
        Show title
      </button>
      <button
        type="button"
        onClick={() =>
          submit({
            ...settings,
            typography: {
              title: { color: "#751515", fontFamily: "monospace", fontSize: 22 },
              legend: { color: "#156015", fontFamily: "serif", fontSize: 14 },
              axis: { color: "#151575", fontFamily: "monospace", fontSize: 13 },
            },
          })
        }
      >
        Typography
      </button>
      <button
        type="button"
        onClick={() =>
          submit({
            ...settings,
            series: {
              revenue: {
                fill: "#f2b134",
                stroke: "#145da0",
                strokeWidth: 3,
                markerFill: "#d62f86",
                markerStroke: "#191919",
                markerStrokeWidth: 2,
              },
              costs: {
                fill: "#90be6d",
                stroke: "#b33b32",
                strokeWidth: 2,
                markerFill: "#32b6c8",
                markerStroke: "#5a245a",
                markerStrokeWidth: 1,
              },
            },
          })
        }
      >
        Distinct colors
      </button>
      <button type="button" onClick={() => submit(settings, "groupedColumn")}>
        Grouped
      </button>
      <button type="button" onClick={() => submit(settings, "stackedColumn")}>
        Stacked
      </button>
      <button type="button" onClick={() => submit(settings, "line")}>
        Line
      </button>
      <button
        type="button"
        onClick={() => setWidth((previous) => (previous === 760 ? 940 : 760))}
      >
        Resize
      </button>
      <button type="button" onClick={exportImage}>
        Export
      </button>
      <button
        type="button"
        onClick={() =>
          submit({
            ...settings,
            line: {
              connectMissingData: true,
              markers: { enabled: true, shape: "circle", size: -1 },
            },
          })
        }
      >
        Invalid
      </button>
      <button
        type="button"
        onClick={() =>
          submit(
            {
              ...settings,
              line: {
                connectMissingData: true,
                markers: { enabled: true, shape: "triangle", size: 7 },
              },
            },
            "line",
          )
        }
      >
        Unsupported
      </button>
      <button type="button" onClick={() => submit(appearanceStyle, "line")}>
        Recover
      </button>
      <output id="diagnostic">{diagnostic}</output>
      <output id="render-revision">{render.revision}</output>
      <output id="data-revision">{appearanceSnapshot.dataRevision}</output>
      <EChartsHost
        ref={ref}
        className="appearance-chart"
        style={{ width, height: 480 }}
        options={render.options}
        revision={render.revision}
        onError={(error) => setDiagnostic(String(error))}
      />
      {exportedImage && (
        <img
          id="exported-image"
          alt="Exported synthetic appearance chart"
          src={exportedImage}
        />
      )}
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
