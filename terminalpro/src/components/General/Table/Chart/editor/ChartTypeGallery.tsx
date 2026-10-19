import { useId, useLayoutEffect, useRef } from "react";
import type { ChartTypeGalleryGroup } from "./chartTypeGalleryCatalog";
import { ChartTypeThumbnail } from "./ChartTypeThumbnail";
import "./chartTypeGallery.css";

export interface ChartTypeGalleryProps {
  groups: readonly ChartTypeGalleryGroup[];
  selectedType: string | undefined;
  onSelect: (modelType: string) => void;
  scrollPositionRef?: { current: number };
  visible?: boolean;
}

export function ChartTypeGallery({ groups, selectedType, onSelect, scrollPositionRef, visible = true }: ChartTypeGalleryProps) {
  const id = useId();
  const gallery = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (visible && gallery.current && scrollPositionRef)
      gallery.current.scrollTop = scrollPositionRef.current;
  }, [visible, scrollPositionRef]);
  return (
    <div ref={gallery} className="chart-type-gallery" role="region" aria-label="Chart types"
      onScroll={event => {
        if (visible && event.currentTarget.clientHeight > 0 && scrollPositionRef)
          scrollPositionRef.current = event.currentTarget.scrollTop;
      }}>
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
