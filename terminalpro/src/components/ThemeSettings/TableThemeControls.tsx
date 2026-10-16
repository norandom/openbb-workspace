import { FontFamilyInput } from "~/components/ds/atoms/FontFamilyInput";
import { Input } from "~/components/ds/atoms/Input";
import { Label } from "~/components/ds/atoms/Label";
import { Select } from "~/components/ds/atoms/Select";
import { SpacingInput } from "~/components/ds/atoms/SpacingInput";
import { ColorPicker } from "~/components/ds/molecules/ColorPicker";
import SettingsMenu from "../ds/molecules/SettingsMenu";
export function TableThemeControls({
  state,
  themesState,
  handleInputChange,
  handleIconSetChange,
  iconSets,
}: any) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsMenu title="General" canCollapse={true}>
        <div className="grid w-full grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2">
          <Label htmlFor="font-family" className="justify-self-start">
            Font Family:
          </Label>
          <FontFamilyInput
            className="w-full"
            value={state.fontFamily}
            onChange={handleInputChange("fontFamily")}
            placeholder="Select font family..."
          />
          <Label htmlFor="font-size" className="justify-self-start">
            Font Size:
          </Label>
          <SpacingInput
            className="w-full"
            value={state.fontSize}
            onChange={handleInputChange("fontSize")}
          />
          <Label htmlFor="background-color" className="justify-self-start">
            Background Color:
          </Label>
          <ColorPicker
            value={
              state.backgroundColor ||
              (themesState.themeMode === "dark" ? "#1a1a1f" : "#ffffff")
            }
            onChange={handleInputChange("backgroundColor")}
            className="w-full"
          />
          <Label htmlFor="chrome-background-color" className="justify-self-start">
            Chrome Background Color:
          </Label>
          <ColorPicker
            value={state.chromeBackgroundColor}
            onChange={handleInputChange("chromeBackgroundColor")}
            className="w-full"
          />
          <Label htmlFor="header-background-color" className="justify-self-start">
            Row Group Panel Background Color:
          </Label>
          <ColorPicker
            value={state.headerBackgroundColor}
            onChange={handleInputChange("headerBackgroundColor")}
            className="w-full"
          />
          {/* <Label htmlFor="side-bar-bg-color" className="justify-self-start">
            Side Bar Background Color:
          </Label>
          <ColorPicker
            value={state.sideBarBackgroundColor}
            onChange={handleInputChange("sideBarBackgroundColor")}
            className="w-full"
          />
          <Label htmlFor="side-bar-buttons-bg-color" className="justify-self-start">
            Side Bar Buttons Background Color:
          </Label>
          <ColorPicker
            value={state.sideButtonBarBackgroundColor}
            onChange={handleInputChange("sideButtonBarBackgroundColor")}
            className="w-full"
          /> */}
          <Label htmlFor="accent-color" className="justify-self-start">
            Accent Color:
          </Label>
          <ColorPicker
            value={state.accentColor || "#337dba"}
            onChange={handleInputChange("accentColor")}
            className="w-full"
          />
        </div>
      </SettingsMenu>

      <SettingsMenu title="Borders & Spacing" canCollapse={true}>
        <div className="grid w-full grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2">
          <Label htmlFor="border-color" className="justify-self-start">
            Border Color:
          </Label>
          <ColorPicker
            value={
              state.borderColor ||
              (themesState.themeMode === "dark" ? "#444444" : "#dddddd")
            }
            onChange={handleInputChange("borderColor")}
            className="w-full"
          />
          <Label htmlFor="spacing" className="justify-self-start">
            Spacing:
          </Label>
          <SpacingInput
            className="w-full"
            value={state.spacing}
            onChange={handleInputChange("spacing")}
          />
          <Label htmlFor="wrapper-radius" className="justify-self-start">
            Wrapper Radius:
          </Label>
          <SpacingInput
            className="w-full"
            value={state.wrapperBorderRadius}
            onChange={handleInputChange("wrapperBorderRadius")}
          />
          <Label htmlFor="widget-radius" className="justify-self-start">
            Widget Radius:
          </Label>
          <SpacingInput
            className="w-full"
            value={state.borderRadius}
            onChange={handleInputChange("borderRadius")}
          />
        </div>
      </SettingsMenu>

      <SettingsMenu title="Header" canCollapse={true}>
        <div className="grid w-full grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2">
          <Label htmlFor="header-bg-color" className="justify-self-start">
            Background Color:
          </Label>
          <ColorPicker
            value={
              state.altHeaderBackgroundColor ||
              (themesState.themeMode === "dark" ? "#2a2a31" : "#f6f6f6")
            }
            onChange={handleInputChange("altHeaderBackgroundColor")}
            className="w-full"
          />
          <Label htmlFor="header-text-color" className="justify-self-start">
            Text Color:
          </Label>
          <ColorPicker
            value={
              state.headerTextColor ||
              (themesState.themeMode === "dark" ? "#ffffff" : "#000000")
            }
            onChange={handleInputChange("headerTextColor")}
            className="w-full"
          />
          <Label htmlFor="header-font-family" className="justify-self-start">
            Font Family:
          </Label>
          <FontFamilyInput
            className="w-full"
            value={state.headerFontFamily}
            onChange={handleInputChange("headerFontFamily")}
            placeholder="Select font family..."
          />
          <Label htmlFor="header-font-size" className="justify-self-start">
            Font Size:
          </Label>
          <SpacingInput
            className="w-full"
            value={state.headerFontSize}
            onChange={handleInputChange("headerFontSize")}
          />
          <Label htmlFor="header-vert-padding" className="justify-self-start">
            Vertical Padding:
          </Label>
          <Input
            type="number"
            className="w-full"
            value={state.headerVerticalPaddingScale || "1.50"}
            onChange={handleInputChange("headerVerticalPaddingScale", false)}
          />
        </div>
      </SettingsMenu>

      <SettingsMenu title="Cells" canCollapse={true}>
        <div className="grid w-full grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2">
          <Label htmlFor="cell-text-color" className="justify-self-start">
            Cell Text Color:
          </Label>
          <ColorPicker
            value={
              state.cellTextColor ||
              (themesState.themeMode === "dark" ? "#ffffff" : "#000000")
            }
            onChange={handleInputChange("cellTextColor")}
            className="w-full"
          />
          <Label htmlFor="odd-row-bg" className="justify-self-start">
            Even Row Background:
          </Label>
          <ColorPicker
            value={state.evenRowBackgroundColor}
            onChange={handleInputChange("evenRowBackgroundColor")}
            className="w-full"
          />
          <Label htmlFor="odd-row-bg" className="justify-self-start">
            Odd Row Background:
          </Label>
          <ColorPicker
            value={
              state.oddRowBackgroundColor ||
              (themesState.themeMode === "dark" ? "#2a2a31" : "#f6f6f6")
            }
            onChange={handleInputChange("oddRowBackgroundColor")}
            className="w-full"
          />
          <Label htmlFor="cell-vert-padding" className="justify-self-start">
            Vertical Padding:
          </Label>
          <Input
            min={0.5}
            type="number"
            className="w-full"
            value={state.rowVerticalPaddingScale || "1.0"}
            onChange={handleInputChange("rowVerticalPaddingScale", false)}
          />
          <Label htmlFor="cell-horiz-padding" className="justify-self-start">
            Horizontal Padding:
          </Label>
          <SpacingInput
            type="number"
            className="w-full"
            value={state.cellHorizontalPadding}
            onChange={handleInputChange("cellHorizontalPadding")}
          />
        </div>
      </SettingsMenu>

      <SettingsMenu title="Icons" canCollapse={true}>
        <div className="grid w-full grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2">
          <Label htmlFor="icon-set" className="justify-self-start">
            Icon Set:
          </Label>
          <Select
            className="w-full"
            value={state.selectedIconSet.id}
            onValueChange={handleIconSetChange}
            options={iconSets.map((set) => ({
              label: set.label,
              value: set.id,
            }))}
          />
          <Label htmlFor="icon-size" className="justify-self-start">
            Icon Size:
          </Label>
          <SpacingInput
            className="w-full"
            value={state.iconSize}
            onChange={handleInputChange("iconSize")}
          />
        </div>
      </SettingsMenu>
    </div>
  );
}
