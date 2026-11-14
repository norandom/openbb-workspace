import { z } from "zod";
import { ChartModelSchema, ChartViewOptionsSchema } from "./chart";
import { DataSchema } from "./table";

export const WidgetStateSchema = z
  .looseObject({
    paramOrder: z.array(z.string()).optional(),
    params: z.record(z.string(), z.any()).optional(),
    chartView: ChartViewOptionsSchema.optional(),
    chartModel: ChartModelSchema.optional(),
    columnState: DataSchema,
    filterModel: DataSchema,
    storage: z
      .looseObject({
        text: z.string().optional(),
        html: z.string().optional(),
      })
      .optional(),
  })
  .meta({ id: "WidgetState" });

export const TemplateLayoutItemSchema = z
  .looseObject({
    i: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    minW: z.number().optional(),
    minH: z.number().optional(),
    maxW: z.number().optional(),
    maxH: z.number().optional(),
    moved: z.boolean().optional(),
    static: z.boolean().optional(),
    isDraggable: z.boolean().optional(),
    state: WidgetStateSchema.optional(),
    groups: z.array(z.string()).optional(),
  })
  .meta({ id: "Layout" });

const templateShapeDefinition = {
  templateId: z.string().optional(),
  id: z
    .string()
    .regex(/^custom-.+/)
    .optional(),
  name: z.string(),
  description: z.string().optional(),
  selected_agent: z.string().optional(),
  img: z.string().optional(),
  img_dark: z.string().optional(),
  img_light: z.string().optional(),
  authentication: z.string().optional(),
  tabs: z
    .record(
      z.string(),
      z.object({
        id: z.string(),
        name: z.string(),
        layout: z.array(TemplateLayoutItemSchema),
      }),
    )
    .meta({ id: "Tabs" }),
  groups: z
    .array(
      z
        .object({
          name: z.string(),
          paramName: z.string().optional(),
          type: z.string(),
          widgetIds: z.array(z.string()).optional(),
          defaultValue: z.any().nullish(),
        })
        .meta({ id: "Group" }),
    )
    .default([])
    .optional(),
  prompts: z.array(z.string()).optional(),
  mcpServers: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        url: z.url(),
        authType: z.enum(["oauth", "token"]).optional(),
      }),
    )
    .optional(),
  // Included in the schema so unrecognized-keys detection does not flag it as unknown.
  allowCustomization: z.boolean().optional(),
};

export const backendTemplateSchema = z
  .object(templateShapeDefinition)
  .transform((val) => {
    if (val.groups?.find((g) => g.widgetIds !== undefined)) {
      val.tabs = Object.fromEntries(
        Object.entries(val.tabs).map(([key, tab]) => [
          key,
          {
            ...tab,
            layout: tab.layout.map((layout) => ({
              ...layout,
              groups:
                layout.groups ??
                val.groups
                  .filter((g) => g.widgetIds.includes(layout.i))
                  .map((g) => g.name),
            })),
          },
        ]),
      );
    }
    return val;
  });

export const templateSpecificationSchema = z.array(
  z.object(templateShapeDefinition).meta({ id: "AppsJson" }),
);

// Derived from the Zod schema shape so it stays in sync automatically
export const KNOWN_TEMPLATE_KEYS = new Set(Object.keys(templateShapeDefinition));
