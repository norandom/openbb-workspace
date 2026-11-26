import { Input } from "~/components/ds/atoms/Input";
import { Select } from "~/components/ds/atoms/Select";
import type { StorySelection } from "~/lib/modeling/storyState";

const commodities = [
  { value: "DBC", label: "DBC · Broad commodity futures" },
  { value: "GLD", label: "GLD · Gold bullion" },
];
const technology = [
  { value: "XLK", label: "XLK · S&P 500 information technology" },
  { value: "VGT", label: "VGT · US information technology across market caps" },
];

type Props = {
  selection: StorySelection;
  readOnly: boolean;
  onChange: (selection: StorySelection) => void;
};

export function ResearchStoryControls({ selection, readOnly, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Select<StorySelection["commodity_symbol"]>
        label="Commodity proxy"
        size="sm"
        options={commodities}
        value={selection.commodity_symbol}
        disabled={readOnly}
        onChange={(commodity_symbol) => onChange({ ...selection, commodity_symbol })}
      />
      <Select<StorySelection["technology_symbol"]>
        label="Technology proxy"
        size="sm"
        options={technology}
        value={selection.technology_symbol}
        disabled={readOnly}
        onChange={(technology_symbol) => onChange({ ...selection, technology_symbol })}
      />
      <Input
        label="Observation date"
        size="sm"
        type="date"
        value={selection.observation_date}
        readOnly={readOnly}
        clearable={false}
        onChange={(observation_date) => {
          if (observation_date) onChange({ ...selection, observation_date });
        }}
      />
    </div>
  );
}
