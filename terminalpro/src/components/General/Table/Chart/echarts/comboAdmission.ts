import {
  contextDiagnostics,
  mappingIssue,
  sourceDiagnostics,
  unitDiagnostics,
} from "./cartesianAdmission";
import { categoryCoordinate, continuousCategory } from "./cartesianAxes";
import { validateCartesianStyle } from "./cartesianStyle";
import type {
  ComboAdmissionResult,
  ComboAxisGroup,
  ComboGeometry,
  ComboMappingInput,
  ComboPlan,
  ComboSelectedSeries,
} from "./comboTypes";
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const types = ["line", "area", "stackedArea", "groupedColumn", "stackedColumn"];
function fail(
  path: (string | number)[],
  message: string,
): ComboAdmissionResult {
  return {
    status: "invalid",
    diagnostics: [mappingIssue("invalid-combo", path, message)],
  };
}
function selections(
  input: ComboMappingInput,
): ComboSelectedSeries[] | ComboAdmissionResult {
  const { snapshot, assignments } = input;
  if (!Array.isArray(assignments))
    return fail(["assignments"], "Resolved assignments are required.");
  const seen = new Set<string>();
  for (const [i, a] of assignments.entries()) {
    if (
      !record(a) ||
      typeof a.colId !== "string" ||
      !a.colId ||
      seen.has(a.colId) ||
      typeof a.chartType !== "string" ||
      !types.includes(a.chartType) ||
      (a.secondaryAxis !== undefined && typeof a.secondaryAxis !== "boolean") ||
      (a.secondaryAxis && !["line", "area"].includes(a.chartType))
    )
      return fail(
        ["assignments", i],
        "Assignments require unique IDs, supported types and eligible axes.",
      );
    seen.add(a.colId);
  }
  if (
    new Set(snapshot.selectedColumnIds).size !==
    snapshot.selectedColumnIds.length
  )
    return fail(
      ["snapshot", "selectedColumnIds"],
      "Selected IDs must be unique.",
    );
  const selected: ComboSelectedSeries[] = [];
  for (const id of snapshot.selectedColumnIds) {
    const matches = snapshot.columns.filter((c) => c.id === id);
    if (typeof id !== "string" || !id || matches.length !== 1)
      return fail(
        ["snapshot", "selectedColumnIds"],
        "Selected descriptors must be unique and present.",
      );
    const column = matches[0];
    if (column.role !== "number") continue;
    const assignment = assignments.find((a) => a.colId === id);
    if (!assignment)
      return fail(["assignments"], `Missing assignment for ${id}.`);
    const geometry: ComboGeometry = assignment.chartType.includes("Column")
      ? "bar"
      : assignment.chartType.includes("Area") || assignment.chartType === "area"
        ? "area"
        : "line";
    selected.push({
      column,
      assignment,
      geometry,
      paletteIndex: selected.length,
      yAxisIndex: 0,
    });
  }
  if (!selected.length)
    return {
      status: "unsupported",
      diagnostics: [
        mappingIssue(
          "empty-combo",
          ["snapshot", "selectedColumnIds"],
          "No numeric series selected.",
        ),
      ],
    };
  const primary = selected.some((s) => !s.assignment.secondaryAxis);
  let secondary = primary ? 1 : 0;
  return selected.map((s) => ({
    ...s,
    yAxisIndex: s.assignment.secondaryAxis ? secondary++ : 0,
  }));
}
function groups(
  input: ComboMappingInput,
  selected: readonly ComboSelectedSeries[],
): ComboAxisGroup[] {
  const indexes = [...new Set(selected.map((s) => s.yAxisIndex))].sort(
    (a, b) => a - b,
  );
  return indexes.map((index) => {
    const members = selected.filter((s) => s.yAxisIndex === index);
    const first = members[0];
    const axis = first.assignment.secondaryAxis
      ? input.style.axes.secondary[first.column.id]
      : input.style.axes.primary;
    if (
      !axis ||
      axis.fields.type !== "number" ||
      !["left", "right"].includes(axis.fields.position)
    )
      throw new Error(
        "Numeric axes need their resolved number type and left/right position.",
      );
    return { index, axis, selected: members };
  });
}
function styleViews(
  input: ComboMappingInput,
  selected: readonly ComboSelectedSeries[],
  axisGroups: readonly ComboAxisGroup[],
): ComboPlan["views"] | ComboAdmissionResult {
  const views: Partial<
    Record<ComboGeometry, import("./cartesianTypes").ResolvedCartesianStyle>
  > = {};
  for (const geometry of new Set(selected.map((s) => s.geometry))) {
    const effective = input.style.geometry[geometry];
    if (!effective)
      return fail(
        ["style", "geometry", geometry],
        "Active geometry styling is required.",
      );
    for (const group of axisGroups) {
      const view = {
        ...input.style.common,
        series: effective.overrides,
        application: {
          ...input.style.application,
          series: effective.series,
          axes: { category: input.style.axes.category, number: group.axis },
        },
      };
      const validated = validateCartesianStyle(
        view,
        geometry === "bar" ? "groupedColumn" : geometry,
      );
      if (validated.status !== "valid")
        return {
          ...validated,
          diagnostics: validated.diagnostics.map((d) => ({
            ...d,
            path: ["style", "geometry", geometry, ...d.path.slice(1)],
          })),
        };
      views[geometry] ??= validated.style;
    }
  }
  return views;
}
function rowDiagnostics(
  input: ComboMappingInput,
): ComboAdmissionResult | undefined {
  const ids = new Set<string>();
  for (const [i, row] of input.snapshot.rows.entries()) {
    const path = ["snapshot", "rows", i];
    if (!record(row))
      return fail(path, "Each observation row must be a record.");
    if (typeof row.id !== "string" || !row.id || ids.has(row.id))
      return fail(
        [...path, "id"],
        "Observation row IDs must be unique nonempty strings.",
      );
    ids.add(row.id);
    if (
      typeof row.category !== "string" &&
      !(typeof row.category === "number" && Number.isFinite(row.category))
    )
      return fail(
        [...path, "category"],
        "Categories must retain their string or finite numerical observation.",
      );
    if (!record(row.values))
      return fail([...path, "values"], "Observation values must be a record.");
    for (const [id, value] of Object.entries(row.values)) {
      if (
        value !== null &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        return fail(
          [...path, "values", id],
          "Present observations must be finite numbers or null.",
        );
    }
  }
}
function inspect(input: ComboMappingInput): ComboAdmissionResult {
  const diagnostics = contextDiagnostics(input.context);
  if (!input.context?.viewport)
    diagnostics.push(
      mappingIssue(
        "missing-viewport",
        ["context", "viewport"],
        "Positive viewport dimensions are required.",
      ),
    );
  if (diagnostics.length) return { status: "invalid", diagnostics };
  if (
    !record(input.snapshot) ||
    !Array.isArray(input.snapshot.rows) ||
    !Array.isArray(input.snapshot.columns) ||
    !Array.isArray(input.snapshot.selectedColumnIds)
  )
    return fail(
      ["snapshot"],
      "Snapshot rows, columns and selections are required.",
    );
  const legend = input.context.legendSelection;
  if (
    legend !== undefined &&
    (!record(legend) ||
      Object.values(legend).some((v) => typeof v !== "boolean"))
  )
    return fail(
      ["context", "legendSelection"],
      "Legend selection values must be booleans.",
    );
  const source = sourceDiagnostics(input.snapshot, input.context);
  if (source.length)
    return {
      status: "unsupported",
      diagnostics: source.map((d) => ({ ...d, path: ["snapshot", ...d.path] })),
    };
  const selected = selections(input);
  if (!Array.isArray(selected)) return selected;
  const axisGroups = groups(input, selected);
  const units = axisGroups.flatMap((g) =>
    unitDiagnostics(
      g.selected.map((s) => s.column),
      input.snapshot.columns,
      input.context.observations.kind === "raw-observations",
    ),
  );
  if (units.length)
    return {
      status: units.some((d) => d.code === "invalid-unit")
        ? "invalid"
        : "unsupported",
      diagnostics: units.map((d) => ({ ...d, path: ["snapshot", ...d.path] })),
    };
  const malformedRows = rowDiagnostics(input);
  if (malformedRows) return malformedRows;
  const category = input.style.axes.category;
  if (
    !["top", "bottom"].includes(category.fields.position) ||
    !["category", "number", "time"].includes(category.fields.type)
  )
    return fail(
      ["style", "axes", "category"],
      "A horizontal category, number or time axis is required.",
    );
  const coordinates = input.snapshot.rows.map((row, i) =>
    continuousCategory(category)
      ? categoryCoordinate(row.category, category)
      : String(i),
  );
  if (
    coordinates.some(
      (c) =>
        continuousCategory(category) &&
        (typeof c !== "number" || !Number.isFinite(c)),
    )
  )
    return fail(
      ["snapshot", "rows"],
      "Continuous categories require finite original coordinates.",
    );
  const views = styleViews(input, selected, axisGroups);
  if ("status" in views) return views;
  return {
    status: "admitted",
    plan: { ...input, selected, axisGroups, views, coordinates },
  };
}
/** Guard the untrusted public boundary, including accessors that throw. */
export function admitCombo(input: ComboMappingInput): ComboAdmissionResult {
  try {
    return inspect(input);
  } catch {
    return fail(["style", "axes"], "Combo input cannot be safely inspected.");
  }
}
