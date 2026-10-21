import { expect, it } from "vitest";
import { boxTickDensity } from "../../../src/components/General/Table/Chart/echarts/boxPlotTicks";
import { planBoxValueAxis } from "../../../src/components/General/Table/Chart/echarts/boxPlotValueAxis";

// Retained community12.1.1 oracle, SHA256 237912c75d2c7e8219fced7bb79e5ed8fca0f620d6f4d259cdfa58748445fcd1.
const cases = [
  {
    pixels: 0,
    semantic: [5.5, 5.5],
    minTickCount: 0,
    maxTickCount: 0,
    tickCount: 0,
    display: [5.5, 5.5],
    ticks: [],
  },
  {
    pixels: 0,
    semantic: [5, 5],
    minTickCount: 0,
    maxTickCount: 0,
    tickCount: 0,
    display: [5, 5],
    ticks: [],
  },
  {
    pixels: 0,
    semantic: [-3.2, 8.7],
    minTickCount: 0,
    maxTickCount: 0,
    tickCount: 0,
    display: [-3.2, 8.7],
    ticks: [],
  },
  {
    pixels: 0,
    semantic: [4.53, 6.47],
    minTickCount: 0,
    maxTickCount: 0,
    tickCount: 0,
    display: [4.53, 6.47],
    ticks: [],
  },
  {
    pixels: 49,
    semantic: [5.5, 5.5],
    minTickCount: 1,
    maxTickCount: 1,
    tickCount: 1,
    display: [5.5, 5.5],
    ticks: [5.5],
  },
  {
    pixels: 49,
    semantic: [5, 5],
    minTickCount: 1,
    maxTickCount: 1,
    tickCount: 1,
    display: [5, 5],
    ticks: [5],
  },
  {
    pixels: 49,
    semantic: [-3.2, 8.7],
    minTickCount: 1,
    maxTickCount: 1,
    tickCount: 1,
    display: [-10, 10],
    ticks: [-10, 10],
  },
  {
    pixels: 49,
    semantic: [4.53, 6.47],
    minTickCount: 1,
    maxTickCount: 1,
    tickCount: 1,
    display: [4, 7],
    ticks: [4, 7],
  },
  {
    pixels: 100,
    semantic: [5.5, 5.5],
    minTickCount: 1,
    maxTickCount: 2,
    tickCount: 2,
    display: [5.5, 5.5],
    ticks: [5.5],
  },
  {
    pixels: 100,
    semantic: [5, 5],
    minTickCount: 1,
    maxTickCount: 2,
    tickCount: 2,
    display: [5, 5],
    ticks: [5],
  },
  {
    pixels: 100,
    semantic: [-3.2, 8.7],
    minTickCount: 1,
    maxTickCount: 2,
    tickCount: 2,
    display: [-10, 10],
    ticks: [-10, 0, 10],
  },
  {
    pixels: 100,
    semantic: [4.53, 6.47],
    minTickCount: 1,
    maxTickCount: 2,
    tickCount: 2,
    display: [4, 8],
    ticks: [4, 6, 8],
  },
  {
    pixels: 150,
    semantic: [5.5, 5.5],
    minTickCount: 1,
    maxTickCount: 3,
    tickCount: 3,
    display: [5.5, 5.5],
    ticks: [5.5],
  },
  {
    pixels: 150,
    semantic: [5, 5],
    minTickCount: 1,
    maxTickCount: 3,
    tickCount: 3,
    display: [5, 5],
    ticks: [5],
  },
  {
    pixels: 150,
    semantic: [-3.2, 8.7],
    minTickCount: 1,
    maxTickCount: 3,
    tickCount: 3,
    display: [-5, 10],
    ticks: [-5, 0, 5, 10],
  },
  {
    pixels: 150,
    semantic: [4.53, 6.47],
    minTickCount: 1,
    maxTickCount: 3,
    tickCount: 3,
    display: [4, 7],
    ticks: [4, 5, 6, 7],
  },
  {
    pixels: 300,
    semantic: [5.5, 5.5],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [5, 6],
    ticks: [5, 5.2, 5.4, 5.6, 5.8, 6],
  },
  {
    pixels: 300,
    semantic: [5, 5],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [5, 5],
    ticks: [5],
  },
  {
    pixels: 300,
    semantic: [-3.2, 8.7],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [-5, 10],
    ticks: [-5, 0, 5, 10],
  },
  {
    pixels: 300,
    semantic: [4.53, 6.47],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [4.5, 6.5],
    ticks: [4.5, 5, 5.5, 6, 6.5],
  },
  {
    pixels: 600,
    semantic: [5.5, 5.5],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [5, 6],
    ticks: [5, 5.2, 5.4, 5.6, 5.8, 6],
  },
  {
    pixels: 600,
    semantic: [5, 5],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [5, 5],
    ticks: [5],
  },
  {
    pixels: 600,
    semantic: [-3.2, 8.7],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [-5, 10],
    ticks: [-5, 0, 5, 10],
  },
  {
    pixels: 600,
    semantic: [4.53, 6.47],
    minTickCount: 1,
    maxTickCount: 6,
    tickCount: 5,
    display: [4.5, 6.5],
    ticks: [4.5, 5, 5.5, 6, 6.5],
  },
];
it.each(cases)("original scale $pixels $semantic", (c) => {
  const density = boxTickDensity(c.pixels);
  expect(density).toEqual({
    tickCount: c.tickCount,
    minTickCount: c.minTickCount,
    maxTickCount: c.maxTickCount,
  });
  const plan = planBoxValueAxis(
    { value: c.semantic as [number, number], empty: false },
    c.pixels,
    density,
  );
  expect(plan.fullExtent).toEqual(c.display);
  expect(plan.rawTicks).toEqual(c.ticks);
});

it("clips only ticks against an unchanged nice domain and keeps constant/empty transport finite", () => {
  const domain = { value: [-3.2, 8.7] as const, empty: false };
  const density = boxTickDensity(300);
  const full = planBoxValueAxis(domain, 300, density);
  const crop = planBoxValueAxis(domain, 300, density, [0.25, 0.75]);
  expect(crop.fullExtent).toEqual(full.fullExtent);
  expect(crop.visibleExtent).toEqual([-1.25, 6.25]);
  expect(crop.fullTransport.min).toBe(-5);
  expect(crop.transport.min).toBe(-1.25);
  expect(crop.rawTicks).toEqual([-2, 0, 2, 4, 6]);
  expect(planBoxValueAxis({ value: [], empty: true }, 300, density).transport).toEqual({
    min: 0,
    max: 1,
    ticks: [],
  });
  expect(
    planBoxValueAxis({ value: [5, 5], empty: false }, 100, boxTickDensity(100))
      .transport,
  ).toEqual({ min: 0, max: 1, constant: 5, ticks: [0.5] });
  expect(() => planBoxValueAxis(domain, Number.NaN, density)).toThrow();
});

it("estimates zoom density from the original pixel spacing before count rounding", () => {
  const plan = planBoxValueAxis(
    { value: [-3.2, 8.7], empty: false },
    149,
    boxTickDensity(149),
    [0.45, 0.55],
  );
  expect(plan.fullExtent).toEqual([-10, 10]);
  expect(boxTickDensity(149, 0.55 - 0.45)).toEqual({
    minTickCount: 10,
    maxTickCount: 29,
    tickCount: 29,
  });
  expect(plan.rawTicks).toEqual([-1, 0, 1]);
});
