import * as HoverCard from "@radix-ui/react-hover-card";
import dayjs from "dayjs";
import {
  lazy,
  type MouseEvent as ReactMouseEvent,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useCellOnClickHandler } from "~/components/General/Table/hooks/useCellOnClickHandler";
import type { WidgetColumnDefT } from "~/components/types";
import { useWidgetContext } from "~/components/Widget.context";
import {
  formatNumber,
  formatNumberMagnitude,
  formatNumberThousands,
  parseMarkdownParams,
} from "~/lib/utils";
import {
  convertToReadableLabel,
  formatDate,
  formatObjectValue,
  isDate,
  isDateTime,
  isLink,
} from "./AgGridUtils";
import CellOnHover, { type CellOnHoverProps } from "./CellRenderers/CellOnHover";
import type {
  CellHoverCardProps,
  CellOnClickedProps,
  CellRendererProps,
  TriggerElementProps,
} from "./hooks/types";

const MarkdownContent = lazy(() =>
  import("~/components/Widgets/custom/Markdown").then((module) => ({
    default: module.MarkdownContent,
  })),
);

export const colDefFormatter = (
  params: CellRendererProps,
  options: {
    colDef?: WidgetColumnDefT;
    widgetId?: string;
    decimalPlaces?: number;
  } = {},
): CellOnHoverProps => {
  const { colDef, widgetId, decimalPlaces: globalDecimalPlaces = 3 } = options;
  const decimalPlaces = colDef?.decimalPlaces ?? globalDecimalPlaces;
  const { colorValueKey, colorRules } = colDef?.renderFnParams ?? {};

  const hasColorFns = colDef?.renderFn?.some((fn) =>
    ["columnColor", "greenRed"].includes(fn),
  );
  const color = hasColorFns || colorRules?.length > 0;
  const colorValue = color ? params?.data?.[colorValueKey] : undefined;

  const colorProps = { color, colorValue, colorRules };

  if (typeof params.value === "number" && colDef?.cellDataType !== "text") {
    colorProps.colorValue = colorValue ?? params.value;

    let title = params.value.toLocaleString();
    let value = params.value.toString();

    if (!colDef?.formatterFn || colDef?.formatterFn?.includes("int")) {
      value = formatNumber(params.value, decimalPlaces);
    }
    if (!colDef?.formatterFn || colDef?.formatterFn !== "none") {
      title = formatNumberThousands(params.value);
    }
    if (colDef?.formatterFn?.startsWith("normalized")) {
      const [int, decimals = "0"] = (params.value * 100).toString().split(".");
      const maxDecimals = params.value < 0.001 ? 6 : 2;
      value = `${int}.${decimals?.slice(0, Math.max(maxDecimals, decimalPlaces))}`;

      if (value === "0.00") value = "0";
      if (colDef?.formatterFn === "normalizedPercent") {
        value = `${value} %`;
      }
    }
    if (colDef?.formatterFn === "percent") {
      const [int, decimals = "0"] = params.value.toString().split(".");
      value = `${int}.${decimals?.slice(0, Math.max(2, decimalPlaces))} %`;
    }
    if (
      !["normalizedPercent", "percent"].includes(colDef?.formatterFn) &&
      ["income_statement", "balance_sheet", "cash_flow_statement"].includes(widgetId)
    ) {
      if (params.value > 1_000 || params.value < -1_000) {
        value = formatNumberMagnitude(params.value, 0, true, true);
      }
    }

    if (colDef?.prefix) {
      value = `${colDef.prefix}${value}`;
      title = `${colDef.prefix}${title}`;
    }
    if (colDef?.suffix) {
      value = `${value}${colDef.suffix}`;
      title = `${title}${colDef.suffix}`;
    }

    return { value, title, ...colorProps };
  }

  if (colDef?.renderFn?.includes("titleCase")) {
    const titleCase = convertToReadableLabel(params.value)
      .split(" ")
      .map((word: string) =>
        word
          .replace(/(\w{4,})/g, (match) => match.toLowerCase())
          .replace(/(\w{1})/, (match) => match.toUpperCase()),
      )
      .join(" ");
    return { value: titleCase, title: titleCase, ...colorProps };
  }

  if (
    (colDef?.prefix || colDef?.suffix) &&
    params.value !== null &&
    params.value !== undefined
  ) {
    let stringValue = params.value.toString();

    if (colDef?.prefix) {
      stringValue = `${colDef.prefix}${stringValue}`;
    }
    if (colDef?.suffix) {
      stringValue = `${stringValue}${colDef.suffix}`;
    }

    return { value: stringValue, title: stringValue, ...colorProps };
  }

  if (colDef?.cellDataType === "date" && isDate(params.value)) {
    return { value: formatDate(params.value), ...colorProps };
  }

  return { value: params.value, title: params.value, ...colorProps };
};

