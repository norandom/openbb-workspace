import { Fragment } from "react";
import { FontFamilyInput } from "~/components/ds/atoms/FontFamilyInput";
import { Input } from "~/components/ds/atoms/Input";
import { Label } from "~/components/ds/atoms/Label";
import { Select } from "~/components/ds/atoms/Select";
import { ColorPicker } from "~/components/ds/molecules/ColorPicker";
import Tooltip from "~/components/Tooltip";
import SettingsMenu from "../ds/molecules/SettingsMenu";
import type { ChartThemeState } from "./chartThemeState";
import type { useChartSettings } from "./useChartSettings";

type Props = Pick<
  ReturnType<typeof useChartSettings>,
  "state" | "themeMode" | "handleInputChange"
>;
type Parameter = {
  key: keyof ChartThemeState;
  label: string;
  tooltip: string;
  kind?: "family" | "number" | "weight";
  dark?: string;
  light?: string;
  placeholder?: string;
};
type Section = { title: string; tooltip: string; fields: Parameter[] };
const sections: Section[] = [
  {
    title: "Core Settings",
    tooltip: "Style chart data, background, and main text.",
    fields: [
      {
        key: "fontFamily",
        label: "Font Family",
        tooltip: "Font family used for all text in the chart",
        kind: "family",
        placeholder: "Select font family...",
      },
      {
        key: "fontSize",
        label: "Font Size",
        tooltip: "Default font size used for all text",
        kind: "number",
      },
      {
        key: "fontWeight",
        label: "Font Weight",
        tooltip: "Default font weight used for all text",
        kind: "weight",
      },
      {
        key: "backgroundColor",
        label: "Background Color",
        tooltip: "Background colour of the chart",
        dark: "#1a1a1f",
        light: "#ffffff",
      },
      {
        key: "foregroundColor",
        label: "Foreground Color",
        tooltip: "Default colour for neutral UI elements",
        dark: "#ffffff",
        light: "#000000",
      },
      {
        key: "accentColor",
        label: "Accent Color",
        tooltip: "Brand colour for selections, focus outlines and checkboxes",
        dark: "#337dba",
        light: "#337dba",
      },
      {
        key: "borderColor",
        label: "Border Color",
        tooltip: "Default colour for borders",
        dark: "#444444",
        light: "#dddddd",
      },
      {
        key: "textColor",
        label: "Text Color",
        tooltip: "Default colour for text in the chart",
        dark: "#ffffff",
        light: "#000000",
      },
      {
        key: "subtleTextColor",
        label: "Subtle Text Color",
        tooltip: "Colour of text that should stand out less",
        dark: "#888888",
        light: "#666666",
      },
      {
        key: "padding",
        label: "Padding",
        tooltip: "Outer chart padding in pixels",
        kind: "number",
        placeholder: "Default padding",
      },
    ],
  },
  {
    title: "Chrome Settings",
    tooltip: "Style tooltips, menus, dialogs and other chart controls.",
    fields: [
      {
        key: "chromeBackgroundColor",
        label: "Chrome Background",
        tooltip: "Background colour of tooltips, menus, dialogs, toolbars and buttons",
        dark: "#2a2a31",
        light: "#f6f6f6",
      },
      {
        key: "chromeTextColor",
        label: "Chrome Text Color",
        tooltip: "Text colour of chart controls",
        dark: "#ffffff",
        light: "#000000",
      },
      {
        key: "chromeFontFamily",
        label: "Chrome Font Family",
        tooltip: "Font family for chart controls",
        kind: "family",
        placeholder: "Defaults to font family...",
      },
      {
        key: "chromeFontSize",
        label: "Chrome Font Size",
        tooltip: "Font size for chart controls",
        kind: "number",
        placeholder: "Defaults to font size",
      },
      {
        key: "chromeFontWeight",
        label: "Chrome Font Weight",
        tooltip: "Font weight for chart controls",
        kind: "weight",
      },
      {
        key: "chromeSubtleTextColor",
        label: "Chrome Subtle Text",
        tooltip: "Colour of secondary text in chart controls",
        dark: "#888888",
        light: "#666666",
      },
    ],
  },
  {
    title: "Input Settings",
    tooltip: "Style text inputs in chart controls.",
    fields: [
      {
        key: "inputBackgroundColor",
        label: "Input Background",
        tooltip: "Background colour for text inputs",
        dark: "#1a1a1f",
        light: "#ffffff",
      },
      {
        key: "inputTextColor",
        label: "Input Text Color",
        tooltip: "Colour of text within text inputs",
        dark: "#ffffff",
        light: "#000000",
      },
    ],
  },
  {
    title: "Grid & Axis Settings",
    tooltip: "Style grid lines and axis elements.",
    fields: [
      {
        key: "gridLineColor",
        label: "Grid Line Color",
        tooltip: "Default colour for grid lines",
        dark: "#444444",
        light: "#dddddd",
      },
      {
        key: "axisColor",
        label: "Axis Color",
        tooltip: "Default colour for axis lines and ticks",
        dark: "#666666",
        light: "#333333",
      },
    ],
  },
  {
    title: "Crosshair Settings",
    tooltip: "Style crosshair labels showing values on hover.",
    fields: [
      {
        key: "crosshairLabelBackgroundColor",
        label: "Crosshair Label Background",
        tooltip: "Background colour of crosshair labels",
        dark: "#2a2a31",
        light: "#f6f6f6",
      },
      {
        key: "crosshairLabelTextColor",
        label: "Crosshair Label Text",
        tooltip: "Colour for text in crosshair labels",
        dark: "#ffffff",
        light: "#000000",
      },
    ],
  },
];
const weights = [
  "default",
  "normal",
  "bold",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];

function ParameterInput({
  field,
  state,
  themeMode,
  handleInputChange,
}: Props & { field: Parameter }) {
  const value = state[field.key];
  const change = handleInputChange(field.key, field.kind !== "number");
  if (field.kind === "family")
    return (
      <FontFamilyInput
        className="w-full"
        value={value as string}
        onChange={change}
        placeholder={field.placeholder}
      />
    );
  if (field.kind === "number")
    return (
      <Input
        type="number"
        className="w-full"
        value={(value ?? "") as number | string}
        onChange={change}
        placeholder={field.placeholder}
      />
    );
  if (field.kind === "weight")
    return (
      <Select
        className="w-full"
        value={(value || "default") as string}
        onValueChange={(v) => change(v === "default" ? "" : v)}
        options={weights.map((weight) => ({
          label: weight[0].toUpperCase() + weight.slice(1),
          value: weight,
        }))}
      />
    );
  return (
    <ColorPicker
      value={(value || field[themeMode]) as string}
      onChange={change}
      className="w-full"
    />
  );
}

export function ChartParameterControls(props: Props) {
  return (
    <>
      {sections.map((section) => (
        <SettingsMenu
          key={section.title}
          title={section.title}
          tooltip={section.tooltip}
          canCollapse={true}
        >
          <div className="grid w-full grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2">
            {section.fields.map((field) => (
              <Fragment key={field.key}>
                <Tooltip message={field.tooltip} className="max-w-[300px]">
                  <Label className="cursor-help">{field.label}:</Label>
                </Tooltip>
                <ParameterInput {...props} field={field} />
              </Fragment>
            ))}
          </div>
        </SettingsMenu>
      ))}
    </>
  );
}
