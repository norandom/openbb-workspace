import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { PerspectiveHost } from "../../src/components/Widgets/perspective/PerspectiveHost";

const data = [
  { symbol: "SYNTH_A", value: 123.45, currency: "USD" },
  { symbol: "SYNTH_B", value: 67.89, currency: "USD" },
];
function Fixture() {
  const [count, setCount] = useState(1);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hidden, setHidden] = useState(false);
  const [width, setWidth] = useState(900);
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Add host</button>
      <button onClick={() => setCount(0)}>Remove hosts</button>
      <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
        Toggle theme
      </button>
      <button onClick={() => setHidden(true)}>Hide hosts</button>
      <button onClick={() => setHidden(false)}>Show hosts</button>
      <button onClick={() => setWidth(width === 900 ? 520 : 900)}>Resize hosts</button>
      <main style={{ display: hidden ? "none" : "block", width }}>
        {Array.from({ length: count }, (_, index) => (
          <section
            key={index}
            data-testid="host"
            style={{ height: 350, width: "100%" }}
          >
            <PerspectiveHost data={data} theme={theme} />
          </section>
        ))}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
