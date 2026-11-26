import { z } from "zod";

export const RESEARCH_STORY_ID = "research_story";
export const RESEARCH_STORY_NAME = "Commodities versus Technology";

export function isResearchStoryWidget(widget: { widgetId?: unknown; type?: unknown }) {
  return widget.widgetId === RESEARCH_STORY_ID || widget.type === RESEARCH_STORY_ID;
}

const gridItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional().catch(undefined),
  minH: z.number().optional().catch(undefined),
  maxW: z.number().optional().catch(undefined),
  maxH: z.number().optional().catch(undefined),
  originalMinH: z.number().optional().catch(undefined),
  mobileH: z.number().optional().catch(undefined),
  moved: z.boolean().optional().catch(undefined),
  static: z.boolean().optional().catch(undefined),
  isDraggable: z.boolean().optional().catch(undefined),
  isResizable: z.boolean().optional().catch(undefined),
  isBounded: z.boolean().optional().catch(undefined),
  minimized: z.boolean().optional().catch(undefined),
});

export function encodeStoryGridItem(value: unknown) {
  return gridItemSchema.parse(value);
}

export const COMMODITY_SYMBOLS = ["DBC", "GLD"] as const;
export const TECHNOLOGY_SYMBOLS = ["XLK", "VGT"] as const;

const date = z.iso.date();
const utcTimestamp = z.iso
  .datetime()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u);

const selectionSchema = z.object({
  commodity_symbol: z.enum(COMMODITY_SYMBOLS),
  technology_symbol: z.enum(TECHNOLOGY_SYMBOLS),
  observation_date: date,
});
const scheduleSchema = z.object({
  calendar_id: z.literal("NYSE_ARCA"),
  schedule_revision: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u),
});
const cutoffSchema = z.object({
  observation_date: date,
  decision_at: utcTimestamp,
  evaluated_at: utcTimestamp,
  session_timezone: z.literal("America/New_York"),
});

const runId = z.string().regex(/^[0-9a-f]{32}$/u);
const runRefsSchema = z.object({
  comparison: runId.nullable(),
  regime: runId.nullable(),
});

function chartSchema<
  const Series extends readonly [string, ...string[]],
  const X extends string,
  const Y extends string,
>(series: Series, xAxis: X, yAxis: Y) {
  return z.object({
    chart_type: z.enum(["line", "bar"]),
    series: z
      .array(z.enum(series))
      .min(1)
      .refine((selected) => {
        return new Set(selected).size === selected.length;
      }),
    x_axis: z.literal(xAxis),
    y_axis: z.literal(yAxis),
  });
}

const presets = {
  returns: {
    input: [["left_close", "right_close"], "date", "price_usd"],
    result: [["left_momentum", "right_momentum"], "proxy", "percent"],
  },
  risk: {
    input: [["left_daily_return", "right_daily_return"], "date", "percent"],
    result: [["left_volatility", "right_volatility"], "proxy", "percent"],
  },
  real_yields: {
    input: [["dfii10"], "date", "percent"],
    result: [["change"], "window", "percentage_points"],
  },
} as const;

const chartsSchema = z.object({
  returns: z.object({
    input: chartSchema(...presets.returns.input),
    result: chartSchema(...presets.returns.result),
  }),
  risk: z.object({
    input: chartSchema(...presets.risk.input),
    result: chartSchema(...presets.risk.result),
  }),
  real_yields: z.object({
    input: chartSchema(...presets.real_yields.input),
    result: chartSchema(...presets.real_yields.result),
  }),
});

const stateSchema = z
  .object({
    version: z.literal(1),
    selection: selectionSchema,
    schedule: scheduleSchema.nullable(),
    cutoff: cutoffSchema.nullable(),
    run_refs: runRefsSchema,
    charts: chartsSchema,
  })
  .refine(({ selection, schedule, cutoff, run_refs }) => {
    if (!schedule && !cutoff)
      return run_refs.comparison === null && run_refs.regime === null;
    return (
      schedule !== null &&
      cutoff?.observation_date === selection.observation_date
    );
  });

export type StoryState = z.infer<typeof stateSchema>;
export type StorySelection = StoryState["selection"];
export type StorySchedule = NonNullable<StoryState["schedule"]>;
export type StoryCutoff = NonNullable<StoryState["cutoff"]>;
export type StoryRole = keyof StoryState["run_refs"];
export type StoryCharts = StoryState["charts"];
export type StoryChartView = keyof StoryCharts;
export type StoryChartLane = keyof StoryCharts[StoryChartView];

function defaultChart<
  const Series extends readonly string[],
  const X extends string,
  const Y extends string,
>(
  chart_type: "line" | "bar",
  [series, x_axis, y_axis]: readonly [Series, X, Y],
) {
  return { chart_type, series: [...series], x_axis, y_axis };
}

export function createStoryState(): StoryState {
  return {
    version: 1,
    selection: {
      commodity_symbol: "DBC",
      technology_symbol: "XLK",
      observation_date: "2026-11-13",
    },
    schedule: null,
    cutoff: null,
    run_refs: { comparison: null, regime: null },
    charts: {
      returns: {
        input: defaultChart("line", presets.returns.input),
        result: defaultChart("bar", presets.returns.result),
      },
      risk: {
        input: defaultChart("line", presets.risk.input),
        result: defaultChart("bar", presets.risk.result),
      },
      real_yields: {
        input: defaultChart("line", presets.real_yields.input),
        result: defaultChart("bar", presets.real_yields.result),
      },
    },
  };
}

export function decodeStoryState(value: unknown): StoryState | null {
  return stateSchema.safeParse(value).data ?? null;
}

export function encodeStoryState(value: unknown): StoryState {
  const state = decodeStoryState(value);
  if (!state) throw new Error("Invalid research story configuration.");
  return state;
}

// Zod object schemas project each nesting level before the configuration reaches storage.
export function encodeStoryStorage(value: unknown) {
  return {
    researchStory:
      value === undefined ? createStoryState() : encodeStoryState(value),
  };
}
