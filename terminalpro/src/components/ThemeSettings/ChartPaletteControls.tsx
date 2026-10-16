import { Button } from "~/components/ds/atoms/Button";
import { Label } from "~/components/ds/atoms/Label";
import { ColorPicker } from "~/components/ds/molecules/ColorPicker";
import SettingsMenu from "../ds/molecules/SettingsMenu";
import Icon from "../Icon";
import type { useChartSettings } from "./useChartSettings";

type Props = Pick<
  ReturnType<typeof useChartSettings>,
  "state" | "addColor" | "removeColor" | "handleColorArrayChange"
>;

export function ChartPaletteControls({
  state,
  addColor,
  removeColor,
  handleColorArrayChange,
}: Props) {
  return (
    <SettingsMenu
      title="Palette"
      tooltip="Fill colors style chart elements; stroke colors style their outlines."
      canCollapse={true}
    >
      <div className="w-full flex flex-col gap-2">
        <div className="flex flex-row items-center gap-2">
          <Label className="flex-1">Fill Color</Label>
          <Label className="flex-1">Stroke Color</Label>
          <Button
            size="xs"
            variant="outlined"
            className="h-[30px]"
            onClick={addColor}
            aria-label="Add palette color"
          >
            <Icon id="plus" className="size-3.5" />
          </Button>
        </div>
        {state.fills.map((color, index) => (
          <div key={index} className="flex flex-row items-center gap-2">
            <ColorPicker
              value={color}
              onChange={handleColorArrayChange("fills", index)}
              className="flex-1"
              clearable={false}
            />
            <ColorPicker
              value={state.strokes[index]}
              onChange={handleColorArrayChange("strokes", index)}
              className="flex-1"
              clearable={false}
            />
            {state.fills.length > 1 && (
              <Button
                size="xs"
                variant="outlined"
                className="h-[30px]"
                onClick={() => removeColor(index)}
                aria-label={`Remove palette color ${index + 1}`}
              >
                <Icon id="trash-04" className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </SettingsMenu>
  );
}
