import dayjs from "dayjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d*)?/;
const isYearOrDateRegex = /(^|_)(year|date|day)/i;

export function isDate(value: any): boolean {
  return datePattern.test(value?.toString()) && dayjs(value).isValid();
}

export function isDateTime(value: any): boolean {
  return dateTimePattern.test(value?.toString()) && dayjs(value).isValid();
}

export function isDateorYearField(key: string): boolean {
  return isYearOrDateRegex.test(key);
}

export function isBigNumber(value: unknown): boolean {
  return typeof value === "number" && (value > 1000000 || value < -1000000);
}

export function isLink(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("http");
}

export function formatDate(date: dayjs.ConfigType, template = "YYYY-MM-DD"): string {
  // Use UTC mode to avoid timezone shifts when formatting dates
  return dayjs.utc(date).format(template);
}

export function formatTime(date: dayjs.ConfigType): string {
  return dayjs(date).format("hh:mm A");
}

export function getTimezoneCompact() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function convertToReadableLabel(key: string): string {
  return key
    ?.toString()
    ?.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    ?.replace(/([a-z\d])([A-Z])/g, "$1 $2")
    ?.replace(/_/g, " ")
    ?.replace(/\b\w/g, (char) => char?.toUpperCase());
}

export function extractYearOrReturnInput(input: string): string {
  const pattern = /^(\d{4})-\d{2}-\d{2}$/;
  const match = input.match(pattern);
  return match ? match[1] : input;
}

export function determineFilterType(
  cellDataType: string | undefined | boolean,
  key: string,
  firstValue: unknown,
): "agNumberColumnFilter" | "agTextColumnFilter" | "agDateColumnFilter" {
  if (cellDataType) {
    if (cellDataType === "number") {
      return "agNumberColumnFilter";
    }
    if (cellDataType === "date" || key.toLocaleLowerCase().includes("date")) {
      return "agDateColumnFilter";
    }
    return "agTextColumnFilter"; // default to text filter for specified cellDataType
  }
  // if cellDataType does not exist, infer from data
  if (typeof firstValue === "number") {
    return "agNumberColumnFilter";
  }
  if (isDate(firstValue) || key.toLocaleLowerCase().includes("date")) {
    return "agDateColumnFilter";
  }
  return "agTextColumnFilter"; // default to text filter when inferring
}

export function inferDataType(
  value: unknown,
  key: string,
): "number" | "object" | "boolean" | "link" | "date" | "text" {
  function processDefault(key: string): "date" | "text" {
    if (isDateorYearField(key)) {
      return "date";
    }
    return "text";
  }

  function processString(value: string): "link" | "date" | "text" {
    if (isLink(value)) {
      return "link";
    }
    // Check if the string matches a specific date pattern
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (datePattern.test(value) && isDate(value)) {
      return "date";
    }

    return processDefault(key);
  }

  switch (typeof value) {
    case "number":
      return "number";
    case "object":
      return "object";
    case "boolean":
      return "boolean";
    case "string":
      return processString(value);
    default:
      return processDefault(key);
  }
}

export function getDateFilterParams() {
  return {
    buttons: ["apply", "clear"],
    closeOnApply: true,
    defaultOption: "inRange",
    comparator: (
      filterLocalDateAtMidnight: Date,
      cellValue: string | number | Date,
    ) => {
      if (typeof cellValue === "number" && cellValue.toString().length === 4)
        cellValue = new Date(cellValue, 0, 1);

      if (!dayjs(cellValue).isValid()) {
        return 0;
      }
      const cellDate = dayjs(cellValue).toDate();
      if (cellDate < filterLocalDateAtMidnight) {
        return -1;
      }
      if (cellDate > filterLocalDateAtMidnight) {
        return 1;
      }
      return 0;
    },
  };
}

export function formatObjectValue<T>(value: T): string | T {
  if (value === null || value === undefined) return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return value
      ?.map((v) => (typeof v === "object" ? JSON.stringify(v) : v))
      ?.join(", ");
  }

  return value;
}

export function inferChartDataType(
  value: unknown,
  { isDateCol, isIndex }: { isDateCol?: boolean; isIndex?: boolean } = {},
): "category" | "series" {
  if (isDateCol || isIndex || typeof value === "string") {
    return "category";
  }
  if (typeof value === "number") {
    return "series";
  }

  return "category";
}
