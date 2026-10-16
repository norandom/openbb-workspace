import dayjs from "dayjs";
import ExcelJS from "exceljs";
import Papa, { type ParseConfig } from "papaparse";
import { formatNumberNoMagnitude, magnitudeRegex, numberRegex } from "~/lib/utils";
export type Sheet = { name: string; id: number };
export async function getCSVData(data: string, resolve: (value: object[]) => void) {
  const config = {
    transformHeader(header, index) {
      const newHeader = header.trim();
      if (newHeader === "") {
        return `Column ${index + 1}`;
      }
      return newHeader;
    },
    complete: (result: { data: object[] }) => {
      // Check if the CSV has a single column
      const isSingleColumn =
        result.data.length > 0 && Object.keys(result.data[0]).length === 1;

      // This filter prevents Papa Parse from adding an extra blank row to the end
      const final = result.data.filter((value) => {
        // If it's a single-column CSV, just check if the value is not an empty string
        if (isSingleColumn) {
          return Object.values(value)[0] !== "";
        }
        // Otherwise, apply the original filter logic
        return !(Object.keys(value).length < 2 && Object.values(value)[0] !== "");
      });
      resolve(final);
    },
    header: true,
    dynamicTyping: true,
  } as ParseConfig;
  Papa.parse(data, config);
}

export async function getExcelWorkBook(
  arrayBuffer: ArrayBuffer,
  resolve: (args: { workbook: ExcelJS.Workbook; sheets: Sheet[] }) => void,
  reject: (reason?: any) => void,
) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheets = workbook.worksheets
      .filter((sheet) => sheet.name !== "EPMFormattingSheet")
      .map((sheet) => ({
        name: sheet.name,
        id: sheet.id,
      }));

    resolve({ workbook, sheets });
  } catch (error) {
    console.error("Error processing Excel file:", error);
    reject(new Error("Error processing Excel file"));
  }
}

function getCellValue(cell: ExcelJS.Cell) {
  let value = cell?.result ? cell?.result : cell?.value;

  // cool regex to match things like integers, decimals, scientific notation
  if (typeof value === "string") {
    if (value.match(numberRegex)) {
      value = Number.parseFloat(value);
    } else if (value.match(magnitudeRegex)) {
      value = formatNumberNoMagnitude(value);
    }
  }

  if (value instanceof Date) {
    value = dayjs(value).format("YYYY-MM-DD");
  }

  // @ts-expect-error
  if (cell?.result?.error) return null;

  return cell?.formula ? cell?.result : value;
}

export async function getExcelData(
  workbook: ExcelJS.Workbook,
  currentSheet: Sheet,
  setData: (value: object[]) => void,
  reject?: (reason?: any) => void,
) {
  try {
    const worksheet = workbook.getWorksheet(currentSheet.id);
    let headerRow: ExcelJS.Row | null = null;
    let headerRowNumber = 0;
    const hasValue = new Set<string>();

    const result = [];
    worksheet.eachRow((row, rowNumber) => {
      // Find the header row
      if (!headerRow) {
        const headers = [];
        row.eachCell((cell) => {
          const result = cell.result ? cell.result : cell.value;

          if (![null, undefined].some((value) => value === result)) {
            headers.push(result);
          }
        });

        if (headers.length > 1) {
          headerRow = row;
          headerRowNumber = rowNumber + 1;

          const firstRowData = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const colName = getCellValue(cell);

            const key: string = JSON.stringify(
              colName ? colName : `Column ${colNumber}`,
            );

            const nextRow = worksheet.getRow(rowNumber + 1);
            const nextCell = nextRow.getCell(colNumber);
            const newValue = getCellValue(nextCell);

            worksheet
              .getColumn(colNumber)
              .eachCell(
                { includeEmpty: true },
                (cell, _colNumber) => getCellValue(cell) && hasValue.add(key),
              );

            if (newValue !== undefined) firstRowData[key] = newValue;
          });

          result.push(firstRowData);
          return;
        }
      }
      if (rowNumber <= headerRowNumber) return;

      const obj: Record<string, any> = {};

      if (!headerRow) return;

      row.eachCell((cell, colNumber) => {
        const headerCell = headerRow.findCell(colNumber);
        const colName = getCellValue(headerCell);

        const key: string = JSON.stringify(colName ? colName : `Column ${colNumber}`);

        obj[key] = getCellValue(cell);
      });

      result.push(obj);
    });

    for (const [key, value] of Object.entries(result[0] || {})) {
      if (!hasValue.has(key)) {
        delete result[0][key];
      }
    }

    setData(result);
  } catch (error) {
    console.error("Error processing Excel file:", error);
    reject?.(`Error processing Excel file: ${error?.message}`);
  }
}
