import { useId } from "react";
import type { ChartTypeGalleryGroup } from "./chartTypeGalleryCatalog";
import { ChartTypeThumbnail } from "./ChartTypeThumbnail";
import "./chartTypeGallery.css";

export interface ChartTypeGalleryProps {
  groups: readonly ChartTypeGalleryGroup[];
  selectedType: string | undefined;
  onSelect: (modelType: string) => void;
}

export function ChartTypeGallery({ groups, selectedType, onSelect }: ChartTypeGalleryProps) {
  const id = useId();
  return (
    <div className="chart-type-gallery" role="region" aria-label="Chart types">
      {groups.map((group, index) => (
        <section key={group.name} aria-labelledby={`${id}-${index}`}>
          <h3 id={`${id}-${index}`}>{group.name}</h3>
          <div className="chart-type-gallery-grid">
            {group.items.map((item) => (
              <button
                key={item.modelType}
                type="button"
                title={item.name}
                aria-label={`${item.name}${selectedType === item.modelType ? ". Selected" : ""}`}
                aria-pressed={selectedType === item.modelType}
                onClick={() => onSelect(item.modelType)}
              >
                <ChartTypeThumbnail modelType={item.modelType} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