function getCellRenderer(
  params: CellRendererProps,
  widgetId: string,
  decimalPlaces: number,
) {
  const widgetColDefs = params?.widgetColDefs ?? {};
  const colField = params?.data?.Index ?? params.colDef?.colId ?? params.colDef?.field;

  const colDef = widgetColDefs?.[colField] ?? {};
  const chartDataType = colDef?.chartDataType ?? params?.colDef?.chartDataType;
  const cellDataType = colDef?.cellDataType ?? params?.colDef?.cellDataType;
  const isDateField =
    (colField?.toString()?.includes("date") || cellDataType === "date") &&
    chartDataType !== "series";

  if (params.value === null || params.value === undefined) return "-";

  function getElementProps() {
    const value = params.value?.value ?? params.value;
    const defaultProps: CellOnHoverProps = { value };

    if (widgetId === "eod_price" && colField === "date") return defaultProps;

    if (isDateField && isDateTime(value)) {
      const dateObj = dayjs(value);

      if (dateObj.format("HH:mm:ss").includes("00:00:00")) {
        defaultProps.value = dateObj.format("YYYY-MM-DD");
      }

      return defaultProps;
    }

    if (isDateField && isDate(value)) {
      let date = dayjs(value);

      if (colDef?.formatterFn === "dateToYear") {
        const { calendar_year, period } = params.data ?? {};
        const year = calendar_year ? calendar_year : date.year();

        if (period) {
          const quarter = Number.parseInt(period.replace("Q", ""), 10);
          date = dayjs().year(year).quarter(quarter);
        }

        return { value: date.format("YYYY-MM-DD") };
      }

      if (typeof params.value === "number") return defaultProps;

      return { value: formatDate(value) };
    }

    if (typeof value === "boolean") {
      return { value: value.toString() };
    }

    if (
      typeof value === "object" ||
      ((isDateField || cellDataType === "text") &&
        !(colDef?.formatterFn || colDef?.renderFn))
    ) {
      return { value: formatObjectValue(value) };
    }

    return colDefFormatter({ ...params, value }, { widgetId, decimalPlaces, colDef });
  }

  if (typeof params.value === "string" && isLink(params.value)) {
    return (
      <CellOnHover
        value={
          <a
            href={params.value}
            target="_blank"
            rel="noreferrer"
            className="obb-hyper-link underline-offset-2"
          >
            Open link
          </a>
        }
        title={params.value}
      />
    );
  }

  return <CellOnHover {...getElementProps()} />;
}

export const CustomCellRenderer = (params: CellRendererProps) => {
  const decimalPlacesToUse = params?.decimalPlacesToUse ?? 2;
  const colField = params?.colDef?.colId ?? params?.colDef?.field;

  const {
    widgetId: wId,
    storage: { selectedGroup, decimalDigits },
  } = useWidgetContext().widget;
  const widgetId = selectedGroup || wId;

  const decimalPlaces = decimalDigits ?? decimalPlacesToUse;

  return useMemo(() => {
    if (colField === "Index" && params?.transpose) {
      return params.valueFormatted;
    }

    return getCellRenderer(params, widgetId, decimalPlaces);
  }, [params.value, params.data, colField, widgetId, decimalPlaces]);
};

export function TriggerElement(params: TriggerElementProps) {
  const colField = params.colDef?.colId ?? params.colDef?.field;
  const colDef = params?.widgetColDefs?.[colField] ?? {};
  const hasCellOnClick = colDef?.renderFn?.includes("cellOnClick");

  const Component = hasCellOnClick ? CellOnClickRenderer : CustomCellRenderer;

  return <Component {...(params as CellOnClickedProps)} />;
}

export function HoverCardCellRenderer(params: CellHoverCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { value, markDownContent } = useMemo(() => {
    const { title, markdown, cellField = "value" } = params?.hoverCard ?? {};
    const isObject = typeof params.value === "object";
    const paramsKey = isObject ? "value" : "data";

    const defaultMarkdown = Object.entries((isObject && params.value) ?? {}).reduce(
      (acc, [key, value]) => {
        if (key === cellField) return acc;
        const label = convertToReadableLabel(key);
        acc += `- **${label}**: ${value ?? "-"}\n\n`;
        return acc;
      },
      title ? `## ${title}\n` : "",
    );

    const paramValues = { ...params[paramsKey], title };
    let markDownContent = parseMarkdownParams(
      markdown ?? defaultMarkdown,
      paramValues,
    )?.parsedValue;

    if (title && !markdown?.includes("{title}")) {
      markDownContent = `## ${title}\n${markDownContent}`;
    }

    const fieldValue = isObject ? params.value?.[cellField] : params.value;

    return { value: fieldValue ?? null, markDownContent };
  }, [params.value, params.hoverCard, params.data]);

  const hoverElements = useMemo(
    () => (
      <Suspense fallback={null}>
        <MarkdownContent content={markDownContent} />
      </Suspense>
    ),
    [markDownContent],
  );

  const triggerElement = <TriggerElement {...params} value={value} />;

  if (!markDownContent) return triggerElement;

  return (
    <span className="flex items-center w-full gap-1">
      <HoverCard.Root open={isOpen} openDelay={300} onOpenChange={setIsOpen}>
        <HoverCard.Trigger
          onClick={() => setIsOpen(true)}
          className="cursor-pointer flex items-center
          justify-center relative w-full no-underline whitespace-nowrap"
        >
          {triggerElement}
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content
            side="right"
            align="start"
            sideOffset={10}
            updatePositionStrategy="always"
            className="max-w-[400px] max-h-[300px] overflow-y-auto bottom-full mb-2 prose break-words
            prose-sm z-60 flex animate-fade-in flex-col
            gap-1 rounded bg-light-50 p-1.5 text-light-600
            text-xs dark:prose-invert font-medium dark:text-light-300
            prose-p:my-1 shadow dark:bg-dark-750 dark:shadow-[0_2px_10px_0_rgba(0,0,0,0.80)]
            prose-headings:mt-1"
          >
            {hoverElements}
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    </span>
  );
}

export function CellOnClickRenderer(params: CellOnClickedProps) {
  const handleCellOnClick = useCellOnClickHandler();

  const handleClick = useCallback(
    (event: ReactMouseEvent) => {
      event.stopPropagation();
      handleCellOnClick(params);
    },
    [handleCellOnClick, params],
  );

  return (
    <div
      onClick={handleClick}
      data-cell-on-click-renderer="true"
      className="cursor-pointer w-full h-full"
    >
      <CustomCellRenderer {...params} />
    </div>
  );
}
