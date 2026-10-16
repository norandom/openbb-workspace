import { currencyColumns } from "./CurrencyColumns";

export { formatPercentage } from "./CurrencyColumns";

import { keepPreviousData } from "@tanstack/react-query";
import type { GridOptions } from "ag-grid-community";
import { useCallback, useMemo, useState } from "react";
import DraggableCard from "~/components/DraggableCard";
import {
  getContextMenuItems,
  getTimezoneCompact,
} from "~/components/General/Table/AgGridUtils";
import { AgGridProvider, useColumnVisibility } from "~/components/General/Table/hooks";
import TableSettings from "~/components/General/Table/SubMenus/TableSettings";
import { useWidgetContext } from "~/components/Widget.context";
import {
  useCurrencySnapshots,
  useEquityPricePerformance,
} from "~/lib/api/sdkComponents";
import type { FMPCurrencySnapshotsData } from "~/lib/api/sdkSchemas";
import { useShallowThemeStore } from "~/lib/state/theme";
import DropdownCheckboxItems from "../Helpers/DropdownCheckboxItems";

export default function CurrencySnapshot() {
  const { widget, updateWidget } = useWidgetContext();

  const decimalDigits = useShallowThemeStore((s) => s.decimalDigits);
  const decimalDigitsToUse = widget?.storage?.decimalDigits ?? decimalDigits;

  const [decimalDigitsSettings, setDecimalDigitsSettings] =
    useState(decimalDigitsToUse);

  const allPairs = useMemo(() => {
    const baseCurrencies = widget?.storage?.params?.base || [];
    const quoteCurrencies = widget?.storage?.params?.counter_currencies || [];
    const pairs = baseCurrencies.flatMap((base) =>
      quoteCurrencies.map((quote) => `${base}${quote}`),
    );
    return pairs;
  }, [widget?.storage?.params?.base, widget?.storage?.params?.counter_currencies]);

  const pairsExist = useMemo(
    () => allPairs?.length > 0 && allPairs !== undefined,
    [allPairs],
  );

  const { data: snapshotsQuery, isLoading } = useCurrencySnapshots(
    {
      queryParams: {
        base: widget?.storage?.params?.base?.join(","),
        provider: "fmp",
        counter_currencies: widget?.storage?.params?.counter_currencies?.join(","),
      },
    },
    {
      staleTime: 1000 * 60 * 5,
      enabled: pairsExist,
    },
  ) as { data: { results: FMPCurrencySnapshotsData[] }; isLoading: boolean };

  const currencySnapshots = snapshotsQuery?.results;

  const { data: quoteQuery } = useEquityPricePerformance(
    {
      queryParams: {
        provider: "fmp",
        symbol: allPairs.join(","),
      },
    },
    {
      enabled: pairsExist,
      staleTime: 1000 * 60 * 5,
      placeholderData: keepPreviousData,
    },
  );

  const quoteData = quoteQuery?.results;

  const combinedData = useMemo(() => {
    if (!(currencySnapshots && quoteData)) return [];

    return currencySnapshots.map((snapshot) => {
      const quote = quoteData.find(
        (q) => `${snapshot.base_currency}${snapshot.counter_currency}` === q.symbol,
      );

      return {
        ...snapshot,
        change_percent:
          snapshot?.change_percent == null ? null : snapshot.change_percent * 100,
        symbol: `${snapshot.base_currency}/${snapshot.counter_currency}`,
        one_day: quote?.one_day == null ? null : quote.one_day * 100,
        one_week: quote?.one_week == null ? null : quote.one_week * 100,
        one_month: quote?.one_month == null ? null : quote.one_month * 100,
        three_month: quote?.three_month == null ? null : quote.three_month * 100,
        six_month: quote?.six_month == null ? null : quote.six_month * 100,
        ytd: quote?.ytd == null ? null : quote.ytd * 100,
        one_year: quote?.one_year == null ? null : quote.one_year * 100,
        three_year: quote?.three_year == null ? null : quote.three_year * 100,
        five_year: quote?.five_year == null ? null : quote.five_year * 100,
        ten_year: quote?.ten_year == null ? null : quote.ten_year * 100,
        max: quote?.max == null ? null : quote.max * 100,
      };
    });
  }, [currencySnapshots, quoteData]);

  const timezone = getTimezoneCompact();

  const columnDefs = useMemo(
    () => currencyColumns(decimalDigitsToUse, timezone),
    [decimalDigitsToUse, timezone],
  );

  const gridOptions = useMemo(() => {
    return {
      rowHeight: 32,
      headerHeight: 32,
    } as GridOptions<any>;
  }, []);

  const contextMenuItems = useCallback(
    (params) =>
      getContextMenuItems(params, { enableChart: false, widgetId: widget?.id }),
    [],
  );
  const createPairs = useCallback(
    (baseCurrencies: string[], quoteCurrencies: string[]) => {
      const base = Array.from(new Set(baseCurrencies));
      const quote = Array.from(new Set(quoteCurrencies));
      return base.flatMap((baseCurrency) =>
        quote.map((quoteCurrency) => `${baseCurrency}${quoteCurrency}`),
      );
    },
    [],
  );

  const handleSave = useColumnVisibility(decimalDigitsSettings);

  return (
    <DraggableCard
      aiData={combinedData}
      aiEnabled={true}
      loading={isLoading && pairsExist}
      error={!pairsExist}
      errorMessage="Select a base currency and quote currency to view data"
      showActionsSettings={true}
      onSaveSettings={handleSave}
      settingsModalChildren={
        <TableSettings
          decimalDigitsSettings={decimalDigitsSettings}
          setDecimalDigitsSettings={setDecimalDigitsSettings}
        />
      }
      elementNextToTitle={
        <>
          <DropdownCheckboxItems
            items={CURRENCIES.map((currency) => ({
              label: currency,
              value: currency,
            }))}
            triggerLabel="Base Currency"
            onSelect={(value, checked) => {
              const base = widget?.storage?.params?.base ?? [];
              const counterCurrencies =
                widget?.storage?.params?.counter_currencies ?? [];
              updateWidget((prev) => ({
                ...prev,
                storage: {
                  ...prev.storage,
                  params: {
                    ...(prev?.storage?.params ?? {}),
                    base: checked ? [...base, value] : base.filter((c) => c !== value),
                    symbol: createPairs([...base, value], counterCurrencies),
                  },
                },
              }));
            }}
            selected={widget.storage.params.base ?? []}
          />
          <DropdownCheckboxItems
            items={CURRENCIES.map((currency) => ({
              label: currency,
              value: currency,
            }))}
            triggerLabel="Quote Currency"
            onSelect={(value, checked) => {
              const base = widget?.storage?.params?.base ?? [];
              const counterCurrencies =
                widget?.storage?.params?.counter_currencies ?? [];
              updateWidget((prev) => ({
                ...prev,
                storage: {
                  ...prev.storage,
                  params: {
                    ...(prev?.storage?.params ?? {}),
                    counter_currencies: checked
                      ? [...counterCurrencies, value]
                      : counterCurrencies.filter((c) => c !== value),
                    symbol: createPairs(base, [...counterCurrencies, value]),
                  },
                },
              }));
            }}
            selected={widget.storage.params.counter_currencies ?? []}
          />
        </>
      }
    >
      {pairsExist && widget?.storage?.params?.base?.length > 0 && (
        <div className="grid h-[calc(100%-5px)] min-h-[100px]">
          <AgGridProvider
            gridOptions={gridOptions}
            enableCharts={false}
            rowData={combinedData}
            columnDefs={columnDefs}
            getContextMenuItems={contextMenuItems}
          />
        </div>
      )}
    </DraggableCard>
  );
}

export const CURRENCIES = [
  "USD",
  "EUR",
  "JPY",
  "GBP",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "XAU",
  "XAG",
  "AED",
  "ARS",
  "BRL",
  "CLP",
  "CZK",
  "DKK",
  "EGP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "KES",
  "KRW",
  "KZT",
  "LBP",
  "MXN",
  "MYR",
  "NGN",
  "NOK",
  "NZD",
  "PLN",
  "QAR",
  "RON",
  "RUB",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "TWD",
  "ZAR",
];

export const CURRENCY_EMOJIS = {
  EUR: "🇪🇺",
  USD: "🇺🇸",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  CNY: "🇨🇳",
  NZD: "🇳🇿",
};
